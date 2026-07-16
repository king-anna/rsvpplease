// gif-search — server-side GIPHY proxy for the RSVP comment GIF picker.
// The GIPHY key lives in the Supabase secret named `GIF` (user's naming) and
// never reaches the browser. Returns a slim result list; the client shows the
// mandatory "Powered By GIPHY" attribution mark next to these results.
//
//   POST { q?: string, limit?: number }  → { gifs: [{ id, preview, url }] }
//   Empty q = GIPHY trending. 503 when the GIF secret isn't configured —
//   the picker then falls back to paste-a-GIF-URL.
import { env } from "../_shared/clients.ts";
import { preflight, json } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  try {
    const key = env("GIF", false);
    if (!key) return json({ error: "gif search not configured" }, 503);

    let q = "", limit = 12;
    try {
      const body = await req.json();
      q = String(body.q || "").slice(0, 80);
      limit = Math.min(24, Math.max(1, Number(body.limit) || 12));
    } catch (_) { /* GET or empty body → trending */ }

    const base = q
      ? `https://api.giphy.com/v1/gifs/search?q=${encodeURIComponent(q)}`
      : "https://api.giphy.com/v1/gifs/trending?";
    const res = await fetch(`${base}&api_key=${key}&limit=${limit}&rating=pg-13&bundle=messaging_non_clips`);
    if (!res.ok) return json({ error: `giphy ${res.status}` }, 502);
    const data = await res.json();

    // deno-lint-ignore no-explicit-any
    const gifs = (data.data || []).map((g: any) => ({
      id: g.id,
      preview: g.images?.fixed_height_small?.url || g.images?.fixed_height?.url,
      url: g.images?.downsized?.url || g.images?.fixed_height?.url || g.images?.original?.url,
    })).filter((g: { preview?: string; url?: string }) => g.preview && g.url);

    return json({ gifs });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
