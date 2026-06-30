// send-invites — POST { event_id }
// Verifies the caller owns the (paid) event, then sends the invite to every
// not-yet-invited guest via Twilio (SMS) and/or Resend (email) per guest.channel.
import { adminClient, userClient } from "../_shared/clients.ts";
import { preflight, json } from "../_shared/cors.ts";
import { dispatchInvites } from "../_shared/invites.ts";

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  try {
    const { event_id } = await req.json();
    const auth = req.headers.get("Authorization") || "";
    const { data: { user } } = await userClient(auth).auth.getUser();
    if (!user) return json({ error: "unauthorized" }, 401);

    const db = adminClient();
    const { data: event } = await db.from("events").select("*").eq("id", event_id).single();
    if (!event || event.host_id !== user.id) return json({ error: "not found" }, 404);
    if (!event.paid_at) return json({ error: "PAYMENT_REQUIRED" }, 402);

    const hostName = user.user_metadata?.name || "your host";
    const result = await dispatchInvites(db, event, hostName);
    return json(result);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
