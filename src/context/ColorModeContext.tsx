import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ThemeProvider, CssBaseline, type PaletteMode } from "@mui/material";
import { getTheme, getTokens, type AppTokens } from "../theme";

export type ColorModePref = "light" | "dark" | "system";

interface ColorModeContextType {
  mode: PaletteMode;
  preference: ColorModePref;
  setPreference: (pref: ColorModePref) => void;
  tokens: AppTokens;
}

const ColorModeContext = createContext<ColorModeContextType>({
  mode: "light",
  preference: "system",
  setPreference: () => {},
  tokens: getTokens("light"),
});

function getSystemMode(): PaletteMode {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function getInitialPref(): ColorModePref {
  const stored = localStorage.getItem("color-mode");
  if (stored === "dark" || stored === "light" || stored === "system") return stored;
  return "system";
}

function resolveMode(pref: ColorModePref): PaletteMode {
  return pref === "system" ? getSystemMode() : pref;
}

// ─── View Transition (smooth whole-page cross-fade) ──────────
// Uses the native View Transitions API to snapshot the entire page,
// then cross-fades old → new so every pixel changes simultaneously.
function injectViewTransitionStyles() {
  const id = "theme-vt-style";
  if (document.getElementById(id)) return;
  const style = document.createElement("style");
  style.id = id;
  style.textContent = `
    ::view-transition-old(root),
    ::view-transition-new(root) {
      animation-duration: 350ms;
      animation-timing-function: ease-in-out;
    }
    ::view-transition-old(root) { animation-name: fade-out; }
    ::view-transition-new(root) { animation-name: fade-in; }
    @keyframes fade-out { from { opacity: 1 } to { opacity: 0 } }
    @keyframes fade-in  { from { opacity: 0 } to { opacity: 1 } }
  `;
  document.head.appendChild(style);
}

function withViewTransition(update: () => void) {
  if (typeof document !== "undefined" && (document as any).startViewTransition) {
    injectViewTransitionStyles();
    (document as any).startViewTransition(update);
  } else {
    update();
  }
}

// ─── Provider ───────────────────────────────────────────────
export function ColorModeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ColorModePref>(getInitialPref);
  const [mode, setMode] = useState<PaletteMode>(() => resolveMode(getInitialPref()));

  const setPreference = useCallback((pref: ColorModePref) => {
    const newMode = resolveMode(pref);
    const apply = () => {
      localStorage.setItem("color-mode", pref);
      setPreferenceState(pref);
      setMode(newMode);
    };
    // Skip animation if resolved mode is the same
    setMode(prev => {
      if (prev === newMode) { apply(); }
      else { withViewTransition(apply); }
      return prev; // let apply() handle the actual update
    });
  }, []);

  // Listen for OS theme changes when preference is "system"
  useEffect(() => {
    if (preference !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      withViewTransition(() => setMode(e.matches ? "dark" : "light"));
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [preference]);

  const theme = useMemo(() => getTheme(mode), [mode]);
  const tokens = useMemo(() => getTokens(mode), [mode]);

  const value = useMemo(() => ({ mode, preference, setPreference, tokens }), [mode, preference, setPreference, tokens]);

  return (
    <ColorModeContext.Provider value={value}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ColorModeContext.Provider>
  );
}

export function useColorMode() {
  return useContext(ColorModeContext);
}

export function useTokens(): AppTokens {
  return useContext(ColorModeContext).tokens;
}
