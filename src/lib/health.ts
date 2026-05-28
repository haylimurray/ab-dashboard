export function getDaysSince(raw: string | null | undefined): number | null {
  if (!raw) return null;

  let date: Date;
  // HubSpot sometimes returns epoch-ms as a string
  if (/^\d{10,}$/.test(raw.trim())) {
    date = new Date(Number(raw));
  } else {
    date = new Date(raw);
  }

  if (isNaN(date.getTime())) return null;

  const diffMs = Date.now() - date.getTime();
  return Math.floor(diffMs / 86_400_000);
}

export function getHealthScore(days: number | null): {
  score: number;
  color: "green" | "yellow" | "red";
} {
  if (days === null) return { score: 100, color: "green" };
  if (days < 15) return { score: 10, color: "red" };
  if (days < 30) return { score: 25, color: "red" };
  if (days < 60) return { score: 50, color: "yellow" };
  if (days < 90) return { score: 75, color: "green" };
  return { score: 90, color: "green" };
}

export function isInCooldown(days: number | null, threshold: number): boolean {
  if (days === null) return false;
  return days < threshold;
}
