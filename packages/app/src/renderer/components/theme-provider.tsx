import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useState } from "react";

export type Theme = "dark" | "light" | "system";

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
}

interface ThemeProviderState {
  theme: Theme;
  resolvedTheme: Exclude<Theme, "system">;
  setTheme: (theme: Theme) => void;
}

const SYSTEM_THEME_QUERY = "(prefers-color-scheme: dark)";

const ThemeProviderContext = createContext<ThemeProviderState | null>(null);

function isTheme(value: string | null): value is Theme {
  return value === "light" || value === "dark" || value === "system";
}

function getSystemTheme(): Exclude<Theme, "system"> {
  return window.matchMedia(SYSTEM_THEME_QUERY).matches ? "dark" : "light";
}

function readStoredTheme(storageKey: string, defaultTheme: Theme): Theme {
  try {
    const storedTheme = window.localStorage.getItem(storageKey);
    if (isTheme(storedTheme)) {
      return storedTheme;
    }
  } catch {
    return defaultTheme;
  }

  return defaultTheme;
}

export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "divisor-agent.theme",
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(() => {
    return readStoredTheme(storageKey, defaultTheme);
  });
  const [systemTheme, setSystemTheme] = useState<Exclude<Theme, "system">>(() => {
    return getSystemTheme();
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia(SYSTEM_THEME_QUERY);
    const handleChange = (event: MediaQueryListEvent) => {
      setSystemTheme(event.matches ? "dark" : "light");
    };

    setSystemTheme(mediaQuery.matches ? "dark" : "light");
    mediaQuery.addEventListener("change", handleChange);

    return () => {
      mediaQuery.removeEventListener("change", handleChange);
    };
  }, []);

  const resolvedTheme = theme === "system" ? systemTheme : theme;

  useLayoutEffect(() => {
    const root = window.document.documentElement;

    root.dataset.themePreference = theme;
    root.dataset.theme = resolvedTheme;
    root.classList.remove("light", "dark");
    root.classList.add(resolvedTheme);
    root.style.colorScheme = resolvedTheme;

    void window.electronAPI.invoke("setWindowControlsTheme", resolvedTheme);
  }, [resolvedTheme, theme]);

  const setTheme = (nextTheme: Theme) => {
    try {
      window.localStorage.setItem(storageKey, nextTheme);
    } catch {
      // Ignore storage failures and still update in-memory state.
    }

    setThemeState(nextTheme);
  };

  const value = useMemo<ThemeProviderState>(() => {
    return {
      theme,
      resolvedTheme,
      setTheme,
    };
  }, [resolvedTheme, theme]);

  return <ThemeProviderContext.Provider value={value}>{children}</ThemeProviderContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeProviderContext);

  if (context === null) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }

  return context;
}
