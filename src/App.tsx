import { Routes, Route, Navigate } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Accounts from "./pages/Accounts";
import AccountDetail from "./pages/AccountDetail";
import HoldingDetail from "./pages/HoldingDetail";
import Watchlists from "./pages/Watchlists";
import Incomes from "./pages/Incomes";
import IncomeSources from "./pages/IncomeSources";
import IncomeTags from "./pages/IncomeTags";
import Layout from "./components/Layout";
import { UserProvider } from "./context/UserContext";

function App() {
  return (
    <UserProvider>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/accounts" element={<Accounts />} />
          <Route path="/accounts/:accountId" element={<AccountDetail />} />
          <Route path="/accounts/:accountId/holdings/:holdingId" element={<HoldingDetail />} />
          <Route path="/watchlists" element={<Watchlists />} />
          <Route path="/incomes" element={<Incomes />} />
          <Route path="/income-sources" element={<IncomeSources />} />
          <Route path="/income-tags" element={<IncomeTags />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </UserProvider>
  );
}

export default App;
