// send-nudges
//  • No body (cron): hourly pg_cron call with x-cron-secret — nudges every
//    eligible pending guest (past window, under max) on active events.
//  • { guest_id } (host): authenticated dashboard "Send a nudge" button —
//    nudges that one guest immediately, ignoring the window.
// Deploy with verify_jwt = false; both paths do their own auth.
import { adminClient, userClient } from "../_shared/clients.ts";
import { json } from "../_shared/cors.ts";
import { render, fmtDate, rsvpLink } from "../_shared/render.ts";
import { mergeDefaults, TemplateData } from "../_shared/templates.ts";
import { sendSms } from "../_shared/twilio.ts";
import { sendEmail } from "../_shared/resend.ts";

// deno-lint-ignore no-explicit-any
async function nudgeOne(db: any, g: any, e: any, tpl: TemplateData, hostName: string) {
  const ctx = {
    guestName: g.name, eventName: e.name, date: fmtDate(e.event_date),
    location: e.location, rsvpLink: rsvpLink(g.token), hostName,
  };
  const wantSms = (g.channel === "sms" || g.channel === "both") && g.phone;
  const wantEmail = (g.channel === "email" || g.channel === "both") && g.email;
  if (wantSms) {
    const body = render(tpl.sms.nudge, ctx);
    const sid = await sendSms(g.phone, body);
    await db.from("messages").insert({ event_id: e.id, guest_id: g.id, channel: "sms",
      direction: "out", kind: "nudge", body, provider_id: sid });
  }
  if (wantEmail) {
    const subject = render(tpl.email.nudge.subject, ctx);
    const body = render(tpl.email.nudge.body, ctx);
    const id = await sendEmail(g.email, subject, body);
    await db.from("messages").insert({ event_id: e.id, guest_id: g.id, channel: "email",
      direction: "out", kind: "nudge", subject, body, provider_id: id });
  }
  if (wantSms || wantEmail) {
    await db.from("guests").update({
      nudge_count: (g.nudge_count ?? 0) + 1, last_nudge_at: new Date().toISOString(),
    }).eq("id", g.id);
    return true;
  }
  return false;
}

Deno.serve(async (req) => {
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch (_) { /* cron sends empty */ }
  const db = adminClient();

  // ---- Host-triggered single nudge -------------------------------------
  if (body.guest_id) {
    const auth = req.headers.get("Authorization") || "";
    const { data: { user } } = await userClient(auth).auth.getUser();
    if (!user) return json({ error: "unauthorized" }, 401);
    const { data: g } = await db.from("guests").select("*, events(*)").eq("id", body.guest_id).maybeSingle();
    // deno-lint-ignore no-explicit-any
    const e = (g as any)?.events;
    if (!g || !e || e.host_id !== user.id) return json({ error: "not found" }, 404);
    const { data: tplRow } = await db.from("templates").select("data").eq("event_id", e.id).maybeSingle();
    const hostName = user.user_metadata?.name || "your host";
    const ok = await nudgeOne(db, g, e, mergeDefaults(tplRow?.data), hostName);
    return json({ nudged: ok ? 1 : 0 });
  }

  // ---- Cron sweep -------------------------------------------------------
  const secret = Deno.env.get("CRON_SECRET");
  if (secret && req.headers.get("x-cron-secret") !== secret) return json({ error: "forbidden" }, 403);

  const nowMs = Date.now();
  const { data: guests } = await db.from("guests")
    .select("*, events(*)").eq("status", "pending").not("invited_at", "is", null);

  const cache = new Map<string, { tpl: TemplateData; hostName: string }>();
  let nudged = 0;
  for (const g of guests ?? []) {
    // deno-lint-ignore no-explicit-any
    const e = (g as any).events;
    if (!e || e.status !== "active") continue;
    if ((g.nudge_count ?? 0) >= (e.nudge_max ?? 2)) continue;
    const afterMs = (e.nudge_after_hours ?? 48) * 3600 * 1000;
    if (nowMs - Date.parse(g.last_nudge_at ?? g.invited_at) < afterMs) continue;

    if (!cache.has(e.id)) {
      const { data: tplRow } = await db.from("templates").select("data").eq("event_id", e.id).maybeSingle();
      const { data: hostUser } = await db.auth.admin.getUserById(e.host_id);
      cache.set(e.id, { tpl: mergeDefaults(tplRow?.data), hostName: hostUser?.user?.user_metadata?.name || "your host" });
    }
    const { tpl, hostName } = cache.get(e.id)!;
    try { if (await nudgeOne(db, g, e, tpl, hostName)) nudged++; } catch (_) { /* skip */ }
  }
  return json({ nudged });
});
