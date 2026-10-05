import { useEffect, useState, type ReactNode } from "react";
import {
  formatDateTimeField,
  fromDateAndTime,
  toDateInputValue,
  toTimeInputValue,
} from "../lib/format";
import "./DateTimeField.css";

type Props = {
  label: string;
  icon?: ReactNode;
  value: string | null;
  disabled?: boolean;
  onChange: (iso: string | null) => void;
};

export function DateTimeField({
  label,
  icon,
  value,
  disabled,
  onChange,
}: Props) {
  const [date, setDate] = useState(toDateInputValue(value));
  const [time, setTime] = useState(toTimeInputValue(value));
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setDate(toDateInputValue(value));
    setTime(toTimeInputValue(value));
  }, [value]);

  function commit(nextDate: string, nextTime: string) {
    if (!nextDate) {
      onChange(null);
      return;
    }
    const iso = fromDateAndTime(nextDate, nextTime || "00:00");
    onChange(iso);
  }

  return (
    <div className="dt-field">
      <span className="dt-label">
        {icon} {label}
      </span>
      <button
        type="button"
        className="dt-display mono"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {value ? formatDateTimeField(value) : "Sin fecha"}
      </button>
      {open && !disabled ? (
        <div className="dt-popover" role="dialog" aria-label={label}>
          <label>
            Fecha
            <input
              type="date"
              className="dt-native"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                commit(e.target.value, time);
              }}
            />
          </label>
          <label>
            Hora
            <input
              type="time"
              className="dt-native"
              value={time}
              onChange={(e) => {
                setTime(e.target.value);
                commit(date, e.target.value);
              }}
            />
          </label>
          <div className="dt-actions">
            <button
              type="button"
              className="linkish"
              onClick={() => {
                setDate("");
                setTime("");
                onChange(null);
                setOpen(false);
              }}
            >
              Quitar
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setOpen(false)}
            >
              Listo
            </button>
          </div>
          <div className="dt-hint mono">
            {value ? formatDateTimeField(value) : "—"} · 24 h · Europe/Paris
          </div>
        </div>
      ) : null}
    </div>
  );
}
