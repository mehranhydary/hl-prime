import { useState, useRef, useEffect } from "react";
import { useTheme, type Theme } from "../lib/theme-context";

const THEMES: { key: Theme; label: string; icon: React.ReactNode }[] = [
  {
    key: "green",
    label: "Green",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.115 5.19l.319 1.913A6 6 0 008.11 10.36L9.75 12l-.387.775c-.217.433-.132.956.21 1.298l1.348 1.348c.21.21.329.497.329.795v1.089c0 .426.24.815.622 1.006l.153.076c.433.217.956.132 1.298-.21l.723-.723a8.7 8.7 0 002.288-4.042 1.087 1.087 0 00-.358-1.099l-1.33-1.108c-.251-.209-.553-.334-.869-.378l-2.095-.263a1.5 1.5 0 01-.451-.116l-.353-.176a2.625 2.625 0 01-1.14-1.14l-.794-1.588A2.646 2.646 0 006.115 5.19zM20.25 12c0 4.556-3.694 8.25-8.25 8.25S3.75 16.556 3.75 12 7.444 3.75 12 3.75s8.25 3.694 8.25 8.25z" />
      </svg>
    ),
  },
  {
    key: "light",
    label: "Light",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
      </svg>
    ),
  },
  {
    key: "dark",
    label: "Dark",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
      </svg>
    ),
  },
];

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const current = THEMES.find((t) => t.key === theme)!;

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="bg-surface-2 hover:bg-surface-3 border border-border h-8 px-2 flex items-center gap-1.5 transition-colors"
        title={`Theme: ${current.label}`}
      >
        <span className="text-text-muted">{current.icon}</span>
        <span className="text-[10px] text-text-muted tracking-wide hidden sm:inline">{current.label}</span>
        <svg className="w-3 h-3 text-text-dim" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-surface-1 border border-border shadow-lg min-w-[120px]">
          {THEMES.map((t) => (
            <button
              key={t.key}
              onClick={() => {
                setTheme(t.key);
                setOpen(false);
              }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors ${
                theme === t.key
                  ? "text-accent bg-accent-muted"
                  : "text-text-secondary hover:bg-surface-2 hover:text-text-primary"
              }`}
            >
              <span className="shrink-0">{t.icon}</span>
              <span>{t.label}</span>
              {theme === t.key && (
                <svg className="w-3 h-3 ml-auto text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
