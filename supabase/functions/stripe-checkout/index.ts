// stripe-checkout — POST { event_id, success_url?, cancel_url? }
// Authenticated host. Creates a Stripe Checkout Session for the SMS plan:
// $10 base (up to 10 guests) + $1 per extra guest; top-ups after payment
// charge only newly-added over-allowance guests.
//
// ADMINS run in Stripe TEST mode (secret STRIPE_SECRET_KEY_TEST) so they can
// exercise the whole payment flow with a test card (4242 4242 4242 4242) and
// no real charge. Test mode builds line items from price_data, so no test-mode
// Price IDs are needed. If the test secret isn't set, admins fall back to live.
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { adminClient, userClient, env } from "../_shared/clients.ts";
import { preflight, json } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  try {
    const { event_id, success_url, cancel_url } = await req.json();
    const auth = req.headers.get("Authorization") || "";
    const { data: { user } } = await userClient(auth).auth.getUser();
    if (!user) return json({ error: "unauthorized" }, 401);

    const db = adminClient();
    const { data: event } = await db.from("events").select("*").eq("id", event_id).single();
    if (!event || event.host_id !== user.id) return json({ error: "not found" }, 404);

    // Admin → Stripe test mode (never a real charge). If an admin somehow
    // reaches checkout without test keys configured, REFUSE rather than fall
    // back to a live charge.
    const { data: prof } = await db.from("profiles").select("role").eq("id", user.id).maybeSingle();
    const isAdmin = prof?.role === "admin";
    const testKey = Deno.env.get("STRIPE_SECRET_KEY_TEST");
    if (isAdmin && !testKey) {
      return json({ error: "Admin checkout runs in Stripe test mode — set STRIPE_SECRET_KEY_TEST first. No live charge was made." }, 400);
    }
    const isTest = isAdmin && !!testKey;
    const stripe = new Stripe(isTest ? testKey! : env("STRIPE_SECRET_KEY"), {
      apiVersion: "2024-06-20",
      httpClient: Stripe.createFetchHttpClient(),
    });

    const { count } = await db.from("guests")
      .select("*", { count: "exact", head: true }).eq("event_id", event_id);
    const guestCount = count ?? 0;

    // Stripe Price IDs (one-time) — live and test each have their own $10 base
    // and $1 extra-guest Price. Overridable via env; defaults are the products
    // in the Stripe account. Test IDs are used only for admins (isTest).
    const basePrice = isTest
      ? (Deno.env.get("STRIPE_PRICE_BASE_TEST") || "price_1Tq5k6L3t6lGRaBqGZ9CHITQ")
      : (Deno.env.get("STRIPE_PRICE_BASE") || "price_1To0F0L3t6lGRaBqic1AbuER");
    const extraPrice = isTest
      ? (Deno.env.get("STRIPE_PRICE_EXTRA_TEST") || "price_1Tq5kwL3t6lGRaBq6d6uES3M")
      : (Deno.env.get("STRIPE_PRICE_EXTRA") || "price_1To0FJL3t6lGRaBqNN9syoTe");

    // `BASE_INCLUDED` guests are covered by the one-time base fee; everyone
    // beyond that is billed per head. (cents used only for the payments record.)
    const included = Number(Deno.env.get("STRIPE_BASE_INCLUDED") ?? 10);
    const base = Number(Deno.env.get("PRICE_BASE_CENTS") ?? 1000);
    const per = Number(Deno.env.get("PRICE_PER_GUEST_CENTS") ?? 100);

    const baseItem = (): Stripe.Checkout.SessionCreateParams.LineItem => ({ price: basePrice, quantity: 1 });
    const extraItem = (qty: number): Stripe.Checkout.SessionCreateParams.LineItem => ({ price: extraPrice, quantity: qty });

    // First payment charges the base + $1 for every guest beyond `included`.
    // A later payment (guests added after the event was already paid for) is a
    // TOP-UP: no second base fee — just $1 for each *newly* over-`included` head
    // that hasn't been billed yet, computed from guest_count_at_payment.
    const alreadyPaid = !!event.paid_at;
    const paidCount = event.guest_count_at_payment ?? 0;
    const currExtra = Math.max(0, guestCount - included);
    const paidExtra = Math.max(0, paidCount - included);

    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];
    let amount: number;
    if (!alreadyPaid) {
      lineItems.push(baseItem());
      if (currExtra > 0) lineItems.push(extraItem(currExtra));
      amount = base + per * currExtra;
    } else {
      const newExtra = Math.max(0, currExtra - paidExtra);
      // Nothing new to bill (still within the base allowance): let the caller
      // send the new invites directly — the event is already paid.
      if (newExtra <= 0) return json({ nothing_owed: true, amount_cents: 0 });
      lineItems.push(extraItem(newExtra));
      amount = per * newExtra;
    }

    const site = (Deno.env.get("PUBLIC_SITE_URL") || "").replace(/\/$/, "");
    // Query param BEFORE the hash so the SPA hash route stays clean
    // (`#/event/<id>`) and lands on the event; `?paid=1` shows a receipt toast.
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: lineItems,
      customer_email: user.email ?? undefined,
      success_url: success_url || `${site}/index.html?paid=1#/event/${event_id}`,
      cancel_url: cancel_url || `${site}/index.html#/event/${event_id}`,
      metadata: { event_id, guest_count: String(guestCount), mode: isTest ? "test" : "live" },
    });

    await db.from("payments").insert({
      event_id, stripe_session_id: session.id, amount_cents: amount, status: "pending", is_test: isTest,
    });
    return json({ url: session.url, test: isTest });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
