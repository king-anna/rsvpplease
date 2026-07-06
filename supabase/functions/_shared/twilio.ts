// Minimal Twilio REST client (send SMS) — no SDK, just fetch.
import { env } from "./clients.ts";

export async function sendSms(to: string, body: string): Promise<string> {
  const sid = env("TWILIO_ACCOUNT_SID");
  const token = env("TWILIO_AUTH_TOKEN");
  const from = env("TWILIO_PHONE_NUMBER");

  // Twilio needs E.164 — strip any spaces / () / - a host may have entered, and
  // keep only a single leading +. (Belt-and-braces: the app already normalises
  // on add, but this covers guests saved before that.)
  const dest = (to || "").replace(/[^\d+]/g, "").replace(/(?!^)\+/g, "");

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: "Basic " + btoa(`${sid}:${token}`),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: dest, From: from, Body: body }),
    },
  );
  const data = await res.json();
  if (!res.ok) throw new Error(`Twilio ${res.status}: ${data.message || JSON.stringify(data)}`);
  return data.sid as string;
}

// TwiML reply used by the inbound webhook to text back an auto-reply.
export function twiml(message: string): Response {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const xml = message
    ? `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${esc(message)}</Message></Response>`
    : `<?xml version="1.0" encoding="UTF-8"?><Response/>`;
  return new Response(xml, { headers: { "Content-Type": "text/xml" } });
}
