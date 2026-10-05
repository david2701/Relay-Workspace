const MONTHS = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
] as const;

const DAYS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"] as const;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function formatRelative(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const diffMs = now.getTime() - d.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  const startToday = new Date(now);
  startToday.setHours(0, 0, 0, 0);
  const startThat = new Date(d);
  startThat.setHours(0, 0, 0, 0);
  const dayDiff = Math.round(
    (startToday.getTime() - startThat.getTime()) / 86_400_000,
  );
  if (dayDiff === 1) return `ayer ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (dayDiff < 7) {
    return `${DAYS[d.getDay()]} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  if (d.getFullYear() === now.getFullYear()) {
    return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  }
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function formatDue(iso: string, now = new Date()): {
  text: string;
  tone: "muted" | "warn" | "crit";
} {
  const d = new Date(iso);
  const startToday = new Date(now);
  startToday.setHours(0, 0, 0, 0);
  const startThat = new Date(d);
  startThat.setHours(0, 0, 0, 0);
  const dayDiff = Math.round(
    (startThat.getTime() - startToday.getTime()) / 86_400_000,
  );
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (d.getTime() < now.getTime()) {
    if (dayDiff === 0) return { text: `Venció hoy a las ${hm}`, tone: "crit" };
    if (dayDiff === -1) return { text: "Venció ayer", tone: "crit" };
    return {
      text: `Venció el ${d.getDate()} ${MONTHS[d.getMonth()]}`,
      tone: "crit",
    };
  }
  if (dayDiff === 0) {
    const hoursLeft = (d.getTime() - now.getTime()) / 3_600_000;
    return {
      text: `Hoy ${hm}`,
      tone: hoursLeft < 4 ? "warn" : "muted",
    };
  }
  if (dayDiff === 1) return { text: `Mañana ${hm}`, tone: "muted" };
  if (dayDiff < 7) {
    return { text: `${DAYS[d.getDay()]} ${hm}`, tone: "muted" };
  }
  return {
    text: `${d.getDate()} ${MONTHS[d.getMonth()]} ${hm}`,
    tone: "muted",
  };
}

export function formatAbsolute(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function hoursSince(iso: string, now = new Date()): number {
  return (now.getTime() - new Date(iso).getTime()) / 3_600_000;
}
