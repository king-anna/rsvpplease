// Minimal Resend client (send transactional email) — no SDK, just fetch.
import { env } from "./clients.ts";

export async function sendEmail(
  to: string,
  subject: string,
  text: string,
): Promise<string> {
  const key = env("RESEND_API_KEY");
  const from = env("RESEND_FROM"); // e.g. "RSVPplease <invites@yourdomain.com>"

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, text }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Resend ${res.status}: ${data.message || JSON.stringify(data)}`);
  return data.id as string;
}
