/* =========================================================================
   RSVPplease — Store (Phase 1 persistence)
   Low-level localStorage CRUD. Holds only the host's OWN entered data —
   there is no seeded/dummy content. Swapped for Supabase in Phase 2.
   ========================================================================= */
(function () {
  const KEY = "rsvpplease.v1";

  const blank = () => ({ host: null, events: {}, guests: {}, messages: {} });

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return blank();
      const data = JSON.parse(raw);
      return Object.assign(blank(), data);
    } catch (e) {
      console.warn("Store: could not parse, starting fresh", e);
      return blank();
    }
  }

  function save(data) {
    localStorage.setItem(KEY, JSON.stringify(data));
  }

  // Short, URL-safe, collision-resistant id.
  function uid(prefix = "") {
    const s = "abcdefghijklmnopqrstuvwxyz0123456789";
    let out = "";
    const rnd = crypto.getRandomValues(new Uint8Array(10));
    for (const b of rnd) out += s[b % s.length];
    return prefix + out;
  }

  function reset() { save(blank()); }

  window.Store = { KEY, load, save, uid, reset };
})();
