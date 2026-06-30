// notify-host — POST { token }. Called by the public RSVP page right after a
// web submission so the host gets an email even when the guest didn't reply by
// SMS. Anon-invokable (verify_jwt = false); only ever emails the event's host.
import { adminClient } from "../_shared/clients.ts";
import { preflight, json } from "../_shared/cors.ts";
import { sendEmail } from "../_shared/resend.ts";

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  try {
    const { token } = await req.json();
    const db = adminClient();
    const { data: guest } = await db.from("guests")
      .select("*, events(*)").eq("token", token).maybeSingle();
    if (!guest) return json({ error: "not found" }, 404);

    const e = (guest as Record<string, any>).events;
    const { data: hostUser } = await db.auth.admin.getUserById(e.host_id);
    const hostEmail = hostUser?.user?.email;
    if (hostEmail) {
      const verb = guest.status === "confirmed" ? "is coming 🎉"
        : guest.status === "declined" ? "can't make it" : "responded";
      const party = guest.party_size > 1 ? ` (party of ${guest.party_size})` : "";
      const note = guest.note ? `\n\nNote: “${guest.note}”` : "";
      await sendEmail(
        hostEmail,
        `${guest.name} ${verb} — ${e.name}`,
        `${guest.name} just RSVP'd ${guest.status} for ${e.name}${party}.${note}`,
      );
    }
    return json({ ok: true });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
