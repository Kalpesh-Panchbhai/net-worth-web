import { type ReactNode, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Box, Typography, Avatar, ToggleButtonGroup, ToggleButton, Stack,
  Drawer, List, ListItem, ListItemButton, ListItemIcon, ListItemText,
  IconButton, Divider, Dialog, DialogTitle, DialogContent, DialogActions, Button,
  TextField, Menu, MenuItem, Tooltip, CircularProgress, Switch, FormControlLabel,
  useMediaQuery, useTheme,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import MenuIcon from "@mui/icons-material/Menu";
import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import DashboardRoundedIcon from "@mui/icons-material/DashboardRounded";
import AccountBalanceWalletRoundedIcon from "@mui/icons-material/AccountBalanceWalletRounded";
import VisibilityRoundedIcon from "@mui/icons-material/VisibilityRounded";
import VisibilityOffRoundedIcon from "@mui/icons-material/VisibilityOffRounded";
import ReceiptLongRoundedIcon from "@mui/icons-material/ReceiptLongRounded";
import AccountBalanceRoundedIcon from "@mui/icons-material/AccountBalanceRounded";
import LocalOfferRoundedIcon from "@mui/icons-material/LocalOfferRounded";
import LogoutRoundedIcon from "@mui/icons-material/LogoutRounded";
import PersonRemoveRoundedIcon from "@mui/icons-material/PersonRemoveRounded";
import DarkModeRoundedIcon from "@mui/icons-material/DarkModeRounded";
import LightModeRoundedIcon from "@mui/icons-material/LightModeRounded";
import SettingsBrightnessRoundedIcon from "@mui/icons-material/SettingsBrightnessRounded";
import SyncRoundedIcon from "@mui/icons-material/SyncRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import QueryStatsRoundedIcon from "@mui/icons-material/QueryStatsRounded";
import ShowChartRoundedIcon from "@mui/icons-material/ShowChartRounded";
import CandlestickChartRoundedIcon from "@mui/icons-material/CandlestickChartRounded";
import FlagRoundedIcon from "@mui/icons-material/FlagRounded";
import FileDownloadRoundedIcon from "@mui/icons-material/FileDownloadRounded";
import FileUploadRoundedIcon from "@mui/icons-material/FileUploadRounded";
import SettingsRoundedIcon from "@mui/icons-material/SettingsRounded";
import UnfoldMoreRoundedIcon from "@mui/icons-material/UnfoldMoreRounded";
import ScheduleRoundedIcon from "@mui/icons-material/ScheduleRounded";
import { useUser } from "../context/UserContext";
import { deleteUser, invalidateCache, refreshData, getLastRefreshed, getRefreshSchedule, updateRefreshSchedule } from "../api/client";
import type { RefreshScheduleConfig } from "../api/types";
import { useToast } from "../context/ToastContext";
import { useColorMode, useTokens } from "../context/ColorModeContext";
import type { ColorModePref } from "../context/ColorModeContext";
import GlobalSearch from "./GlobalSearch";
import { exportData, downloadBackup, parseBackup, importData, type BackupFile } from "../utils/backup";
import { CURRENCIES } from "../constants";

const SIDEBAR_W = 252;
const SIDEBAR_W_COLLAPSED = 76;
const SIDEBAR_COLLAPSED_KEY = "nw_sidebar_collapsed";

/** Last-refresh epoch millis → "21 Sep, 4:30 PM IST", always in India time regardless of device tz. */
function formatIST(ms: number): string {
  return new Date(ms).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata", day: "numeric", month: "short",
    hour: "numeric", minute: "2-digit", hour12: true,
  }) + " IST";
}

/** Self-contained "Data refresh" schedule control for the Settings dialog. */
function RefreshScheduleSection() {
  const { colors } = useTokens();
  const { showToast } = useToast();
  const [cfg, setCfg] = useState<RefreshScheduleConfig | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { getRefreshSchedule().then(setCfg).catch(() => {}); }, []);

  const save = async (next: { intervalHours: number; weekdaysOnly: boolean; enabled: boolean }) => {
    setSaving(true);
    try {
      setCfg(await updateRefreshSchedule(next));
      showToast("Refresh schedule updated", "success");
    } catch {
      showToast("Couldn't update schedule. Try again.", "error");
    } finally { setSaving(false); }
  };

  const intervalLabel = (h: number) => h === 24 ? "Once a day" : h === 1 ? "Every hour" : `Every ${h} hours`;

  return (
    <Box>
      <Typography variant="overline" sx={{ mb: 1, display: "block", fontSize: "0.65rem", color: colors.gray400 }}>
        Data refresh
      </Typography>
      {!cfg ? <CircularProgress size={18} /> : (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <FormControlLabel
            control={<Switch checked={cfg.enabled} onChange={e => save({ intervalHours: cfg.intervalHours, weekdaysOnly: cfg.weekdaysOnly, enabled: e.target.checked })} />}
            label={<Typography sx={{ fontSize: "0.85rem" }}>{cfg.enabled ? "Auto-refresh on" : "Auto-refresh off"}</Typography>}
          />
          <TextField
            select size="small" fullWidth label="Frequency"
            value={cfg.intervalHours} disabled={!cfg.enabled || saving}
            onChange={e => save({ intervalHours: Number(e.target.value), weekdaysOnly: cfg.weekdaysOnly, enabled: cfg.enabled })}
            sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2.5 } }}
          >
            {cfg.allowedIntervals.map(h => <MenuItem key={h} value={h}>{intervalLabel(h)}</MenuItem>)}
          </TextField>
          <FormControlLabel
            control={<Switch checked={!cfg.weekdaysOnly} disabled={!cfg.enabled || saving}
              onChange={e => save({ intervalHours: cfg.intervalHours, weekdaysOnly: !e.target.checked, enabled: cfg.enabled })} />}
            label={<Typography sx={{ fontSize: "0.85rem" }}>Run on weekends</Typography>}
          />
          {cfg.enabled && cfg.nextRefreshAt && (
            <Typography sx={{ fontSize: "0.68rem", color: colors.gray400 }}>Next refresh {formatIST(cfg.nextRefreshAt)}</Typography>
          )}
        </Box>
      )}
    </Box>
  );
}

// Navigation grouped by intent so the sidebar reads as a short list of sections rather than one
// long flat menu: everyday views up top, planning tools next, income taxonomy setup last.
const NAV_GROUPS: { label?: string; items: { label: string; path: string; icon: ReactNode }[] }[] = [
  {
    items: [
      { label: "Insights", path: "/", icon: <DashboardRoundedIcon /> },
      { label: "Accounts", path: "/accounts", icon: <AccountBalanceWalletRoundedIcon /> },
      { label: "Watchlists", path: "/watchlists", icon: <VisibilityRoundedIcon /> },
      { label: "Incomes", path: "/incomes", icon: <ReceiptLongRoundedIcon /> },
    ],
  },
  {
    label: "Research",
    items: [
      { label: "MF Analyzer", path: "/mutual-funds", icon: <ShowChartRoundedIcon /> },
      { label: "Stock Analyzer", path: "/stocks", icon: <CandlestickChartRoundedIcon /> },
    ],
  },
  {
    label: "Planning",
    items: [
      { label: "Goals & FIRE", path: "/goals", icon: <FlagRoundedIcon /> },
      { label: "Simulator", path: "/simulator", icon: <QueryStatsRoundedIcon /> },
    ],
  },
  {
    label: "Income setup",
    items: [
      { label: "Sources", path: "/income-sources", icon: <AccountBalanceRoundedIcon /> },
      { label: "Tags", path: "/income-tags", icon: <LocalOfferRoundedIcon /> },
    ],
  },
];

function Layout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up("md"));
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Desktop-only rail collapse, remembered across sessions.
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1");
  useEffect(() => { localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? "1" : "0"); }, [collapsed]);
  // Hovering a collapsed rail expands it temporarily (overlaying content) without changing the
  // saved preference; the rail is the icon-only mode only while collapsed AND not hovered.
  const [hovering, setHovering] = useState(false);
  const sidebarW = collapsed ? SIDEBAR_W_COLLAPSED : SIDEBAR_W;
  const { firebaseUser, userId, logout, preferredCurrency, setPreferredCurrency, refreshAll } = useUser();
  const { showToast } = useToast();
  const { preference, setPreference, privacyMode, togglePrivacy } = useColorMode();
  const { colors, shadow } = useTokens();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<number | null>(null);
  const [nextRefresh, setNextRefresh] = useState<number | null>(null);
  const [savingCurrency, setSavingCurrency] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [pendingImport, setPendingImport] = useState<BackupFile | null>(null);
  const [userMenuAnchor, setUserMenuAnchor] = useState<null | HTMLElement>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const closeUserMenu = () => setUserMenuAnchor(null);

  // Icon-only rail = collapsed, and neither hovered nor showing the user menu. Keeping it expanded
  // while the menu is open stops the menu's anchor (the avatar) from unmounting mid-open, which
  // would otherwise make the popover jump to the top-left corner.
  const rail = collapsed && !hovering && !userMenuAnchor;

  // ⌘K / Ctrl+K opens the global search from anywhere.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(o => !o);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Show when the data was last refreshed (by the scheduled job or a manual refresh).
  useEffect(() => {
    let cancelled = false;
    getLastRefreshed()
      .then(r => {
        if (cancelled) return;
        if (r.lastRefreshedAt) setLastRefreshed(r.lastRefreshedAt);
        if (r.nextRefreshAt) setNextRefresh(r.nextRefreshAt);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const handleExport = async () => {
    if (!userId) return;
    try {
      setExporting(true);
      const backup = await exportData(userId, preferredCurrency);
      downloadBackup(backup);
      showToast("Backup downloaded");
    } catch {
      showToast("Failed to export data. Please try again.", "error");
    } finally {
      setExporting(false);
    }
  };

  const handleImportFile = async (file: File) => {
    try {
      const text = await file.text();
      setPendingImport(parseBackup(text));
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not read that file.", "error");
    }
  };

  const confirmImport = async () => {
    if (!userId || !pendingImport) return;
    const backup = pendingImport;
    setPendingImport(null);
    try {
      setImporting(true);
      const result = await importData(userId, backup);
      refreshAll();
      const restored = result.accounts + result.holdings + result.transactions + result.watchlists + result.incomes;
      if (result.errors.length > 0) {
        showToast(`Restored ${restored} items with ${result.errors.length} error(s).`, "warning");
      } else {
        showToast(`Restored ${restored} items successfully`);
      }
    } catch {
      showToast("Failed to import data. Please try again.", "error");
    } finally {
      setImporting(false);
    }
  };

  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      const result = await refreshData();
      showToast(`Data refreshed in ${(result.durationMs / 1000).toFixed(1)}s`, "success");
      if (result.lastRefreshedAt) setLastRefreshed(result.lastRefreshedAt);
      invalidateCache("/refresh");
      // Drops the cached money responses and makes the mounted page refetch in place.
      refreshAll();
    } catch {
      showToast("Failed to refresh data. Please try again.", "error");
    } finally {
      setRefreshing(false);
    }
  };

  const handleCurrencyChange = async (currency: string) => {
    try {
      setSavingCurrency(true);
      await setPreferredCurrency(currency);
      showToast(`Display currency set to ${currency}`, "success");
    } catch {
      showToast("Failed to update currency. Please try again.", "error");
    } finally {
      setSavingCurrency(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!userId) return;
    try {
      setDeleting(true);
      await deleteUser(userId);
      invalidateCache();
      setDeleteDialogOpen(false);
      setDrawerOpen(false);
      showToast("Account deleted. All your data has been removed.", "info");
      await logout();
    } catch {
      showToast("Failed to delete account. Please try again.", "error");
      setDeleting(false);
    }
  };

  const isActive = (path: string) =>
    path === "/" ? location.pathname === "/" : location.pathname.startsWith(path);

  const navItemSx = (path: string, rail = false) => ({
    borderRadius: 2.5, py: 1, mb: 0.25,
    px: rail ? 0 : 1.5,
    justifyContent: rail ? "center" : "flex-start",
    color: colors.gray600,
    transition: "all 0.15s ease",
    ...(isActive(path) ? {
      bgcolor: colors.brandLight,
      color: colors.brand,
      "& .MuiListItemIcon-root": { color: colors.brand },
      "&:hover": { bgcolor: colors.brandLight },
    } : {
      "&:hover": { bgcolor: colors.gray100 },
    }),
  });

  // `rail` renders the icon-only collapsed sidebar (desktop). The mobile drawer always passes false.
  const renderSidebar = (rail: boolean) => (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%", py: 2.5, px: rail ? 1 : 2 }}>
      {/* Logo + collapse toggle */}
      {rail ? (
        <Stack alignItems="center" spacing={1} sx={{ mb: 2 }}>
          <Box component="img" src="/favicon.svg" alt="Net Worth"
            onClick={() => navigate("/")}
            sx={{ width: 34, height: 34, borderRadius: 2, cursor: "pointer" }} />
          <Tooltip title="Expand sidebar" placement="right">
            <IconButton size="small" onClick={() => setCollapsed(false)} sx={{ color: colors.gray500 }}>
              <ChevronRightRoundedIcon />
            </IconButton>
          </Tooltip>
        </Stack>
      ) : (
        <Box sx={{ px: 1, mb: 2.5, display: "flex", alignItems: "center", gap: 1.5 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, cursor: "pointer", minWidth: 0 }}
            onClick={() => { navigate("/"); setDrawerOpen(false); }}>
            <Box component="img" src="/favicon.svg" alt="Net Worth" sx={{ width: 34, height: 34, borderRadius: 2 }} />
            <Typography sx={{ fontWeight: 800, fontSize: "1.05rem", letterSpacing: "-0.03em", color: colors.gray900 }} noWrap>
              Net Worth
            </Typography>
          </Box>
          {isDesktop && (
            // Pins the sidebar: while hover-expanded (saved state still collapsed) it offers to pin
            // open; when pinned open it offers to collapse.
            <Tooltip title={collapsed ? "Pin sidebar open" : "Collapse sidebar"}>
              <IconButton size="small" onClick={() => { setCollapsed(c => !c); setHovering(false); }} sx={{ ml: "auto", color: colors.gray400 }}>
                {collapsed ? <ChevronRightRoundedIcon /> : <ChevronLeftRoundedIcon />}
              </IconButton>
            </Tooltip>
          )}
        </Box>
      )}

      {/* Search + privacy */}
      {rail ? (
        <Stack alignItems="center" spacing={1} sx={{ mb: 2 }}>
          <Tooltip title="Search  (⌘K)" placement="right">
            <IconButton onClick={() => setSearchOpen(true)}
              sx={{ borderRadius: 2.5, bgcolor: colors.gray100, color: colors.gray500, "&:hover": { bgcolor: colors.gray200 } }}>
              <SearchRoundedIcon sx={{ fontSize: 20 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title={privacyMode ? "Show amounts" : "Hide amounts"} placement="right">
            <IconButton onClick={togglePrivacy}
              sx={{ borderRadius: 2.5, bgcolor: privacyMode ? colors.brandLight : colors.gray100, color: privacyMode ? colors.brand : colors.gray500, "&:hover": { bgcolor: colors.gray200 } }}>
              {privacyMode ? <VisibilityOffRoundedIcon sx={{ fontSize: 20 }} /> : <VisibilityRoundedIcon sx={{ fontSize: 20 }} />}
            </IconButton>
          </Tooltip>
        </Stack>
      ) : (
        <Box sx={{ px: 1, mb: 2, display: "flex", gap: 1 }}>
          <Button
            onClick={() => { setSearchOpen(true); setDrawerOpen(false); }}
            startIcon={<SearchRoundedIcon sx={{ fontSize: 18 }} />}
            sx={{
              flex: 1, justifyContent: "flex-start", borderRadius: 2.5, py: 0.9, px: 1.5,
              textTransform: "none", fontSize: "0.8rem", fontWeight: 500,
              color: colors.gray500, bgcolor: colors.gray100,
              "&:hover": { bgcolor: colors.gray200 },
            }}
          >
            Search
            <Box sx={{ ml: "auto", fontSize: "0.65rem", fontWeight: 600, color: colors.gray400, border: `1px solid ${colors.gray200}`, borderRadius: 1, px: 0.5, lineHeight: 1.6 }}>
              ⌘K
            </Box>
          </Button>
          <Tooltip title={privacyMode ? "Show amounts" : "Hide amounts"}>
            <IconButton
              onClick={togglePrivacy}
              sx={{ borderRadius: 2.5, bgcolor: privacyMode ? colors.brandLight : colors.gray100, color: privacyMode ? colors.brand : colors.gray500, "&:hover": { bgcolor: colors.gray200 } }}
            >
              {privacyMode ? <VisibilityOffRoundedIcon sx={{ fontSize: 20 }} /> : <VisibilityRoundedIcon sx={{ fontSize: 20 }} />}
            </IconButton>
          </Tooltip>
        </Box>
      )}

      {/* Navigation — grouped, everything else lives behind the user menu / Settings */}
      <Box sx={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
        {NAV_GROUPS.map((group, gi) => (
          <Box key={group.label ?? gi} sx={{ mb: gi < NAV_GROUPS.length - 1 ? 1.5 : 0 }}>
            {group.label && !rail && (
              <Typography variant="overline" sx={{ px: 1.5, mb: 0.25, display: "block", fontSize: "0.6rem", color: colors.gray400 }}>
                {group.label}
              </Typography>
            )}
            {group.label && rail && gi > 0 && <Divider sx={{ my: 1, mx: 0.5 }} />}
            <List disablePadding>
              {group.items.map(item => (
                <ListItem key={item.path} disablePadding>
                  <Tooltip title={rail ? item.label : ""} placement="right" disableHoverListener={!rail}>
                    <ListItemButton
                      onClick={() => { navigate(item.path); setDrawerOpen(false); }}
                      sx={navItemSx(item.path, rail)}
                    >
                      <ListItemIcon sx={{ minWidth: rail ? 0 : 34, color: "inherit", justifyContent: "center" }}>{item.icon}</ListItemIcon>
                      {!rail && (
                        <ListItemText
                          primary={item.label}
                          primaryTypographyProps={{ fontSize: "0.85rem", fontWeight: isActive(item.path) ? 650 : 500 }}
                        />
                      )}
                    </ListItemButton>
                  </Tooltip>
                </ListItem>
              ))}
            </List>
          </Box>
        ))}
      </Box>

      {/* Data freshness — last (scheduled or manual) refresh + next scheduled one, in IST */}
      {(lastRefreshed || nextRefresh) && (rail ? (
        <Tooltip placement="right" title={
          `${lastRefreshed ? "Updated " + formatIST(lastRefreshed) : ""}${lastRefreshed && nextRefresh ? " · " : ""}${nextRefresh ? "Next " + formatIST(nextRefresh) : ""}`
        }>
          <Box sx={{ display: "flex", justifyContent: "center", color: colors.gray400, pt: 1 }}>
            <ScheduleRoundedIcon sx={{ fontSize: 18 }} />
          </Box>
        </Tooltip>
      ) : (
        <Tooltip title="Auto-refreshes on a schedule; use Refresh data to update now">
          <Box sx={{ px: 1.25, pt: 1, color: colors.gray400 }}>
            {lastRefreshed && (
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                <ScheduleRoundedIcon sx={{ fontSize: 14 }} />
                <Typography sx={{ fontSize: "0.68rem" }} noWrap>Updated {formatIST(lastRefreshed)}</Typography>
              </Box>
            )}
            {nextRefresh && (
              <Typography sx={{ fontSize: "0.68rem", pl: "22px" }} noWrap>Next {formatIST(nextRefresh)}</Typography>
            )}
          </Box>
        </Tooltip>
      ))}

      {/* User — opens a menu with Refresh, Settings, and account actions */}
      {firebaseUser && (
        <Box sx={{ pt: 1 }}>
          <Divider sx={{ mb: 1, mx: 0.5 }} />
          {/* One stable element in both modes so the user-menu anchor never unmounts mid-open. */}
          <Tooltip title={rail ? (firebaseUser.displayName || "Account") : ""} placement="right" disableHoverListener={!rail}>
            <ListItemButton
              onClick={(e) => setUserMenuAnchor(e.currentTarget)}
              sx={{ borderRadius: 2.5, py: 0.75, px: rail ? 0 : 1, gap: 1, justifyContent: rail ? "center" : "flex-start", "&:hover": { bgcolor: colors.gray100 } }}
            >
              <Avatar
                src={firebaseUser.photoURL || undefined}
                sx={{ width: 32, height: 32, fontSize: "0.7rem", fontWeight: 700 }}
              >
                {firebaseUser.displayName?.charAt(0) || "U"}
              </Avatar>
              {!rail && (
                <>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontSize: "0.8rem", fontWeight: 600, color: colors.gray800, lineHeight: 1.2 }} noWrap>
                      {firebaseUser.displayName || "User"}
                    </Typography>
                    <Typography sx={{ fontSize: "0.68rem", color: colors.gray400, lineHeight: 1.2 }} noWrap>
                      {firebaseUser.email}
                    </Typography>
                  </Box>
                  <UnfoldMoreRoundedIcon sx={{ fontSize: 18, color: colors.gray400 }} />
                </>
              )}
            </ListItemButton>
          </Tooltip>
        </Box>
      )}
    </Box>
  );

  return (
    <Box sx={{ display: "flex", minHeight: "100vh", bgcolor: "background.default", overflowX: "hidden", maxWidth: "100vw" }}>
      {/* Desktop sidebar — a collapsed rail expands on hover, overlaying the content */}
      {isDesktop && (
        <Box
          onMouseEnter={() => collapsed && setHovering(true)}
          onMouseLeave={() => setHovering(false)}
          sx={{
            width: rail ? SIDEBAR_W_COLLAPSED : SIDEBAR_W, flexShrink: 0,
            borderRight: `1px solid ${colors.gray200}`,
            bgcolor: colors.white,
            position: "fixed", top: 0, left: 0, bottom: 0,
            overflowY: "auto", overflowX: "hidden", zIndex: 1200,
            transition: "width 0.18s ease",
            boxShadow: collapsed && hovering ? shadow.lg : "none",
          }}
        >
          {renderSidebar(rail)}
        </Box>
      )}

      {/* Mobile drawer */}
      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        <Box sx={{ width: SIDEBAR_W }}>{renderSidebar(false)}</Box>
      </Drawer>

      {/* Main content */}
      <Box component="main" sx={{
        flex: 1,
        ml: isDesktop ? `${sidebarW}px` : 0,
        pb: 0,
        minHeight: "100vh",
        overflowX: "hidden",
        maxWidth: isDesktop ? `calc(100vw - ${sidebarW}px)` : "100vw",
        transition: "margin-left 0.2s ease, max-width 0.2s ease",
      }}>
        {/* Mobile top bar */}
        {!isDesktop && (
          <Box sx={{
            display: "flex", alignItems: "center",
            px: 1.5, py: 1,
            pt: "calc(8px + env(safe-area-inset-top, 0px))",
            borderBottom: `1px solid ${colors.gray200}`,
            bgcolor: alpha(colors.white, 0.85),
            position: "sticky", top: 0, zIndex: 1100,
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
          }}>
            <IconButton onClick={() => setDrawerOpen(true)} size="small" sx={{ mr: 0.5, p: 1 }}>
              <MenuIcon sx={{ fontSize: 22 }} />
            </IconButton>
            <Box
              component="img"
              src="/favicon.svg"
              alt="Net Worth"
              sx={{ width: 26, height: 26, borderRadius: 1.5, mr: 0.75 }}
            />
            <Typography sx={{ fontWeight: 700, fontSize: "0.95rem", letterSpacing: "-0.02em" }}>
              Net Worth
            </Typography>
            <Box sx={{ flex: 1 }} />
            <IconButton onClick={() => setSearchOpen(true)} size="small" sx={{ p: 1 }} aria-label="Search">
              <SearchRoundedIcon sx={{ fontSize: 21 }} />
            </IconButton>
            <IconButton onClick={togglePrivacy} size="small" sx={{ p: 1, color: privacyMode ? colors.brand : undefined }} aria-label={privacyMode ? "Show amounts" : "Hide amounts"}>
              {privacyMode ? <VisibilityOffRoundedIcon sx={{ fontSize: 21 }} /> : <VisibilityRoundedIcon sx={{ fontSize: 21 }} />}
            </IconButton>
          </Box>
        )}

        <Box sx={{
          px: { xs: 1.5, sm: 3 }, py: { xs: 2, sm: 3 },
          pb: { xs: "calc(16px + env(safe-area-inset-bottom, 0px))", sm: 3 },
          // Wide canvas across the app so content fills the screen instead of leaving big side gaps.
          // Collapsing the sidebar frees ~176px; widen the cap to spend it on content, not margins.
          maxWidth: collapsed ? 1560 : 1320, mx: "auto",
          transition: "max-width 0.2s ease",
        }}>
          {children}
        </Box>
      </Box>

      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />

      {/* User menu — refresh, settings, and account actions in one place */}
      <Menu
        anchorEl={userMenuAnchor}
        open={Boolean(userMenuAnchor)}
        onClose={closeUserMenu}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
        transformOrigin={{ vertical: "bottom", horizontal: "center" }}
        slotProps={{ paper: { sx: { minWidth: 216, borderRadius: 2.5, mt: -0.5, boxShadow: shadow.lg } } }}
      >
        <MenuItem onClick={() => { closeUserMenu(); handleRefresh(); }} disabled={refreshing}>
          <ListItemIcon>
            <SyncRoundedIcon sx={{
              fontSize: 20,
              ...(refreshing ? { animation: "spin 1s linear infinite", "@keyframes spin": { from: { transform: "rotate(0deg)" }, to: { transform: "rotate(360deg)" } } } : {}),
            }} />
          </ListItemIcon>
          <ListItemText
            primary={refreshing ? "Refreshing…" : "Refresh data"}
            secondary={
              <>
                {lastRefreshed ? `Updated ${formatIST(lastRefreshed)}` : "Not refreshed yet"}
                {nextRefresh ? <><br />Next {formatIST(nextRefresh)}</> : null}
              </>
            }
            primaryTypographyProps={{ fontSize: "0.85rem" }}
            secondaryTypographyProps={{ fontSize: "0.68rem", component: "span" }}
          />
        </MenuItem>
        <MenuItem onClick={() => { closeUserMenu(); setDrawerOpen(false); setSettingsOpen(true); }}>
          <ListItemIcon><SettingsRoundedIcon sx={{ fontSize: 20 }} /></ListItemIcon>
          <ListItemText primary="Settings" primaryTypographyProps={{ fontSize: "0.85rem" }} />
        </MenuItem>
        <Divider />
        <MenuItem onClick={async () => { closeUserMenu(); setDrawerOpen(false); showToast("Signed out successfully", "info"); await logout(); }}>
          <ListItemIcon><LogoutRoundedIcon sx={{ fontSize: 20 }} /></ListItemIcon>
          <ListItemText primary="Sign out" primaryTypographyProps={{ fontSize: "0.85rem" }} />
        </MenuItem>
        <MenuItem
          onClick={() => { closeUserMenu(); setDeleteDialogOpen(true); }}
          sx={{ color: colors.error, "& .MuiListItemIcon-root": { color: colors.error } }}
        >
          <ListItemIcon><PersonRemoveRoundedIcon sx={{ fontSize: 20 }} /></ListItemIcon>
          <ListItemText primary="Delete account" primaryTypographyProps={{ fontSize: "0.85rem" }} />
        </MenuItem>
      </Menu>

      {/* Settings — appearance, display currency, and data backup, grouped in one dialog */}
      <Dialog open={settingsOpen} onClose={() => setSettingsOpen(false)} fullScreen={!isDesktop} fullWidth maxWidth="xs">
        <DialogTitle sx={{ fontWeight: 700 }}>Settings</DialogTitle>
        <DialogContent>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 3, pt: 1 }}>
            {/* Appearance */}
            <Box>
              <Typography variant="overline" sx={{ mb: 1, display: "block", fontSize: "0.65rem", color: colors.gray400 }}>
                Appearance
              </Typography>
              <ToggleButtonGroup
                value={preference}
                exclusive
                onChange={(_, val) => { if (val) setPreference(val as ColorModePref); }}
                size="small"
                fullWidth
                sx={{
                  bgcolor: colors.gray100, borderRadius: 2.5, p: "3px", gap: "2px",
                  "& .MuiToggleButtonGroup-grouped": { border: "none !important", m: 0 },
                }}
              >
                {([
                  { value: "light" as const, label: "Light", icon: <LightModeRoundedIcon sx={{ fontSize: 15 }} /> },
                  { value: "system" as const, label: "Auto", icon: <SettingsBrightnessRoundedIcon sx={{ fontSize: 15 }} /> },
                  { value: "dark" as const, label: "Dark", icon: <DarkModeRoundedIcon sx={{ fontSize: 15 }} /> },
                ]).map(opt => (
                  <ToggleButton key={opt.value} value={opt.value} sx={{
                    borderRadius: "10px !important", py: 0.6, px: 1, minWidth: 0, textTransform: "none",
                    fontSize: "0.75rem", fontWeight: 500, gap: 0.5, lineHeight: 1,
                    "&.Mui-selected": { bgcolor: `${colors.brand} !important`, color: "#fff !important", fontWeight: 600, boxShadow: `0 1px 4px ${alpha(colors.brand, 0.3)}` },
                  }}>
                    {opt.icon} {opt.label}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
            </Box>

            {/* Display currency */}
            <Box>
              <Typography variant="overline" sx={{ mb: 1, display: "block", fontSize: "0.65rem", color: colors.gray400 }}>
                Display currency
              </Typography>
              <TextField
                select
                size="small"
                fullWidth
                value={preferredCurrency}
                disabled={savingCurrency}
                onChange={(e) => handleCurrencyChange(e.target.value)}
                helperText={savingCurrency ? "Converting amounts…" : "Amounts are shown converted to this currency"}
                sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2.5 } }}
              >
                {CURRENCIES.map((c) => (
                  <MenuItem key={c} value={c}>{c}</MenuItem>
                ))}
              </TextField>
            </Box>

            {/* Data */}
            <Box>
              <Typography variant="overline" sx={{ mb: 1, display: "block", fontSize: "0.65rem", color: colors.gray400 }}>
                Data
              </Typography>
              <Box sx={{ display: "flex", gap: 1 }}>
                <Button
                  fullWidth variant="outlined" onClick={handleExport} disabled={exporting}
                  startIcon={exporting ? <CircularProgress size={14} /> : <FileDownloadRoundedIcon sx={{ fontSize: 18 }} />}
                  sx={{ borderRadius: 2.5, py: 0.7, textTransform: "none", fontSize: "0.8rem", fontWeight: 600, borderColor: colors.gray200, color: colors.gray600, "&:hover": { borderColor: colors.brand, color: colors.brand } }}
                >
                  Export
                </Button>
                <Button
                  fullWidth variant="outlined" onClick={() => fileInputRef.current?.click()} disabled={importing}
                  startIcon={importing ? <CircularProgress size={14} /> : <FileUploadRoundedIcon sx={{ fontSize: 18 }} />}
                  sx={{ borderRadius: 2.5, py: 0.7, textTransform: "none", fontSize: "0.8rem", fontWeight: 600, borderColor: colors.gray200, color: colors.gray600, "&:hover": { borderColor: colors.brand, color: colors.brand } }}
                >
                  Import
                </Button>
              </Box>
              <Typography sx={{ fontSize: "0.68rem", color: colors.gray400, mt: 0.75 }}>
                Export a JSON backup, or restore from one.
              </Typography>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                style={{ display: "none" }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImportFile(file);
                  e.target.value = "";
                }}
              />
            </Box>

            {/* Data refresh schedule */}
            {settingsOpen && <RefreshScheduleSection />}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSettingsOpen(false)}>Done</Button>
        </DialogActions>
      </Dialog>

      {/* Import confirmation */}
      <Dialog open={!!pendingImport} onClose={() => setPendingImport(null)}>
        <DialogTitle sx={{ fontWeight: 700 }}>Restore from backup?</DialogTitle>
        <DialogContent>
          <Typography sx={{ color: colors.gray600 }}>
            This adds everything from the backup file
            {pendingImport?.exportedAt ? ` (exported ${pendingImport.exportedAt.slice(0, 10)})` : ""} to your
            current account — accounts, holdings, transactions, watchlists, and incomes. It does not remove or
            overwrite anything, so importing into an account that already has data will create duplicates.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPendingImport(null)} disabled={importing}>Cancel</Button>
          <Button variant="contained" onClick={confirmImport} disabled={importing}>
            {importing ? "Restoring…" : "Restore"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Account Confirmation */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle sx={{ fontWeight: 700 }}>Delete your account?</DialogTitle>
        <DialogContent>
          <Typography sx={{ color: colors.gray600 }}>
            This will permanently delete all your data — accounts, holdings, transactions, watchlists, and incomes. This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)} disabled={deleting}>Cancel</Button>
          <Button color="error" variant="contained" onClick={handleDeleteAccount} disabled={deleting}>
            {deleting ? "Deleting…" : "Delete everything"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default Layout;
