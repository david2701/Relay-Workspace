import { useEffect, useId, useMemo, useRef, useState } from "react";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function parseLooseTime(raw: string): { hh: number; mm: number } | null {
  const t = raw.trim().toLowerCase().replace(/\./g, ":");
  let m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (m) {
    const hh = Number(m[1]);
    const mm = Number(m[2]);
    if (hh > 23 || mm > 59) return null;
    return { hh, mm };
  }
  m = t.match(/^(\d{1,2})h(\d{2})?$/);
  if (m) {
    const hh = Number(m[1]);
    const mm = m[2] ? Number(m[2]) : 0;
    if (hh > 23 || mm > 59) return null;
    return { hh, mm };
  }
  m = t.match(/^(\d{3,4})$/);
  if (m) {
    const digits = m[1]!;
    const hh =
      digits.length === 3 ? Number(digits[0]) : Number(digits.slice(0, 2));
    const mm = Number(digits.slice(-2));
    if (hh > 23 || mm > 59) return null;
    return { hh, mm };
  }
  m = t.match(/^(\d{1,2})$/);
  if (m) {
    const hh = Number(m[1]);
    if (hh > 23) return null;
    return { hh, mm: 0 };
  }
  return null;
}

const STEPS: string[] = (() => {
  const out: string[] = [];
  for (let h = 0; h < 24; h += 1) {
    for (let m = 0; m < 60; m += 15) {
      out.push(`${pad(h)}:${pad(m)}`);
    }
  }
  return out;
})();

type Props = {
  value: string; // HH:mm or ""
  disabled?: boolean;
  onChange: (hhmm: string) => void;
  onConfirm?: () => void;
};

export function TimeCombobox({
  value,
  disabled,
  onChange,
  onConfirm,
}: Props) {
  const listId = useId();
  const [text, setText] = useState(value);
  const [open, setOpen] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    setText(value);
  }, [value]);

  useEffect(() => {
    if (!open || !listRef.current) return;
    const target = value || "09:00";
    const el = listRef.current.querySelector(`[data-t="${target}"]`);
    el?.scrollIntoView({ block: "center" });
  }, [open, value]);

  const options = useMemo(() => STEPS, []);

  function commitText(raw: string) {
    const parsed = parseLooseTime(raw);
    if (!parsed) return false;
    const hhmm = `${pad(parsed.hh)}:${pad(parsed.mm)}`;
    setText(hhmm);
    onChange(hhmm);
    return true;
  }

  function nudge(minutes: number) {
    const cur = parseLooseTime(text) ?? { hh: 9, mm: 0 };
    let total = cur.hh * 60 + cur.mm + minutes;
    if (total < 0) total += 24 * 60;
    total %= 24 * 60;
    const hhmm = `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
    setText(hhmm);
    onChange(hhmm);
  }

  return (
    <div className="dtp-time">
      <label className="dtp-time-label">
        Hora
        <input
          type="text"
          className="dtp-time-input mono"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-label="Hora, formato 24 horas"
          disabled={disabled}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
            const parsed = parseLooseTime(e.target.value);
            if (parsed) {
              onChange(`${pad(parsed.hh)}:${pad(parsed.mm)}`);
            }
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            window.setTimeout(() => setOpen(false), 120);
            commitText(text);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowUp") {
              e.preventDefault();
              nudge(e.shiftKey ? 60 : 15);
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              nudge(e.shiftKey ? -60 : -15);
            } else if (e.key === "Enter") {
              e.preventDefault();
              if (commitText(text)) onConfirm?.();
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
        />
      </label>
      {open && !disabled ? (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          className="dtp-time-list"
          aria-label="Horas"
        >
          {options.map((t) => (
            <li key={t} role="option" aria-selected={t === value} data-t={t}>
              <button
                type="button"
                className={`dtp-time-opt mono${t === value ? " selected" : ""}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setText(t);
                  onChange(t);
                  setOpen(false);
                }}
              >
                {t}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
