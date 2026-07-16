// photo-upload — a guest adds a photo to the party album from the invite page.
// Auth = their guest token (they must have RSVP'd). The client resizes to
// ≤1600px JPEG and sends base64; we sniff the real type, enforce caps, store
// in the public 'party-photos' bucket and insert a photos row (service role —
// the table has no anon write policy).
//
//   POST { token, data }   data = data:image/...;base64,....  (≤ ~4MB decoded)
//   → { ok, id, url }
import { adminClient } from "../_shared/clients.ts";
import { preflight, json } from "../_shared/cors.ts";

const MAX_BYTES = 4 * 1024 * 1024;
const PER_GUEST = 12;
const PER_EVENT = 240;

function sniff(bytes: Uint8Array): { ext: string; mime: string } | null {
  if (bytes.length > 3 && bytes[0] === 0xFF && bytes[1] === 0xD8) return { ext: "jpg", mime: "image/jpeg" };
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E) return { ext: "png", mime: "image/png" };
  if (bytes.length > 12 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return { ext: "webp", mime: "image/webp" };
  return null;
}

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  try {
    const { token, data } = await req.json();
    if (!token || typeof data !== "string") return json({ error: "token and data required" }, 400);

    const db = adminClient();
    const { data: guest } = await db.from("guests")
      .select("id, event_id, status").eq("token", token).maybeSingle();
    if (!guest) return json({ error: "invite not found" }, 404);
    if (guest.status !== "confirmed" && guest.status !== "declined") {
      return json({ error: "RSVP first, then add photos" }, 403);
    }

    const b64 = data.replace(/^data:[^,]*,/, "");
    let bytes: Uint8Array;
    try { bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)); }
    catch (_) { return json({ error: "bad image data" }, 400); }
    if (bytes.length > MAX_BYTES) return json({ error: "photo too large (4MB max)" }, 413);
    const kind = sniff(bytes);
    if (!kind) return json({ error: "JPEG, PNG or WebP only" }, 415);

    const [{ count: mine }, { count: total }] = await Promise.all([
      db.from("photos").select("*", { count: "exact", head: true }).eq("guest_id", guest.id),
      db.from("photos").select("*", { count: "exact", head: true }).eq("event_id", guest.event_id),
    ]);
    if ((mine ?? 0) >= PER_GUEST) return json({ error: `you've reached ${PER_GUEST} photos` }, 429);
    if ((total ?? 0) >= PER_EVENT) return json({ error: "this party's album is full" }, 429);

    const path = `${guest.event_id}/${crypto.randomUUID()}.${kind.ext}`;
    const { error: upErr } = await db.storage.from("party-photos")
      .upload(path, bytes, { contentType: kind.mime, upsert: false });
    if (upErr) return json({ error: upErr.message }, 500);
    const url = db.storage.from("party-photos").getPublicUrl(path).data.publicUrl;

    const { data: row, error: insErr } = await db.from("photos")
      .insert({ event_id: guest.event_id, guest_id: guest.id, url })
      .select("id, url").single();
    if (insErr) return json({ error: insErr.message }, 500);

    return json({ ok: true, id: row.id, url: row.url });
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }
});
