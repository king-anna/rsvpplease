// stripe-webhook — Stripe → here. Verifies the signature; on
// checkout.session.completed marks the event paid, auto-sends the invites, and
// emails a receipt. Deploy with verify_jwt = false (see config.toml).
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { adminClient, env } from "../_shared/clients.ts";
import { dispatchInvites } from "../_shared/invites.ts";
import { sendEmail } from "../_shared/resend.ts";

const stripe = new Stripe(env("STRIPE_SECRET_KEY"), {
  apiVersion: "2024-06-20",
  httpClient: Stripe.createFetchHttpClient(),
});
const cryptoProvider = Stripe.createSubtleCryptoProvider();

Deno.serve(async (req) => {
  const sig = req.headers.get("stripe-signature");
  const raw = await req.text();
  let evt: Stripe.Event;
  try {
    evt = await stripe.webhooks.constructEventAsync(
      raw, sig!, env("STRIPE_WEBHOOK_SECRET"), undefined, cryptoProvider,
    );
  } catch (e) {
    return new Response(`bad signature: ${(e as Error).message}`, { status: 400 });
  }

  if (evt.type === "checkout.session.completed") {
    // deno-lint-ignore no-explicit-any
    const session = evt.data.object as any;
    const eventId = session.metadata?.event_id;
    const db = adminClient();
    if (eventId) {
      const { data: event } = await db.from("events").select("*").eq("id", eventId).single();
      if (event) {
        // The count this session paid up to (from checkout). Falls back to a
        // fresh count. guest_count_at_payment only ever grows — a top-up bumps
        // it so future top-ups bill only the *next* newly-added guests.
        const billedCount = Number(session.metadata?.guest_count ?? NaN);
        let paidCount = Number.isFinite(billedCount) ? billedCount : null;
        if (paidCount === null) {
          const { count } = await db.from("guests")
            .select("*", { count: "exact", head: true }).eq("event_id", eventId);
          paidCount = count ?? 0;
        }
        // Keep the original paid_at on a top-up; only set it on first payment.
        const paidAt = event.paid_at || new Date().toISOString();
        await db.from("events").update({
          status: "active",
          paid_at: paidAt,
          guest_count_at_payment: Math.max(event.guest_count_at_payment ?? 0, paidCount),
        }).eq("id", eventId);
        await db.from("payments").update({ status: "paid" }).eq("stripe_session_id", session.id);

        const { data: hostUser } = await db.auth.admin.getUserById(event.host_id);
        const hostName = hostUser?.user?.user_metadata?.name || "your host";

        // Auto-send invites. dispatchInvites only targets guests with
        // invited_at = null, so this sends the whole list on first payment and
        // just the newly-added guests on a top-up — and is safely idempotent
        // if Stripe re-delivers this event.
        try {
          await dispatchInvites(db, { ...event, status: "active", paid_at: paidAt }, hostName);
        } catch (_) { /* logged in messages by dispatch; don't fail the webhook */ }

        // Receipt email (best-effort).
        try {
          const email = session.customer_details?.email || hostUser?.user?.email;
          if (email) {
            const amt = ((session.amount_total || 0) / 100).toFixed(2);
            await sendEmail(
              email,
              `Your RSVPplease receipt — ${event.name}`,
              `Thanks! We received your payment of $${amt} for ${event.name}. ` +
                `Your invitations are on their way. 💌`,
            );
          }
        } catch (_) { /* ignore */ }
      }
    }
  }
  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
