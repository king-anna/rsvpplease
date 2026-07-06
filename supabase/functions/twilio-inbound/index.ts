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

  // Gather EVERY invited guest row for this number (a person can be invited to
  // more than one party from the same phone), newest invite first.
  const target = phoneKey(from);
  let candidates: Record<string, any>[] = [];
  {
    const { data: exact } = await db.from("guests")
      .select("*, events(*)").eq("phone", from).not("invited_at", "is", null)
      .order("invited_at", { ascending: false }).limit(50);
    candidates = (exact || []) as Record<string, any>[];
    // Fallback: numbers stored with spaces/() won't match exactly — compare digits.
    if (!candidates.length) {
      const { data: rows } = await db.from("guests")
        .select("*, events(*)").not("phone", "is", null).not("invited_at", "is", null)
        .order("invited_at", { ascending: false }).limit(1000);
      candidates = ((rows || []) as Record<string, any>[]).filter((g) => phoneKey(g.phone) === target);
      if (candidates.length) console.log("matched by digit-normalised phone:", candidates[0].phone);
    }
  }

  if (!candidates.length) { console.log("no invited guest found for", from, "— check the number is stored in E.164 (+1…)"); return twiml(""); }

  // If they were invited to several parties, their reply belongs to the one
  // still waiting on them — the most recently invited party they haven't
  // answered yet. If they've answered them all, fall back to the newest invite
  // (so a change of mind still lands somewhere sensible).
  const responded = (g: Record<string, any>) => g.status === "confirmed" || g.status === "declined" || !!g.responded_at;
  const guest = candidates.find((g) => !responded(g)) || candidates[0];
  const event = guest.events;
  if (candidates.length > 1) console.log(`phone maps to ${candidates.length} invites; routing reply to event`, event?.id, event?.name);
  console.log("matched guest", guest.id, "event", event?.id, event?.name);

  // Log the inbound text.
  await db.from("messages").insert({
    event_id: event.id, guest_id: guest.id, channel: "sms",
    direction: "in", kind: "rsvp", body: text,
  });

  const isYes = YES.test(text);
  const isNo = NO.test(text);
  const alreadyResponded = responded(guest);

  // Best-effort host notification — used both for a first reply and a later
  // change of mind.
  const notifyHost = async (hostEmail: string | undefined, status: string) => {
    try {
      if (hostEmail) {
        await sendEmail(
          hostEmail,
          `${guest.name} ${status === "confirmed" ? "is coming 🎉" : "can't make it"} — ${event.name}`,
          `${guest.name} just replied "${text}" and is now ${status} for ${event.name}.`,
        );
      }
    } catch (_) { /* notification failures shouldn't break the reply */ }
  };

  if (!isYes && !isNo) {
    // Don't nag a guest who has already answered with a follow-up ("thanks!").
    if (alreadyResponded) { console.log("chit-chat after reply — staying quiet for guest", guest.id); return twiml(""); }
    return twiml(`Thanks! Could you reply YES if you can make ${event.name}, or NO if you can't?`);
  }

  const status = isYes ? "confirmed" : "declined";

  // Already replied to this party: record a genuine change of mind so the host
  // sees it, but DON'T text back again — auto-replies are one-per-guest.
  if (alreadyResponded) {
    if (status !== guest.status) {
      await db.from("guests").update({ status, responded_at: new Date().toISOString() }).eq("id", guest.id);
      const { data: hu } = await db.auth.admin.getUserById(event.host_id);
      await notifyHost(hu?.user?.email, status);
      console.log("updated change-of-mind to", status, "for guest", guest.id, "(no auto-reply)");
    } else {
      console.log("repeat reply, same answer — no action for guest", guest.id);
    }
    return twiml("");
  }

  // First reply from this guest: record it and send the one auto-reply.
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

  await notifyHost(hostUser?.user?.email, status);

  return twiml(reply);
});
