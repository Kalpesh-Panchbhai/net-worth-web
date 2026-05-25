import { useEffect } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Box, Button, CircularProgress, Typography } from "@mui/material";
import Dashboard from "./pages/Dashboard";
import Accounts from "./pages/Accounts";
import AccountDetail from "./pages/AccountDetail";
import HoldingDetail from "./pages/HoldingDetail";
import Watchlists from "./pages/Watchlists";
import WatchlistDetail from "./pages/WatchlistDetail";
import Incomes from "./pages/Incomes";
import IncomeSources from "./pages/IncomeSources";
import IncomeTags from "./pages/IncomeTags";
import Login from "./pages/Login";
import Layout from "./components/Layout";
import { UserProvider, useUser } from "./context/UserContext";

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

function AuthGate() {
  const { firebaseUser, loading, error, userId } = useUser();

  if (loading) {
    return (
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!firebaseUser) return <Login />;

  if (error || !userId) {
    return (
      <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", gap: 2, px: 3, textAlign: "center" }}>
        <Typography variant="h6" color="error" fontWeight={700}>Unable to reach the server</Typography>
        <Typography color="text.secondary" sx={{ maxWidth: 400 }}>
          {error || "Please check your connection or try again later."}
        </Typography>
        <Button variant="contained" onClick={() => window.location.reload()} sx={{ mt: 1 }}>
          Retry
        </Button>
      </Box>
    );
  }

  return (
    <Layout>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/accounts" element={<Accounts />} />
        <Route path="/accounts/:accountId" element={<AccountDetail />} />
        <Route path="/accounts/:accountId/holdings/:holdingId" element={<HoldingDetail />} />
        <Route path="/watchlists" element={<Watchlists />} />
        <Route path="/watchlists/:watchlistId" element={<WatchlistDetail />} />
        <Route path="/incomes" element={<Incomes />} />
        <Route path="/income-sources" element={<IncomeSources />} />
        <Route path="/income-tags" element={<IncomeTags />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}

function App() {
  return (
    <UserProvider>
      <AuthGate />
    </UserProvider>
  );
}

export default App;
