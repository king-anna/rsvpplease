// twilio-inbound — public webhook for incoming SMS (set as the Twilio number's
// "A message comes in" URL). Verifies the Twilio signature, matches the sender
// to a guest, parses YES/NO, records it, texts back the host's auto-reply, and
// emails the host a notification. Deploy with verify_jwt = false (see config.toml).
import { adminClient, env } from "../_shared/clients.ts";
import { render, fmtDate } from "../_shared/render.ts";
import { mergeDefaults } from "../_shared/templates.ts";
import { twiml } from "../_shared/twilio.ts";
import { sendEmail } from "../_shared/resend.ts";

async function validSignature(req: Request, params: Record<string, string>): Promise<boolean> {
  if (Deno.env.get("TWILIO_SKIP_VALIDATION") === "1") return true;
  const sig = req.headers.get("X-Twilio-Signature");
  if (!sig) return false;
  const url = Deno.env.get("TWILIO_WEBHOOK_URL") || req.url; // exact public URL preferred
  let data = url;
  for (const k of Object.keys(params).sort()) data += k + params[k];
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(env("TWILIO_AUTH_TOKEN")),
    { name: "HMAC", hash: "SHA-1" }, false, ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  const computed = btoa(String.fromCharCode(...new Uint8Array(mac)));
  return computed === sig;
}

const YES = /^(y|yes|yep|yeah|yup|sure|ok|okay|confirm|accept|in|coming|👍|🎉|❤️?)/i;
const NO = /^(n|no|nope|nah|cant|can't|cannot|decline|out|sorry|regret)/i;

Deno.serve(async (req) => {
  const form = await req.formData();
  const params: Record<string, string> = {};
  form.forEach((v, k) => (params[k] = String(v)));

  if (!(await validSignature(req, params))) return twiml("");

  const from = (params.From || "").trim();
  const text = (params.Body || "").trim();
  const db = adminClient();

  // Most recently invited guest with this number.
  const { data: guest } = await db.from("guests")
    .select("*, events(*)")
    .eq("phone", from)
    .not("invited_at", "is", null)
    .order("invited_at", { ascending: false })
    .limit(1).maybeSingle();

  if (!guest) return twiml("");
  const event = (guest as Record<string, any>).events;

  // Log the inbound text.
  await db.from("messages").insert({
    event_id: event.id, guest_id: guest.id, channel: "sms",
    direction: "in", kind: "rsvp", body: text,
  });

  const isYes = YES.test(text);
  const isNo = NO.test(text);
  if (!isYes && !isNo) {
    return twiml(`Thanks! Could you reply YES if you can make ${event.name}, or NO if you can't?`);
  }
  const status = isYes ? "confirmed" : "declined";
  await db.from("guests").update({ status, responded_at: new Date().toISOString() }).eq("id", guest.id);

  const { data: tplRow } = await db.from("templates").select("data").eq("event_id", event.id).maybeSingle();
  const tpl = mergeDefaults(tplRow?.data);
  const { data: hostUser } = await db.auth.admin.getUserById(event.host_id);
  const hostName = hostUser?.user?.user_metadata?.name || "your host";
  const ctx = {
    guestName: guest.name, eventName: event.name, date: fmtDate(event.event_date),
    location: event.location, hostName,
  };
  const replyKey = isYes ? "replyYes" : "replyNo";
  const reply = render(tpl.sms[replyKey], ctx);

  await db.from("messages").insert({
    event_id: event.id, guest_id: guest.id, channel: "sms",
    direction: "out", kind: replyKey, body: reply,
  });

  // Best-effort host notification email.
  try {
    const hostEmail = hostUser?.user?.email;
    if (hostEmail) {
      await sendEmail(
        hostEmail,
        `${guest.name} ${isYes ? "is coming 🎉" : "can't make it"} — ${event.name}`,
        `${guest.name} just replied "${text}" and is now ${status} for ${event.name}.`,
      );
    }
  } catch (_) { /* notification failures shouldn't break the reply */ }

  return twiml(reply);
});
