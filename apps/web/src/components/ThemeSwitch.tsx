type Theme = "light" | "dark" | "system";

type Props = {
  theme: Theme;
  onChange: (t: Theme) => void;
};

const OPTIONS: { id: Theme; label: string }[] = [
  { id: "light", label: "Claro" },
  { id: "dark", label: "Oscuro" },
  { id: "system", label: "Sistema" },
];

export function ThemeSwitch({ theme, onChange }: Props) {
  return (
    <div
      className="theme-switch"
      role="group"
      aria-label="Tema"
    >
      {OPTIONS.map((opt) => (
        <button
          key={opt.id}
          type="button"
          className={theme === opt.id ? "on" : ""}
          aria-pressed={theme === opt.id}
          onClick={() => onChange(opt.id)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
