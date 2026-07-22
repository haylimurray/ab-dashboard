import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// ── Minimal CSV parser ────────────────────────────────────────────────────────
// Handles quoted fields (including commas and newlines inside quotes) and
// escaped double-quotes (""). Returns an array of objects keyed by the header row.

function parseCSV(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let cur = "";
  let inQuote = false;
  const cells: string[] = [];

  const push = () => { cells.push(cur); cur = ""; };
  const commitRow = () => { push(); rows.push([...cells]); cells.length = 0; };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuote) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; } // escaped ""
        else inQuote = false;
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"')  { inQuote = true; }
      else if (ch === ",") { push(); }
      else if (ch === "\r" && text[i + 1] === "\n") { commitRow(); i++; }
      else if (ch === "\n" || ch === "\r") { commitRow(); }
      else { cur += ch; }
    }
  }
  // Flush the last row if not empty
  if (cur || cells.length > 0) commitRow();

  if (rows.length < 1) return [];

  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1)
    .filter((row) => row.some((cell) => cell.trim() !== "")) // skip blank rows
    .map((row) => {
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => { obj[h] = (row[i] ?? "").trim(); });
      return obj;
    });
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function GET() {
  const sheetUrl = process.env.RECRUITING_SHEET_URL;

  if (!sheetUrl) {
    return NextResponse.json(
      { error: "RECRUITING_SHEET_URL is not configured. Add it to your .env.local file.", rows: [], headers: [], fetchedAt: null },
      { status: 503 }
    );
  }

  try {
    const res = await fetch(sheetUrl, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`Google Sheets returned ${res.status}`);
    }

    const text = await res.text();
    const rows = parseCSV(text);
    const headers = rows.length > 0 ? Object.keys(rows[0]) : [];

    return NextResponse.json({
      rows,
      headers,
      total: rows.length,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch sheet";
    console.error("[/api/recruiting]", message);
    return NextResponse.json(
      { error: message, rows: [], headers: [], fetchedAt: null },
      { status: 502 }
    );
  }
}
