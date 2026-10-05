import type { Status } from "../lib/types";

const COLORS: Record<Status, string> = {
  inbox: "var(--control)",
  assigned: "var(--ink-2)",
  in_progress: "var(--ink-2)",
  blocked: "var(--warn)",
  needs_you: "var(--accent-ink)",
  done: "var(--ok)",
  cancelled: "var(--ink-muted)",
};

export function StatusGlyph({
  status,
  label,
}: {
  status: Status;
  label: string;
}) {
  const color = COLORS[status];
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      aria-label={label}
      role="img"
      style={{ flexShrink: 0 }}
    >
      {status === "inbox" && (
        <circle
          cx="8"
          cy="8"
          r="5.5"
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeDasharray="2.5 2"
        />
      )}
      {status === "assigned" && (
        <circle
          cx="8"
          cy="8"
          r="5.5"
          fill="none"
          stroke={color}
          strokeWidth="1.5"
        />
      )}
      {status === "in_progress" && (
        <>
          <circle
            cx="8"
            cy="8"
            r="5.5"
            fill="none"
            stroke={color}
            strokeWidth="1.5"
          />
          <path d="M8 2.5 A5.5 5.5 0 0 1 13.5 8 L8 8 Z" fill={color} />
        </>
      )}
      {status === "blocked" && (
        <>
          <circle
            cx="8"
            cy="8"
            r="5.5"
            fill="none"
            stroke={color}
            strokeWidth="1.5"
          />
          <rect x="4.5" y="7.25" width="7" height="1.5" rx="0.5" fill={color} />
        </>
      )}
      {status === "needs_you" && (
        <>
          <circle
            cx="8"
            cy="8"
            r="5.5"
            fill="none"
            stroke={color}
            strokeWidth="1.5"
          />
          <circle cx="8" cy="8" r="2.2" fill={color} />
        </>
      )}
      {status === "done" && (
        <>
          <circle cx="8" cy="8" r="6" fill={color} />
          <path
            d="M5 8.2 L7.1 10.2 L11.2 5.8"
            fill="none"
            stroke="var(--paper)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}
      {status === "cancelled" && (
        <>
          <circle
            cx="8"
            cy="8"
            r="5.5"
            fill="none"
            stroke={color}
            strokeWidth="1.5"
          />
          <line
            x1="4.5"
            y1="4.5"
            x2="11.5"
            y2="11.5"
            stroke={color}
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </>
      )}
    </svg>
  );
}
