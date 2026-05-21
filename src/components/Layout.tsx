import { type ReactNode, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  AppBar,
  Toolbar,
  Typography,
  Box,
  Container,
  Tab,
  Tabs,
  BottomNavigation,
  BottomNavigationAction,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  IconButton,
  Divider,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import AccountBalanceWalletOutlinedIcon from "@mui/icons-material/AccountBalanceWalletOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import AccountBalanceOutlinedIcon from "@mui/icons-material/AccountBalanceOutlined";
import LocalOfferOutlinedIcon from "@mui/icons-material/LocalOfferOutlined";

interface LayoutProps {
  children: ReactNode;
}

const NAV_ITEMS = [
  { label: "Dashboard", path: "/", icon: <DashboardOutlinedIcon /> },
  { label: "Accounts", path: "/accounts", icon: <AccountBalanceWalletOutlinedIcon /> },
  { label: "Watchlists", path: "/watchlists", icon: <VisibilityOutlinedIcon /> },
  { label: "Incomes", path: "/incomes", icon: <ReceiptLongOutlinedIcon /> },
  { label: "Sources", path: "/income-sources", icon: <AccountBalanceOutlinedIcon /> },
  { label: "Tags", path: "/income-tags", icon: <LocalOfferOutlinedIcon /> },
];

const MOBILE_NAV = [
  NAV_ITEMS[0],
  NAV_ITEMS[1],
  NAV_ITEMS[2],
  NAV_ITEMS[3],
];

function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const [drawerOpen, setDrawerOpen] = useState(false);
  const currentTab = NAV_ITEMS.findIndex((item) =>
    item.path === "/" ? location.pathname === "/" : location.pathname.startsWith(item.path)
  );
  const activeIdx = currentTab === -1 ? false : currentTab;
  const mobileIdx = MOBILE_NAV.findIndex((item) =>
    item.path === "/" ? location.pathname === "/" : location.pathname.startsWith(item.path)
  );
  const activeMobileIdx = mobileIdx === -1 ? false : mobileIdx;

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default", pb: isMobile ? "80px" : 0 }}>
      {/* Top bar */}
      <AppBar position="sticky">
        <Toolbar sx={{ minHeight: { xs: 56, sm: 64 }, px: { xs: 2, sm: 3 } }}>
          {isMobile && (
            <IconButton edge="start" color="inherit" onClick={() => setDrawerOpen(true)} sx={{ mr: 1 }}>
              <MenuIcon />
            </IconButton>
          )}
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            Net Worth
          </Typography>
        </Toolbar>

        {/* Desktop tabs — hidden on mobile */}
        {!isMobile && (
          <Tabs
            value={activeIdx}
            onChange={(_e, idx) => navigate(NAV_ITEMS[idx].path)}
            variant="scrollable"
            scrollButtons="auto"
            indicatorColor="primary"
            textColor="primary"
            sx={{ minHeight: 44, px: 2, "& .MuiTab-root": { minHeight: 44 } }}
          >
            {NAV_ITEMS.map((item) => (
              <Tab key={item.path} label={item.label} icon={item.icon} iconPosition="start"
                sx={{ "& .MuiSvgIcon-root": { fontSize: 18, mr: 0.5 } }} />
            ))}
          </Tabs>
        )}
      </AppBar>

      {/* Mobile drawer for all nav items */}
      <Drawer anchor="left" open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        <Box sx={{ width: 260, pt: 2 }}>
          <Typography variant="h6" sx={{ px: 2, pb: 1 }}>Net Worth</Typography>
          <Divider />
          <List>
            {NAV_ITEMS.map((item) => (
              <ListItem key={item.path} disablePadding>
                <ListItemButton
                  selected={item.path === location.pathname}
                  onClick={() => { navigate(item.path); setDrawerOpen(false); }}
                >
                  <ListItemIcon sx={{ minWidth: 40 }}>{item.icon}</ListItemIcon>
                  <ListItemText primary={item.label} />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        </Box>
      </Drawer>

      {/* Main content */}
      <Container
        maxWidth="lg"
        component="main"
        sx={{ py: { xs: 2, sm: 3 }, px: { xs: 2, sm: 3 } }}
      >
        {children}
      </Container>

      {/* Mobile bottom navigation — shows 4 key items */}
      {isMobile && (
        <BottomNavigation
          value={activeMobileIdx}
          onChange={(_e, idx) => navigate(MOBILE_NAV[idx].path)}
          showLabels
          sx={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 1200 }}
        >
          {MOBILE_NAV.map((item) => (
            <BottomNavigationAction key={item.path} label={item.label} icon={item.icon} />
          ))}
        </BottomNavigation>
      )}
    </Box>
  );
}

export default Layout;
