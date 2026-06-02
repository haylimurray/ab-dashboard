// Next.js calls register() once when the server process starts (stable in 14.1+).
export async function register() {
  // Log immediately — this tells us register() was reached even before the delay fires.
  console.log(`[cache-warmer] register() called — NEXT_RUNTIME="${process.env.NEXT_RUNTIME}"`);

  // Only warm the cache in the Node.js server runtime (not during builds or edge workers).
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    console.log("[cache-warmer] Skipping pre-warm (not nodejs runtime).");
    return;
  }

  console.log("[cache-warmer] Cache pre-warm scheduled — will start in 10s once HTTP port is ready.");

  // Delay lets Next.js finish binding its HTTP port before we hit our own routes.
  setTimeout(async () => {
    const port = process.env.PORT ?? 3000;
    const base = `http://localhost:${port}`;
    console.log(`[cache-warmer] Cache pre-warm started — target: ${base}`);

    try {
      // ── Step 1: contacts ──────────────────────────────────────────────────
      const contactsRes = await fetch(`${base}/api/contacts`, { cache: "no-store" });
      if (!contactsRes.ok) throw new Error(`/api/contacts returned HTTP ${contactsRes.status}`);

      const { contacts } = await contactsRes.json() as {
        contacts: Array<{ id: string; notesLastContacted: string | null }>;
      };
      console.log(`[cache-warmer] Contacts cache populated — ${contacts.length} contacts loaded.`);

      // ── Step 2: health scores (batches of 20) ─────────────────────────────
      const BATCH = 20;
      let warmed = 0;
      for (let i = 0; i < contacts.length; i += BATCH) {
        const batch = contacts.slice(i, i + BATCH);
        await Promise.allSettled(
          batch.map((c) => {
            const params = new URLSearchParams({ id: c.id });
            if (c.notesLastContacted) params.set("fallback", c.notesLastContacted);
            return fetch(`${base}/api/health?${params}`, { cache: "no-store" });
          })
        );
        warmed += batch.length;
        console.log(`[cache-warmer] Health scores: ${warmed} / ${contacts.length}`);
      }

      console.log(
        `[cache-warmer] Cache pre-warm complete — ${contacts.length} contacts + ` +
        `${contacts.length} health scores ready. First load will be instant.`
      );
    } catch (err) {
      // Non-fatal: first user will trigger a fresh load instead.
      console.error(
        "[cache-warmer] Pre-warm failed (first user will populate cache instead):",
        err instanceof Error ? err.message : String(err)
      );
    }
  }, 10_000);
}
