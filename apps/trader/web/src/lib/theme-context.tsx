import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

export type Theme = "green" | "light" | "dark";

const THEME_ORDER: Theme[] = ["green", "light", "dark"];

interface ThemeContextValue {
  theme: Theme;
  setTheme: (t: Theme) => void;
  cycleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "green",
  setTheme: () => {},
  cycleTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "green";
  const stored = localStorage.getItem("prime-theme");
  if (stored === "green" || stored === "light" || stored === "dark") return stored;
  // Migrate old "dark" value (which was actually the green theme)
  if (stored === null) return "green";
  return "green";
}

function applyThemeClass(theme: Theme): void {
  const root = document.documentElement;
  root.classList.remove("green", "light", "dark");
  // "green" is the default @theme in CSS — no class needed.
  // "light" and "dark" have explicit overrides.
  if (theme !== "green") {
    root.classList.add(theme);
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    applyThemeClass(theme);
    localStorage.setItem("prime-theme", theme);
  }, [theme]);

  function setTheme(t: Theme) {
    setThemeState(t);
  }

  function cycleTheme() {
    setThemeState((prev) => {
      const idx = THEME_ORDER.indexOf(prev);
      return THEME_ORDER[(idx + 1) % THEME_ORDER.length];
    });
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, cycleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
