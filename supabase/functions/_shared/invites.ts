// Shared invite dispatch — used by both send-invites (host-triggered) and
// stripe-webhook (auto-send on payment). Sends to every not-yet-invited guest
// over their channel(s) and logs each message.
import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { render, fmtDate, rsvpLink } from "./render.ts";
import { mergeDefaults } from "./templates.ts";
import { sendSms } from "./twilio.ts";
import { sendEmail } from "./resend.ts";

// deno-lint-ignore no-explicit-any
export async function dispatchInvites(db: SupabaseClient, event: any, hostName: string) {
  const { data: tplRow } = await db.from("templates").select("data").eq("event_id", event.id).maybeSingle();
  const tpl = mergeDefaults(tplRow?.data);
  const { data: guests } = await db.from("guests").select("*").eq("event_id", event.id).is("invited_at", null);

  let sent = 0;
  const errors: string[] = [];
  for (const g of guests ?? []) {
    const ctx = {
      guestName: g.name, eventName: event.name, date: fmtDate(event.event_date),
      location: event.location, rsvpLink: rsvpLink(g.token), hostName,
    };
    const wantSms = (g.channel === "sms" || g.channel === "both") && g.phone;
    const wantEmail = (g.channel === "email" || g.channel === "both") && g.email;
    try {
      if (wantSms) {
        const body = render(tpl.sms.invite, ctx);
        const sid = await sendSms(g.phone, body);
        await db.from("messages").insert({
          event_id: event.id, guest_id: g.id, channel: "sms", direction: "out",
          kind: "invite", body, provider_id: sid,
        });
      }
      if (wantEmail) {
        const subject = render(tpl.email.invite.subject, ctx);
        const body = render(tpl.email.invite.body, ctx);
        const id = await sendEmail(g.email, subject, body);
        await db.from("messages").insert({
          event_id: event.id, guest_id: g.id, channel: "email", direction: "out",
          kind: "invite", subject, body, provider_id: id,
        });
      }
      if (wantSms || wantEmail) {
        await db.from("guests").update({ invited_at: new Date().toISOString() }).eq("id", g.id);
        sent++;
      }
    } catch (e) {
      errors.push(`${g.name}: ${(e as Error).message}`);
    }
  }
  return { sent, errors };
}
