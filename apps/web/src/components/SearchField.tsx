import { MagnifyingGlass, X } from "@phosphor-icons/react";
import { useEffect, useId, useRef, useState } from "react";

type Props = {
  value: string;
  placeholder?: string | undefined;
  disabled?: boolean | undefined;
  searching?: boolean | undefined;
  error?: string | null | undefined;
  countText?: string | null | undefined;
  onChange: (value: string) => void;
  onClear: () => void;
  onEnter?: (() => void) | undefined;
  onEscape?: (() => void) | undefined;
  onArrowDown?: (() => void) | undefined;
};

export function SearchField({
  value,
  placeholder = "Buscar en ítems y notas…",
  disabled,
  searching,
  error,
  countText,
  onChange,
  onClear,
  onEnter,
  onEscape,
  onArrowDown,
}: Props) {
  const id = useId();
  const countId = `${id}-count`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [showBar, setShowBar] = useState(false);

  useEffect(() => {
    if (!searching) {
      setShowBar(false);
      return;
    }
    const t = window.setTimeout(() => setShowBar(true), 300);
    return () => window.clearTimeout(t);
  }, [searching]);

  return (
    <div className={`search-field${showBar ? " searching" : ""}`}>
      <MagnifyingGlass
        size={14}
        className="search-field-icon"
        aria-hidden
      />
      <input
        ref={inputRef}
        id="view-filter"
        type="search"
        role="searchbox"
        className="search-field-input"
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        title={disabled ? "Sin conexión con la API local" : undefined}
        aria-label="Buscar en ítems y notas"
        aria-keyshortcuts="/"
        aria-describedby={countText ? countId : undefined}
        aria-invalid={error ? true : undefined}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onEnter?.();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            if (value) {
              onClear();
            } else {
              onEscape?.();
            }
          }
          if (e.key === "ArrowDown") {
            e.preventDefault();
            onArrowDown?.();
          }
        }}
      />
      {value ? (
        <button
          type="button"
          className="search-field-clear"
          aria-label="Borrar búsqueda"
          onClick={() => {
            onClear();
            inputRef.current?.focus();
          }}
        >
          <X size={12} weight="bold" aria-hidden />
        </button>
      ) : (
        <kbd className="search-field-kbd" aria-hidden>
          /
        </kbd>
      )}
      {showBar ? <div className="search-field-bar" aria-hidden /> : null}
      {error ? (
        <p className="search-field-error" role="alert">
          {error}{" "}
          <button type="button" className="linkish" onClick={() => onChange(value)}>
            Reintentar
          </button>
        </p>
      ) : null}
      {countText ? (
        <p id={countId} className="sr-only" aria-live="polite">
          {countText}
        </p>
      ) : null}
    </div>
  );
}

export function focusSearchField(): void {
  const el = document.getElementById("view-filter") as HTMLInputElement | null;
  if (!el) return;
  el.focus();
  el.select();
}
