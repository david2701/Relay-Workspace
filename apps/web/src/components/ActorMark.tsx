import type { CSSProperties } from "react";
import { hoursSince } from "../lib/format";

type Kind = "user" | "agent" | "unassigned" | "system";

type Props = {
  kind: Kind;
  name: string;
  monogram: string;
  size?: 16 | 20 | 24;
  working?: boolean;
  stale?: boolean;
};

export function ActorMark({
  kind,
  name,
  monogram,
  size = 20,
  working = false,
  stale = false,
}: Props) {
  const radius =
    kind === "user" || kind === "unassigned" ? "50%" : `${size * 0.25}px`;
  const isDashed = kind === "unassigned" || kind === "system";
  const style: CSSProperties = {
    width: size,
    height: size,
    borderRadius: radius,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    flexShrink: 0,
    fontSize: kind === "agent" ? size * 0.42 : size * 0.5,
    fontWeight: 600,
    letterSpacing: 0,
    lineHeight: 1,
    background:
      kind === "user"
        ? "var(--ink)"
        : kind === "agent"
          ? "var(--raised)"
          : "transparent",
    color:
      kind === "user"
        ? "var(--paper)"
        : kind === "system"
          ? "var(--ink-muted)"
          : "var(--ink)",
    border:
      kind === "agent"
        ? "1px solid var(--ink-2)"
        : isDashed
          ? "1px dashed var(--control)"
          : "none",
  };
  const role =
    kind === "user"
      ? "Persona"
      : kind === "agent"
        ? "Agente"
        : kind === "system"
          ? "Sistema"
          : "Sin asignar";
  const label = `${name} · ${role}`;
  return (
    <span className="actor-mark" style={style} title={label} aria-label={label}>
      {kind === "unassigned" ? null : monogram}
      {working ? (
        <span
          className={stale ? "work-dot stale" : "work-dot"}
          aria-hidden
        />
      ) : null}
    </span>
  );
}

export function isStaleWorking(
  status: string,
  assigneeType: string,
  updatedAt: string,
): boolean {
  return (
    status === "in_progress" &&
    assigneeType === "agent" &&
    hoursSince(updatedAt) > 24
  );
}

export function isWorking(
  status: string,
  assigneeType: string,
  updatedAt: string,
): boolean {
  return (
    status === "in_progress" &&
    assigneeType === "agent" &&
    hoursSince(updatedAt) <= 24
  );
}
