import { type ReactNode } from "react";
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
  useMediaQuery,
  useTheme,
} from "@mui/material";
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import AccountBalanceOutlinedIcon from "@mui/icons-material/AccountBalanceOutlined";
import LocalOfferOutlinedIcon from "@mui/icons-material/LocalOfferOutlined";

interface LayoutProps {
  children: ReactNode;
}

const NAV_ITEMS = [
  { label: "Dashboard", path: "/", icon: <DashboardOutlinedIcon /> },
  { label: "Incomes", path: "/incomes", icon: <ReceiptLongOutlinedIcon /> },
  { label: "Sources", path: "/income-sources", icon: <AccountBalanceOutlinedIcon /> },
  { label: "Tags", path: "/income-tags", icon: <LocalOfferOutlinedIcon /> },
];

function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const currentTab = NAV_ITEMS.findIndex((item) => item.path === location.pathname);
  const activeIdx = currentTab === -1 ? 0 : currentTab;

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default", pb: isMobile ? "80px" : 0 }}>
      {/* Top bar */}
      <AppBar position="sticky">
        <Toolbar sx={{ minHeight: { xs: 56, sm: 64 }, px: { xs: 2, sm: 3 } }}>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            Net Worth
          </Typography>
        </Toolbar>

        {/* Desktop tabs — hidden on mobile */}
        {!isMobile && (
          <Tabs
            value={activeIdx}
            onChange={(_e, idx) => navigate(NAV_ITEMS[idx].path)}
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

      {/* Main content */}
      <Container
        maxWidth="lg"
        component="main"
        sx={{ py: { xs: 2, sm: 3 }, px: { xs: 2, sm: 3 } }}
      >
        {children}
      </Container>

      {/* Mobile bottom navigation */}
      {isMobile && (
        <BottomNavigation
          value={activeIdx}
          onChange={(_e, idx) => navigate(NAV_ITEMS[idx].path)}
          showLabels
          sx={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 1200 }}
        >
          {NAV_ITEMS.map((item) => (
            <BottomNavigationAction key={item.path} label={item.label} icon={item.icon} />
          ))}
        </BottomNavigation>
      )}
    </Box>
  );
}

export default Layout;
