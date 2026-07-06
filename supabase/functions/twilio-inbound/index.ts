// twilio-inbound — public webhook for incoming SMS (set as the Twilio number's
// "A message comes in" URL). Verifies the Twilio signature, matches the sender
// to a guest, parses YES/NO, records it, texts back the host's auto-reply, and
// emails the host a notification. Deploy with verify_jwt = false (see config.toml).
import { adminClient, env } from "../_shared/clients.ts";
import { render, fmtDate } from "../_shared/render.ts";
import { mergeDefaults } from "../_shared/templates.ts";
import { twiml } from "../_shared/twilio.ts";
import { sendEmail } from "../_shared/resend.ts";

// Twilio signs with the EXACT public URL it was configured with. Inside the
// edge runtime req.url can differ (proxying, functions.supabase.co vs
// /functions/v1), so try every plausible form. Set TWILIO_SKIP_VALIDATION=1 to
// bypass while debugging.
async function validSignature(req: Request, params: Record<string, string>): Promise<boolean> {
  if (Deno.env.get("TWILIO_SKIP_VALIDATION") === "1") { console.log("sig: skipped (TWILIO_SKIP_VALIDATION=1)"); return true; }
  const sig = req.headers.get("X-Twilio-Signature");
  if (!sig) { console.log("sig: missing X-Twilio-Signature header"); return false; }

  const ref = (Deno.env.get("SUPABASE_URL") || "").match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
  const candidates = [
    Deno.env.get("TWILIO_WEBHOOK_URL"),
    req.url,
    ref && `https://${ref}.functions.supabase.co/twilio-inbound`,
    ref && `https://${ref}.supabase.co/functions/v1/twilio-inbound`,
  ].filter((u): u is string => !!u);

  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(env("TWILIO_AUTH_TOKEN")),
    { name: "HMAC", hash: "SHA-1" }, false, ["sign"],
  );
  const sortedParams = Object.keys(params).sort().map((k) => k + params[k]).join("");
  for (const url of candidates) {
    const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(url + sortedParams));
    if (btoa(String.fromCharCode(...new Uint8Array(mac))) === sig) { console.log("sig: matched url", url); return true; }
  }
  console.log("sig: NO candidate URL matched. Tried:", candidates, "— set TWILIO_WEBHOOK_URL to the exact number's webhook URL, or TWILIO_SKIP_VALIDATION=1 to test.");
  return false;
}

// Compare phone numbers by their digits (last 10), tolerating +, spaces, (), -.
const phoneKey = (s: string) => (s || "").replace(/\D/g, "").slice(-10);

const YES = /^(y|yes|yep|yeah|yup|sure|ok|okay|confirm|accept|in|coming|👍|🎉|❤️?)/i;
const NO = /^(n|no|nope|nah|cant|can't|cannot|decline|out|sorry|regret)/i;

Deno.serve(async (req) => {
  const form = await req.formData();
  const params: Record<string, string> = {};
  form.forEach((v, k) => (params[k] = String(v)));

  const from = (params.From || "").trim();
  const text = (params.Body || "").trim();
  console.log("inbound:", { from, text });

  if (!(await validSignature(req, params))) return twiml("");

  const db = adminClient();

  // Exact match on the stored number, most recently invited first.
  let guest: Record<string, any> | null = null;
  {
    const { data } = await db.from("guests")
      .select("*, events(*)").eq("phone", from).not("invited_at", "is", null)
      .order("invited_at", { ascending: false }).limit(1).maybeSingle();
    guest = data as Record<string, any> | null;
  }
  // Fallback: numbers stored with spaces/() won't match exactly — compare digits.
  if (!guest) {
    const target = phoneKey(from);
    const { data: rows } = await db.from("guests")
      .select("*, events(*)").not("phone", "is", null).not("invited_at", "is", null)
      .order("invited_at", { ascending: false }).limit(500);
    guest = (rows || []).find((g: Record<string, any>) => phoneKey(g.phone) === target) || null;
    if (guest) console.log("matched guest by digit-normalised phone:", guest.phone);
  }

  if (!guest) { console.log("no invited guest found for", from, "— check the number is stored in E.164 (+1…)"); return twiml(""); }
  const event = (guest as Record<string, any>).events;
  console.log("matched guest", guest.id, "event", event?.id, event?.name);

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
  console.log("recorded", status, "for guest", guest.id);

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
