import { createTheme, alpha, type PaletteMode } from "@mui/material/styles";

// ─── Shared (mode-independent) ──────────────────────────────
const shared = {
  brand:       "#2563EB",
  brandDark:   "#1D4ED8",
  accent:      "#7C3AED",
  radius: { sm: 8, md: 12, lg: 16, xl: 20, pill: 999 },
};

// ─── Light Tokens ───────────────────────────────────────────
const lightColors = {
  brand:       "#2563EB",
  brandDark:   "#1D4ED8",
  brandLight:  "#EFF6FF",
  brandSubtle: "#BFDBFE",
  accent:      "#7C3AED",
  accentDark:  "#6D28D9",
  success:     "#059669",
  successDark: "#047857",
  successBg:   "#ECFDF5",
  error:       "#DC2626",
  errorBg:     "#FEF2F2",
  warning:     "#D97706",
  warningBg:   "#FFFBEB",
  gray50:      "#F8FAFC",
  gray100:     "#F1F5F9",
  gray200:     "#E2E8F0",
  gray300:     "#CBD5E1",
  gray400:     "#94A3B8",
  gray500:     "#64748B",
  gray600:     "#475569",
  gray700:     "#334155",
  gray800:     "#1E293B",
  gray900:     "#0F172A",
  white:       "#FFFFFF",
  pureWhite:   "#FFFFFF",  // always white — for hero banners, FABs
};

const lightShadow = {
  xs:   "0 1px 2px rgba(0,0,0,0.03)",
  sm:   "0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.03)",
  md:   "0 4px 12px rgba(0,0,0,0.06)",
  lg:   "0 10px 30px rgba(0,0,0,0.08)",
  card: "0 1px 3px rgba(0,0,0,0.03), 0 0 0 1px rgba(0,0,0,0.02)",
  hover:"0 8px 24px rgba(0,0,0,0.1), 0 0 0 1px rgba(0,0,0,0.03)",
};

// ─── Dark Tokens ────────────────────────────────────────────
// Design principles:
//  • Background is warm dark gray (not pure black) to reduce eye strain
//  • Card surfaces are 1-2 steps lighter than bg for visual depth / elevation
//  • Text is off-white (#E8ECF1) to avoid harsh contrast
//  • Accent / status colors are slightly desaturated & lightened so they
//    remain legible on dark surfaces without glowing
//  • Status-bg colors use very low-alpha tints, not saturated darks
const darkColors = {
  brand:       "#60A5FA",   // lighter blue — legible on dark bg
  brandDark:   "#3B82F6",
  brandLight:  "#1E293B",   // subtle tinted surface for brand highlights
  brandSubtle: "#2B4066",   // muted blue for chips / badges
  accent:      "#A78BFA",   // lighter purple
  accentDark:  "#7C3AED",
  success:     "#34D399",   // bright enough on dark
  successDark: "#059669",
  successBg:   "rgba(52,211,153,0.10)",
  error:       "#F87171",   // softer red
  errorBg:     "rgba(248,113,113,0.10)",
  warning:     "#FBBF24",   // warm amber
  warningBg:   "rgba(251,191,36,0.10)",
  // Gray scale — warm undertone, not blue-shifted
  gray50:      "#111318",   // page background
  gray100:     "#1A1D24",   // recessed surfaces, toggle-group bg
  gray200:     "#262A33",   // borders, dividers
  gray300:     "#3B4150",   // subtle borders, disabled
  gray400:     "#6B7486",   // placeholder, secondary text
  gray500:     "#9BA3B2",   // caption, muted text
  gray600:     "#B8BFC9",
  gray700:     "#D1D7E0",
  gray800:     "#E0E4EA",   // primary readable text
  gray900:     "#E8ECF1",   // headings, high-emphasis text
  white:       "#1A1D24",   // card / paper surface (1 step above bg)
  pureWhite:   "#FFFFFF",   // always white — for hero banners, FABs
};

const darkShadow = {
  xs:   "0 1px 2px rgba(0,0,0,0.30)",
  sm:   "0 1px 3px rgba(0,0,0,0.35), 0 1px 2px rgba(0,0,0,0.25)",
  md:   "0 4px 12px rgba(0,0,0,0.45)",
  lg:   "0 10px 30px rgba(0,0,0,0.55)",
  card: "0 1px 4px rgba(0,0,0,0.30), 0 0 0 1px rgba(255,255,255,0.04)",
  hover:"0 8px 24px rgba(0,0,0,0.50), 0 0 0 1px rgba(255,255,255,0.06)",
};

// ─── Gradients ──────────────────────────────────────────────
const lightGradients = {
  hero:    "linear-gradient(135deg, #2563EB 0%, #7C3AED 100%)",
  heroAlt: "linear-gradient(135deg, #1E293B 0%, #334155 100%)",
  success: "linear-gradient(135deg, #059669 0%, #10B981 100%)",
  warm:    "linear-gradient(135deg, #F59E0B 0%, #EF4444 100%)",
  accentCard: "linear-gradient(135deg, #7C3AED 0%, #A855F7 100%)",
};

// Dark gradients: single-hue families, 2 shades apart — clean & readable.
const darkGradients = {
  hero:       "linear-gradient(135deg, #1E3A8A 0%, #1D4ED8 100%)",
  heroAlt:    "linear-gradient(135deg, #1E293B 0%, #334155 100%)",
  success:    "linear-gradient(135deg, #047857 0%, #059669 100%)",
  warm:       "linear-gradient(135deg, #B45309 0%, #D97706 100%)",
  accentCard: "linear-gradient(135deg, #5B21B6 0%, #7C3AED 100%)",
};

// ─── Type colors (per-mode) ─────────────────────────────────
const lightTypeColors = {
  BROKER:      "#2563EB",
  SAVINGS:     "#059669",
  CREDIT_CARD: "#DC2626",
  LOAN:        "#D97706",
  OTHER:       "#64748B",
} as Record<string, string>;

const darkTypeColors = {
  BROKER:      "#60A5FA",
  SAVINGS:     "#34D399",
  CREDIT_CARD: "#F87171",
  LOAN:        "#FBBF24",
  OTHER:       "#9BA3B2",
} as Record<string, string>;

// ─── Accent palettes (for cards with colored borders/avatars) ─
const lightAccentPalette = ["#2563EB", "#7C3AED", "#059669", "#D97706", "#DC2626", "#0891B2", "#DB2777", "#4F46E5"];
const darkAccentPalette  = ["#60A5FA", "#A78BFA", "#34D399", "#FBBF24", "#F87171", "#22D3EE", "#F472B6", "#818CF8"];

// ─── Build tokens for a mode ────────────────────────────────
function getTokens(mode: PaletteMode) {
  const colors = mode === "light" ? lightColors : darkColors;
  const shadow = mode === "light" ? lightShadow : darkShadow;
  const gradients = mode === "light" ? lightGradients : darkGradients;
  const typeColors = mode === "light" ? lightTypeColors : darkTypeColors;
  const accentPalette = mode === "light" ? lightAccentPalette : darkAccentPalette;
  return { colors, gradients, typeColors, accentPalette, radius: shared.radius, shadow };
}

export type AppTokens = ReturnType<typeof getTokens>;

// ─── Build MUI theme for a mode ─────────────────────────────
function getTheme(mode: PaletteMode) {
  const t = getTokens(mode);
  const { colors, shadow } = t;
  const { radius } = shared;

  return createTheme({
    palette: {
      mode,
      primary:    { main: colors.brand, dark: colors.brandDark, light: colors.brandLight },
      secondary:  { main: colors.accent },
      success:    { main: colors.success },
      error:      { main: colors.error },
      warning:    { main: colors.warning },
      background: { default: colors.gray50, paper: colors.white },
      text:       { primary: colors.gray900, secondary: colors.gray500 },
      divider:    colors.gray200,
      action:     { hover: alpha(colors.gray900, 0.04), selected: alpha(colors.brand, 0.08) },
    },
    typography: {
      fontFamily: '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, sans-serif',
      h4: { fontWeight: 700, fontSize: "1.75rem", lineHeight: 1.3, letterSpacing: "-0.02em" },
      h5: { fontWeight: 700, fontSize: "1.375rem", lineHeight: 1.35, letterSpacing: "-0.01em" },
      h6: { fontWeight: 600, fontSize: "1.125rem", lineHeight: 1.4 },
      subtitle1: { fontWeight: 600, fontSize: "0.9375rem", lineHeight: 1.5 },
      subtitle2: { fontWeight: 600, fontSize: "0.8125rem", lineHeight: 1.5 },
      body1: { fontSize: "0.9375rem", lineHeight: 1.6 },
      body2: { fontSize: "0.8125rem", lineHeight: 1.55 },
      caption: { fontSize: "0.75rem", lineHeight: 1.5, color: colors.gray500 },
      overline: { fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: colors.gray400 },
      button: { textTransform: "none", fontWeight: 600, fontSize: "0.875rem", letterSpacing: "0.01em" },
    },
    shape: { borderRadius: radius.md },
    transitions: {
      duration: { shortest: 120, shorter: 180, short: 240, standard: 280, complex: 375 },
      easing: { easeOut: "cubic-bezier(0.16, 1, 0.3, 1)" },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          "*, *::before, *::after": { boxSizing: "border-box" },
          html: { WebkitFontSmoothing: "antialiased", MozOsxFontSmoothing: "grayscale", scrollBehavior: "smooth" },
          body: { overflowX: "hidden" },
          "@media (prefers-reduced-motion: reduce)": { "*, *::before, *::after": { animationDuration: "0.01ms !important", transitionDuration: "0.01ms !important" } },
        },
      },
      MuiAppBar: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: { backgroundColor: alpha(colors.white, 0.85), backdropFilter: "blur(12px)", color: colors.gray900, borderBottom: `1px solid ${colors.gray200}` },
        },
      },
      MuiPaper: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: { backgroundImage: "none", borderRadius: radius.lg, border: `1px solid ${colors.gray200}`, boxShadow: shadow.card, transition: "box-shadow 0.2s ease, border-color 0.2s ease" },
          elevation1: { boxShadow: shadow.sm },
        },
      },
      MuiCard: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: { borderRadius: radius.lg, border: `1px solid ${colors.gray200}`, boxShadow: shadow.card, backgroundImage: "none", transition: "box-shadow 0.2s ease, transform 0.2s ease" },
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true, disableRipple: false },
        styleOverrides: {
          root: { borderRadius: radius.pill, padding: "8px 20px", fontWeight: 600, transition: "all 0.2s ease" },
          sizeSmall: { padding: "4px 14px", fontSize: "0.8125rem" },
          sizeLarge: { padding: "12px 28px", fontSize: "1rem" },
          contained: { "&:hover": { transform: "translateY(-1px)", boxShadow: shadow.sm } },
          outlined: { borderColor: colors.gray300, "&:hover": { borderColor: colors.brand, backgroundColor: alpha(colors.brand, 0.04) } },
          text: { "&:hover": { backgroundColor: alpha(colors.gray900, 0.04) } },
        },
      },
      MuiFab: {
        styleOverrides: {
          root: { borderRadius: radius.lg, textTransform: "none", fontWeight: 600, boxShadow: shadow.lg, transition: "all 0.2s ease", "&:hover": { transform: "translateY(-2px)" } },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: { fontWeight: 500, borderRadius: radius.sm, height: 28 },
          sizeSmall: { height: 22, fontSize: "0.6875rem" },
        },
      },
      MuiToggleButton: {
        styleOverrides: {
          root: {
            borderRadius: `${radius.pill}px !important`, textTransform: "none", padding: "6px 16px", fontWeight: 500,
            border: `1px solid ${colors.gray200} !important`, transition: "all 0.2s ease",
            "&.Mui-selected": { fontWeight: 600, backgroundColor: colors.brand, color: mode === "dark" ? "#FFFFFF" : "#FFFFFF", borderColor: `${colors.brand} !important`, "&:hover": { backgroundColor: colors.brandDark } },
          },
        },
      },
      MuiToggleButtonGroup: {
        styleOverrides: {
          root: { gap: 6, backgroundColor: colors.gray100, padding: 4, borderRadius: radius.pill },
          grouped: { margin: 0, border: "none !important" },
        },
      },
      MuiTab: {
        styleOverrides: {
          root: { textTransform: "none", fontWeight: 500, minWidth: "auto", padding: "12px 16px", fontSize: "0.875rem", transition: "color 0.2s ease", "&.Mui-selected": { fontWeight: 600 } },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: { borderRadius: radius.xl, boxShadow: shadow.lg, border: "none" },
        },
      },
      MuiDialogTitle: {
        styleOverrides: { root: { fontSize: "1.25rem", fontWeight: 700, padding: "24px 24px 8px", letterSpacing: "-0.01em" } },
      },
      MuiDialogContent: {
        styleOverrides: { root: { padding: "16px 24px" } },
      },
      MuiDialogActions: {
        styleOverrides: { root: { padding: "12px 24px 24px", gap: 8 } },
      },
      MuiTextField: {
        defaultProps: { variant: "outlined", size: "medium" },
        styleOverrides: {
          root: { "& .MuiOutlinedInput-root": { borderRadius: radius.md, transition: "box-shadow 0.2s ease", "&.Mui-focused": { boxShadow: `0 0 0 3px ${alpha(colors.brand, 0.15)}` } } },
        },
      },
      MuiAlert: {
        styleOverrides: { root: { borderRadius: radius.md, fontWeight: 500 } },
      },
      MuiLinearProgress: {
        styleOverrides: { root: { borderRadius: radius.sm, height: 6, backgroundColor: colors.gray100 } },
      },
      MuiSkeleton: {
        defaultProps: { animation: "wave" },
        styleOverrides: { root: { borderRadius: radius.sm } },
      },
      MuiSwitch: {
        styleOverrides: { root: { padding: 8 }, switchBase: { "&.Mui-checked": { "& + .MuiSwitch-track": { opacity: 1 } } } },
      },
      MuiBottomNavigation: {
        styleOverrides: {
          root: { borderTop: `1px solid ${colors.gray200}`, height: 64, backgroundColor: alpha(colors.white, 0.92), backdropFilter: "blur(12px)" },
        },
      },
      MuiBottomNavigationAction: {
        styleOverrides: {
          root: { minWidth: 0, padding: "6px 0", transition: "color 0.2s ease", "&.Mui-selected": { color: colors.brand } },
          label: { fontSize: "0.6875rem", fontWeight: 500, "&.Mui-selected": { fontWeight: 600, fontSize: "0.6875rem" } },
        },
      },
    },
  });
}

// Backward-compat: default light tokens
const tokens = getTokens("light");

export default getTheme("light");
export { tokens, getTokens, getTheme };
