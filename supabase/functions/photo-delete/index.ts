// photo-delete — the host removes a photo from their party's album.
// Auth = the host's user JWT; ownership is enforced by querying the photos
// table through the caller's own client (RLS: hosts only see their events'
// photos). Deletion of the storage object + row runs as service role.
//
//   POST { id }  → { ok }
import { adminClient, userClient } from "../_shared/clients.ts";
import { preflight, json } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  try {
    const auth = req.headers.get("Authorization") || "";
    const { id } = await req.json();
    if (!id) return json({ error: "id required" }, 400);

    // RLS-scoped read: returns the row only if the caller hosts this event.
    const caller = userClient(auth);
    const { data: photo } = await caller.from("photos").select("id, url").eq("id", id).maybeSingle();
    if (!photo) return json({ error: "not found" }, 404);

    const db = adminClient();
    const path = (photo.url.split("/party-photos/")[1] || "").split("?")[0];
    if (path) await db.storage.from("party-photos").remove([decodeURIComponent(path)]);
    const { error } = await db.from("photos").delete().eq("id", id);
    if (error) return json({ error: error.message }, 500);

    return json({ ok: true });
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }
});
