// stripe-checkout — POST { event_id, success_url?, cancel_url? }
// Authenticated host. Creates a Stripe Checkout Session for $10 base + $1/guest.
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { adminClient, userClient, env } from "../_shared/clients.ts";
import { preflight, json } from "../_shared/cors.ts";

const stripe = new Stripe(env("STRIPE_SECRET_KEY"), {
  apiVersion: "2024-06-20",
  httpClient: Stripe.createFetchHttpClient(),
});

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

    const { count } = await db.from("guests")
      .select("*", { count: "exact", head: true }).eq("event_id", event_id);
    const guestCount = count ?? 0;

    // Stripe Price IDs (one-time). Overridable via env; defaults are the
    // products you created. Base = $10; Extra = $1 per person.
    const basePrice = Deno.env.get("STRIPE_PRICE_BASE") || "price_1To0F0L3t6lGRaBqic1AbuER";
    const extraPrice = Deno.env.get("STRIPE_PRICE_EXTRA") || "price_1To0FJL3t6lGRaBqNN9syoTe";

    // Quantity of the $1 "extra person" line. `BASE_INCLUDED` guests are covered
    // by the base fee; everyone beyond that is billed per head.
    //   0  → flat $10 base + $1 × every guest  (matches the dashboard estimate)
    //   9  → $10 covers up to 9, $1 from the 10th ("under 10 people")
    //   10 → $10 covers up to 10, $1 from the 11th
    const included = Number(Deno.env.get("STRIPE_BASE_INCLUDED") ?? 10);
    const extraQty = Math.max(0, guestCount - included);

    const base = Number(Deno.env.get("PRICE_BASE_CENTS") ?? 1000);
    const per = Number(Deno.env.get("PRICE_PER_GUEST_CENTS") ?? 100);
    const amount = base + per * extraQty;
    const site = (Deno.env.get("PUBLIC_SITE_URL") || "").replace(/\/$/, "");

    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
      { price: basePrice, quantity: 1 },
    ];
    if (extraQty > 0) lineItems.push({ price: extraPrice, quantity: extraQty });

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: lineItems,
      customer_email: user.email ?? undefined,
      success_url: success_url || `${site}/index.html#/event/${event_id}?paid=1`,
      cancel_url: cancel_url || `${site}/index.html#/event/${event_id}`,
      metadata: { event_id, guest_count: String(guestCount) },
    });

    await db.from("payments").insert({
      event_id, stripe_session_id: session.id, amount_cents: amount, status: "pending",
    });
    return json({ url: session.url });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
