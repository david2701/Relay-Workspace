/** Floor remaining seconds so a fresh 5-minute code shows ≤5:00, never 5:01. */
export function formatCountdown(expiresAt: string, nowMs: number): string {
  const remainingMs = Math.max(0, Date.parse(expiresAt) - nowMs);
  const totalSec = Math.floor(remainingMs / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
