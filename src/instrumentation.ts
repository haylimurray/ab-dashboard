// Next.js calls register() once when the server process starts (stable in 14.1+).
// We use it to pre-warm both caches before the first user opens the dashboard.
export async function register() {
  // Only run in the Node.js server runtime — skip during builds and edge workers.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Delay lets Next.js finish binding its HTTP port before we hit our own routes.
  setTimeout(async () => {
    const port = process.env.PORT ?? 3000;
    const base = `http://localhost:${port}`;

    try {
      // ── Step 1: contacts ──────────────────────────────────────────────────
      console.log("[cache-warmer] Pre-warming contacts cache…");
      const contactsRes = await fetch(`${base}/api/contacts`, { cache: "no-store" });
      if (!contactsRes.ok) throw new Error(`/api/contacts returned ${contactsRes.status}`);

      const { contacts } = await contactsRes.json() as {
        contacts: Array<{ id: string; notesLastContacted: string | null }>;
      };
      console.log(`[cache-warmer] Contacts cached (${contacts.length}). Starting health pre-warm…`);

      // ── Step 2: health scores (batches of 10) ─────────────────────────────
      const BATCH = 10;
      for (let i = 0; i < contacts.length; i += BATCH) {
        const batch = contacts.slice(i, i + BATCH);
        await Promise.allSettled(
          batch.map((c) => {
            const params = new URLSearchParams({ id: c.id });
            if (c.notesLastContacted) params.set("fallback", c.notesLastContacted);
            return fetch(`${base}/api/health?${params}`, { cache: "no-store" });
          })
        );
        console.log(
          `[cache-warmer] Health: ${Math.min(i + BATCH, contacts.length)} / ${contacts.length}`
        );
      }

      console.log("[cache-warmer] Cache pre-warm complete — all routes ready.");
    } catch (err) {
      // Non-fatal: log and move on. The routes will still populate on first real request.
      console.error(
        "[cache-warmer] Pre-warm failed:",
        err instanceof Error ? err.message : String(err)
      );
    }
  }, 10_000); // 10-second head-start for the HTTP server to finish binding
}
