import { useT } from "../i18n/I18nProvider";
import type { MessageKey } from "../i18n/types";

type Theme = "light" | "dark" | "system";

type Props = {
  theme: Theme;
  onChange: (t: Theme) => void;
};

const THEME_KEYS: Record<Theme, MessageKey> = {
  light: "theme.light",
  dark: "theme.dark",
  system: "theme.system",
};

export function ThemeSwitch({ theme, onChange }: Props) {
  const t = useT();
  return (
    <div
      className="theme-switch"
      role="group"
      aria-label={t("a11y.theme")}
    >
      {(["light", "dark", "system"] as const).map((id) => (
        <button
          key={id}
          type="button"
          className={theme === id ? "on" : ""}
          aria-pressed={theme === id}
          onClick={() => onChange(id)}
        >
          {t(THEME_KEYS[id])}
        </button>
      ))}
    </div>
  );
}
