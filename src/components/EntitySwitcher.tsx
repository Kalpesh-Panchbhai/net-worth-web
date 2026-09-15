import { useEffect, useMemo, useRef, useState } from "react";
import { Box, Typography, TextField, Avatar, Popover, Drawer, InputAdornment, IconButton, Stack, Tooltip } from "@mui/material";
import { alpha } from "@mui/material/styles";
import SearchIcon from "@mui/icons-material/Search";
import CheckIcon from "@mui/icons-material/Check";
import KeyboardArrowLeftIcon from "@mui/icons-material/KeyboardArrowLeft";
import KeyboardArrowRightIcon from "@mui/icons-material/KeyboardArrowRight";
import { useTokens } from "../context/ColorModeContext";
import { formatCurrency as fmt } from "../utils/format";

/** One row in the switcher list. Pages map their own summaries into this shape. */
export interface SwitcherItem {
  id: number;
  name: string;
  subtitle?: string;
  value: number;
  valueCurrency?: string;
  dayChange: number;
  dayChangePct: number;
  /** Content rendered inside the avatar (short text or an icon). */
  avatar: React.ReactNode;
  avatarBg: string;
  avatarColor: string;
  /** Hide the value / day-change column for rows where it is not meaningful. Defaults to true. */
  showMetrics?: boolean;
}

/**
 * Open/close + prev/next bookkeeping for a switcher. `items` must be pre-sorted the same way the
 * list is displayed, so the arrows step through it in visible order.
 */
export function useSwitcher(items: SwitcherItem[], currentId: number) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const idx = items.findIndex(x => x.id === currentId);
  return {
    anchorEl,
    open,
    hasSiblings: items.length > 1,
    prev: idx > 0 ? items[idx - 1] : null,
    next: idx >= 0 && idx < items.length - 1 ? items[idx + 1] : null,
    openSwitcher: (e: React.MouseEvent<HTMLElement>) => { setAnchorEl(e.currentTarget); setOpen(true); },
    close: () => setOpen(false),
  };
}

/**
 * Horizontal-swipe navigation for a hero card. Swipe left → next, swipe right → previous. Returns
 * touch handlers to spread onto the target element; it never calls preventDefault, so vertical
 * page scrolling is untouched, and a swipe only fires when the horizontal move clears `threshold`
 * and dominates the vertical move (so a scroll is not misread as a swipe).
 */
export function useSwipeNav({ onPrev, onNext, enabled = true, threshold = 50 }: {
  onPrev?: () => void;
  onNext?: () => void;
  enabled?: boolean;
  threshold?: number;
}) {
  const start = useRef<{ x: number; y: number } | null>(null);
  if (!enabled) return {};
  return {
    onTouchStart: (e: React.TouchEvent) => {
      const t = e.touches[0];
      start.current = { x: t.clientX, y: t.clientY };
    },
    onTouchEnd: (e: React.TouchEvent) => {
      if (!start.current) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - start.current.x;
      const dy = t.clientY - start.current.y;
      start.current = null;
      if (Math.abs(dx) < threshold || Math.abs(dx) < Math.abs(dy)) return;
      if (dx < 0) onNext?.();
      else onPrev?.();
    },
  };
}

/**
 * Prev/next arrow pair that steps through siblings in visible order. Each arrow carries a tooltip
 * previewing the entity it would jump to (name + value + day change), so the user sees where they
 * are going before clicking.
 */
export function SwitcherArrows({
  prev, next, onSelect, entityLabel, color, mutedColor, hoverBg,
}: {
  prev: SwitcherItem | null;
  next: SwitcherItem | null;
  onSelect: (id: number) => void;
  entityLabel: string;
  color: string;
  mutedColor: string;
  hoverBg: string;
}) {
  const tip = (label: string, it: SwitcherItem | null) => it ? (
    <Box sx={{ py: 0.25 }}>
      <Typography sx={{ fontSize: "0.58rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", opacity: 0.65 }}>
        {label}
      </Typography>
      <Typography sx={{ fontSize: "0.82rem", fontWeight: 700, lineHeight: 1.3 }}>{it.name}</Typography>
      {it.showMetrics !== false && (
        <Typography sx={{ fontSize: "0.72rem", opacity: 0.9 }}>
          {fmt(it.value, it.valueCurrency)} · {it.dayChange >= 0 ? "+" : ""}{it.dayChangePct.toFixed(1)}%
        </Typography>
      )}
    </Box>
  ) : "";
  const btnSx = { color, "&:hover": { bgcolor: hoverBg }, "&.Mui-disabled": { color: mutedColor, opacity: 0.4 } };
  return (
    <Stack direction="row" spacing={0} sx={{ flexShrink: 0 }}>
      <Tooltip title={tip("Previous", prev)} arrow disableInteractive>
        <span>
          <IconButton size="small" disabled={!prev} onClick={() => prev && onSelect(prev.id)}
            aria-label={prev ? `Previous ${entityLabel}: ${prev.name}` : `Previous ${entityLabel}`} sx={btnSx}>
            <KeyboardArrowLeftIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title={tip("Next", next)} arrow disableInteractive>
        <span>
          <IconButton size="small" disabled={!next} onClick={() => next && onSelect(next.id)}
            aria-label={next ? `Next ${entityLabel}: ${next.name}` : `Next ${entityLabel}`} sx={btnSx}>
            <KeyboardArrowRightIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
    </Stack>
  );
}

/**
 * Popover (desktop) / bottom sheet (mobile) that lists sibling entities so the user can jump
 * straight to one without going back to the parent list. Callers supply the already-loaded siblings,
 * so opening this costs no extra request.
 */
export function EntitySwitcher({
  open, anchorEl, onClose, items, currentId, isMobile, onSelect,
  title = "Switch", searchPlaceholder = "Search…", searchThreshold = 7,
}: {
  open: boolean;
  anchorEl: HTMLElement | null;
  onClose: () => void;
  items: SwitcherItem[];
  currentId: number;
  isMobile: boolean;
  onSelect: (id: number) => void;
  title?: string;
  searchPlaceholder?: string;
  searchThreshold?: number;
}) {
  const { colors } = useTokens();
  const [query, setQuery] = useState("");
  useEffect(() => { if (!open) setQuery(""); }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(it =>
      it.name.toLowerCase().includes(q) || (it.subtitle?.toLowerCase().includes(q) ?? false));
  }, [items, query]);

  // Search only earns its place once the list is long enough to scan for.
  const showSearch = items.length > searchThreshold;

  const list = (
    <Box sx={{ width: isMobile ? "auto" : 340, maxWidth: "100vw" }}>
      {showSearch && (
        <Box sx={{ p: 1.5, pb: 1, position: "sticky", top: 0, bgcolor: colors.white, zIndex: 1 }}>
          <TextField
            autoFocus size="small" fullWidth placeholder={searchPlaceholder}
            value={query} onChange={e => setQuery(e.target.value)}
            InputProps={{ startAdornment: (
              <InputAdornment position="start"><SearchIcon sx={{ fontSize: 18, color: colors.gray400 }} /></InputAdornment>
            ) }}
          />
        </Box>
      )}
      <Box sx={{ maxHeight: isMobile ? "60vh" : 360, overflowY: "auto", pb: 0.5 }}>
        {filtered.length === 0 ? (
          <Typography sx={{ px: 2, py: 2.5, fontSize: "0.85rem", color: colors.gray400, textAlign: "center" }}>
            Nothing found
          </Typography>
        ) : filtered.map(it => {
          const isCurrent = it.id === currentId;
          const dayColor = it.dayChange >= 0 ? colors.success : colors.error;
          const showMetrics = it.showMetrics !== false;
          return (
            <Box
              key={it.id}
              onClick={() => (isCurrent ? onClose() : onSelect(it.id))}
              sx={{
                display: "flex", alignItems: "center", gap: 1.25,
                px: 2, py: 1.15, cursor: "pointer",
                bgcolor: isCurrent ? alpha(colors.brand, 0.08) : "transparent",
                "&:hover": { bgcolor: alpha(colors.brand, isCurrent ? 0.12 : 0.05) },
              }}
            >
              <Avatar sx={{ width: 30, height: 30, bgcolor: it.avatarBg, color: it.avatarColor, fontSize: "0.58rem", fontWeight: 800, borderRadius: 1.5 }}>
                {it.avatar}
              </Avatar>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography noWrap sx={{ fontSize: "0.85rem", fontWeight: isCurrent ? 700 : 600, color: colors.gray900 }}>
                  {it.name}
                </Typography>
                {it.subtitle && (
                  <Typography noWrap sx={{ fontSize: "0.66rem", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: colors.gray400 }}>
                    {it.subtitle}
                  </Typography>
                )}
              </Box>
              {showMetrics && (
                <Box sx={{ textAlign: "right", flexShrink: 0 }}>
                  <Typography noWrap sx={{ fontSize: "0.82rem", fontWeight: 700, color: colors.gray900 }}>
                    {fmt(it.value, it.valueCurrency)}
                  </Typography>
                  <Typography noWrap sx={{ fontSize: "0.66rem", fontWeight: 600, color: dayColor }}>
                    {it.dayChange >= 0 ? "+" : ""}{it.dayChangePct.toFixed(1)}%
                  </Typography>
                </Box>
              )}
              <CheckIcon sx={{ fontSize: 16, color: colors.brand, visibility: isCurrent ? "visible" : "hidden" }} />
            </Box>
          );
        })}
      </Box>
    </Box>
  );

  if (isMobile) {
    return (
      <Drawer anchor="bottom" open={open} onClose={onClose}
        PaperProps={{ sx: { borderTopLeftRadius: 16, borderTopRightRadius: 16, pb: "env(safe-area-inset-bottom, 0px)" } }}>
        <Box sx={{ width: 36, height: 4, borderRadius: 2, bgcolor: colors.gray300, mx: "auto", mt: 1, mb: 0.5 }} />
        <Typography sx={{ px: 2, pt: 0.5, pb: 0.5, fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: colors.gray400 }}>
          {title}
        </Typography>
        {list}
      </Drawer>
    );
  }
  return (
    <Popover
      open={open} anchorEl={anchorEl} onClose={onClose}
      anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
      transformOrigin={{ vertical: "top", horizontal: "left" }}
      slotProps={{ paper: { sx: { borderRadius: 2, mt: 0.5, overflow: "hidden", boxShadow: "0 8px 30px rgba(0,0,0,0.16)" } } }}
    >
      {list}
    </Popover>
  );
}
