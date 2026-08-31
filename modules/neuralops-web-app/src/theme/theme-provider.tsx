"use client";

import { createContext, useContext, useEffect, useState } from "react";

export type ThemePreference = "light" | "dark" | "system";
const STORAGE_KEY = "nx-theme";

const ThemeContext = createContext<{ theme: ThemePreference; setTheme: (t: ThemePreference) => void }>({
  theme: "system",
  setTheme: () => {},
});

function apply(pref: ThemePreference) {
  const root = document.documentElement;
  if (pref === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", pref);
}

// Inline script so the first paint honors the stored preference (no flash).
const bootScript = `try{var t=localStorage.getItem("${STORAGE_KEY}");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>("system");

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== "light" && stored !== "dark") return;
    const raf = requestAnimationFrame(() => setThemeState(stored));
    return () => cancelAnimationFrame(raf);
  }, []);

  const setTheme = (t: ThemePreference) => {
    setThemeState(t);
    if (t === "system") localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, t);
    apply(t);
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      <script dangerouslySetInnerHTML={{ __html: bootScript }} />
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
