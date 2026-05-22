import { type ReactNode, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Box, Typography, Avatar, ToggleButtonGroup, ToggleButton,
  Drawer, List, ListItem, ListItemButton, ListItemIcon, ListItemText,
  IconButton, Divider, Dialog, DialogTitle, DialogContent, DialogActions, Button,
  useMediaQuery, useTheme,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import MenuIcon from "@mui/icons-material/Menu";
import DashboardRoundedIcon from "@mui/icons-material/DashboardRounded";
import AccountBalanceWalletRoundedIcon from "@mui/icons-material/AccountBalanceWalletRounded";
import VisibilityRoundedIcon from "@mui/icons-material/VisibilityRounded";
import ReceiptLongRoundedIcon from "@mui/icons-material/ReceiptLongRounded";
import AccountBalanceRoundedIcon from "@mui/icons-material/AccountBalanceRounded";
import LocalOfferRoundedIcon from "@mui/icons-material/LocalOfferRounded";
import LogoutRoundedIcon from "@mui/icons-material/LogoutRounded";
import PersonRemoveRoundedIcon from "@mui/icons-material/PersonRemoveRounded";
import DarkModeRoundedIcon from "@mui/icons-material/DarkModeRounded";
import LightModeRoundedIcon from "@mui/icons-material/LightModeRounded";
import SettingsBrightnessRoundedIcon from "@mui/icons-material/SettingsBrightnessRounded";
import { useUser } from "../context/UserContext";
import { deleteUser, invalidateCache } from "../api/client";
import { useToast } from "../context/ToastContext";
import { useColorMode, useTokens } from "../context/ColorModeContext";
import type { ColorModePref } from "../context/ColorModeContext";

const SIDEBAR_W = 252;

const PRIMARY_NAV = [
  { label: "Dashboard", path: "/", icon: <DashboardRoundedIcon /> },
  { label: "Accounts", path: "/accounts", icon: <AccountBalanceWalletRoundedIcon /> },
  { label: "Watchlists", path: "/watchlists", icon: <VisibilityRoundedIcon /> },
  { label: "Incomes", path: "/incomes", icon: <ReceiptLongRoundedIcon /> },
];

const SECONDARY_NAV = [
  { label: "Sources", path: "/income-sources", icon: <AccountBalanceRoundedIcon /> },
  { label: "Tags", path: "/income-tags", icon: <LocalOfferRoundedIcon /> },
];

function Layout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up("md"));
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { firebaseUser, userId, logout } = useUser();
  const { showToast } = useToast();
  const { preference, setPreference } = useColorMode();
  const { colors, gradients } = useTokens();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

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

  const navItemSx = (path: string) => ({
    borderRadius: 2.5, py: 1, px: 1.5, mb: 0.25,
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

  const sidebarContent = (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%", py: 2.5, px: 2 }}>
      {/* Logo */}
      <Box
        sx={{ px: 1, mb: 3, display: "flex", alignItems: "center", gap: 1.5, cursor: "pointer" }}
        onClick={() => { navigate("/"); setDrawerOpen(false); }}
      >
        <Avatar sx={{
          width: 34, height: 34, background: gradients.hero,
          fontSize: "0.75rem", fontWeight: 800, letterSpacing: "-0.02em",
        }}>
          NW
        </Avatar>
        <Typography sx={{ fontWeight: 800, fontSize: "1.05rem", letterSpacing: "-0.03em", color: colors.gray900 }}>
          Net Worth
        </Typography>
      </Box>

      {/* Primary nav */}
      <Typography variant="overline" sx={{ px: 1.5, mb: 0.5, fontSize: "0.625rem", color: colors.gray400 }}>
        Main
      </Typography>
      <List disablePadding>
        {PRIMARY_NAV.map(item => (
          <ListItem key={item.path} disablePadding>
            <ListItemButton
              onClick={() => { navigate(item.path); setDrawerOpen(false); }}
              sx={navItemSx(item.path)}
            >
              <ListItemIcon sx={{ minWidth: 34, color: "inherit" }}>{item.icon}</ListItemIcon>
              <ListItemText
                primary={item.label}
                primaryTypographyProps={{ fontSize: "0.85rem", fontWeight: isActive(item.path) ? 650 : 500 }}
              />
            </ListItemButton>
          </ListItem>
        ))}
      </List>

      <Divider sx={{ my: 2, mx: 1 }} />

      <Typography variant="overline" sx={{ px: 1.5, mb: 0.5, fontSize: "0.625rem", color: colors.gray400 }}>
        Settings
      </Typography>
      <List disablePadding>
        {SECONDARY_NAV.map(item => (
          <ListItem key={item.path} disablePadding>
            <ListItemButton
              onClick={() => { navigate(item.path); setDrawerOpen(false); }}
              sx={navItemSx(item.path)}
            >
              <ListItemIcon sx={{ minWidth: 34, color: "inherit" }}>{item.icon}</ListItemIcon>
              <ListItemText
                primary={item.label}
                primaryTypographyProps={{ fontSize: "0.85rem", fontWeight: isActive(item.path) ? 650 : 500 }}
              />
            </ListItemButton>
          </ListItem>
        ))}
      </List>

      {/* Spacer */}
      <Box sx={{ flex: 1 }} />

      {/* Appearance */}
      <Box sx={{ px: 1, mb: 1.5 }}>
        <Typography variant="overline" sx={{ px: 1, mb: 0.75, display: "block", fontSize: "0.6rem", color: colors.gray400 }}>
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
            { value: "light" as const, label: "Light", icon: <LightModeRoundedIcon sx={{ fontSize: 13 }} /> },
            { value: "system" as const, label: "Auto", icon: <SettingsBrightnessRoundedIcon sx={{ fontSize: 13 }} /> },
            { value: "dark" as const, label: "Dark", icon: <DarkModeRoundedIcon sx={{ fontSize: 13 }} /> },
          ]).map(opt => (
            <ToggleButton key={opt.value} value={opt.value} sx={{
              borderRadius: "10px !important", py: 0.5, px: 1, minWidth: 0, textTransform: "none",
              fontSize: "0.7rem", fontWeight: 500, gap: 0.4, lineHeight: 1,
              "&.Mui-selected": { bgcolor: `${colors.brand} !important`, color: "#fff !important", fontWeight: 600, boxShadow: `0 1px 4px ${alpha(colors.brand, 0.3)}` },
            }}>
              {opt.icon} {opt.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Box>

      {/* User + Sign out */}
      {firebaseUser && (
        <Box sx={{ px: 1, pb: 1 }}>
          <Divider sx={{ mb: 2, mx: 0.5 }} />
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, px: 0.5, mb: 1 }}>
            <Avatar
              src={firebaseUser.photoURL || undefined}
              sx={{ width: 32, height: 32, fontSize: "0.7rem", fontWeight: 700 }}
            >
              {firebaseUser.displayName?.charAt(0) || "U"}
            </Avatar>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontSize: "0.8rem", fontWeight: 600, color: colors.gray800, lineHeight: 1.2 }} noWrap>
                {firebaseUser.displayName || "User"}
              </Typography>
              <Typography sx={{ fontSize: "0.68rem", color: colors.gray400, lineHeight: 1.2 }} noWrap>
                {firebaseUser.email}
              </Typography>
            </Box>
          </Box>
          <ListItemButton
            onClick={async () => { setDrawerOpen(false); showToast("Signed out successfully", "info"); await logout(); }}
            sx={{ borderRadius: 2.5, py: 0.75, px: 1.5, color: colors.gray500, "&:hover": { bgcolor: colors.errorBg, color: colors.error } }}
          >
            <ListItemIcon sx={{ minWidth: 34, color: "inherit" }}><LogoutRoundedIcon sx={{ fontSize: 20 }} /></ListItemIcon>
            <ListItemText primary="Sign out" primaryTypographyProps={{ fontSize: "0.85rem", fontWeight: 500 }} />
          </ListItemButton>
          <ListItemButton
            onClick={() => setDeleteDialogOpen(true)}
            sx={{ borderRadius: 2.5, py: 0.75, px: 1.5, mt: 0.25, color: colors.gray400, "&:hover": { bgcolor: colors.errorBg, color: colors.error } }}
          >
            <ListItemIcon sx={{ minWidth: 34, color: "inherit" }}><PersonRemoveRoundedIcon sx={{ fontSize: 20 }} /></ListItemIcon>
            <ListItemText primary="Delete account" primaryTypographyProps={{ fontSize: "0.8rem", fontWeight: 500 }} />
          </ListItemButton>
        </Box>
      )}
    </Box>
  );

  return (
    <Box sx={{ display: "flex", minHeight: "100vh", bgcolor: "background.default", overflowX: "hidden", maxWidth: "100vw" }}>
      {/* Desktop sidebar */}
      {isDesktop && (
        <Box sx={{
          width: SIDEBAR_W, flexShrink: 0,
          borderRight: `1px solid ${colors.gray200}`,
          bgcolor: colors.white,
          position: "fixed", top: 0, left: 0, bottom: 0,
          overflowY: "auto", zIndex: 1200,
        }}>
          {sidebarContent}
        </Box>
      )}

      {/* Mobile drawer */}
      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        <Box sx={{ width: SIDEBAR_W }}>{sidebarContent}</Box>
      </Drawer>

      {/* Main content */}
      <Box component="main" sx={{
        flex: 1,
        ml: isDesktop ? `${SIDEBAR_W}px` : 0,
        pb: 0,
        minHeight: "100vh",
        overflowX: "hidden",
        maxWidth: isDesktop ? `calc(100vw - ${SIDEBAR_W}px)` : "100vw",
      }}>
        {/* Mobile top bar */}
        {!isDesktop && (
          <Box sx={{
            display: "flex", alignItems: "center",
            px: 2, py: 1.5,
            borderBottom: `1px solid ${colors.gray200}`,
            bgcolor: colors.white,
            position: "sticky", top: 0, zIndex: 1100,
            backdropFilter: "blur(12px)",
          }}>
            <IconButton onClick={() => setDrawerOpen(true)} sx={{ mr: 1 }}>
              <MenuIcon />
            </IconButton>
            <Avatar sx={{
              width: 28, height: 28, background: gradients.hero,
              fontSize: "0.6rem", fontWeight: 800, mr: 1,
            }}>NW</Avatar>
            <Typography sx={{ fontWeight: 700, fontSize: "1rem", letterSpacing: "-0.02em" }}>
              Net Worth
            </Typography>
          </Box>
        )}

        <Box sx={{ p: { xs: 2, sm: 3 }, maxWidth: 960, mx: "auto" }}>
          {children}
        </Box>
      </Box>

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
