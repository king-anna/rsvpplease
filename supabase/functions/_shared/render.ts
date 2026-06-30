// Template rendering — mirrors assets/js/api.js render() so SMS/email come out
// identical to the dashboard's live preview.
export interface RenderCtx {
  guestName?: string;
  eventName?: string;
  date?: string | null;
  location?: string;
  rsvpLink?: string;
  hostName?: string;
}

export function render(body: string, ctx: RenderCtx): string {
  const map: Record<string, string> = {
    "{{guest_name}}": ctx.guestName || "there",
    "{{event_name}}": ctx.eventName || "our event",
    "{{date}}": ctx.date || "the big day",
    "{{location}}": ctx.location || "",
    "{{rsvp_link}}": ctx.rsvpLink || "",
    "{{host_name}}": ctx.hostName || "your host",
  };
  return (body || "").replace(/\{\{\s*\w+\s*\}\}/g, (m) => {
    const key = "{{" + m.replace(/[^a-z_]/gi, "") + "}}";
    return key in map ? map[key] : m;
  });
}

export function fmtDate(iso?: string | null): string {
  if (!iso) return "the big day";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return (
    d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) +
    " · " +
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
  );
}

// Public site URL (where rsvp.html is hosted) — set as a secret, e.g.
// https://yourdomain.com  (no trailing slash needed).
export function rsvpLink(token: string): string {
  const base = (Deno.env.get("PUBLIC_SITE_URL") || "").replace(/\/$/, "");
  return `${base}/rsvp.html?t=${encodeURIComponent(token)}`;
}
