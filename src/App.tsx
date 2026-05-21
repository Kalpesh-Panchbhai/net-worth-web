import { Routes, Route, Navigate } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Accounts from "./pages/Accounts";
import Holdings from "./pages/Holdings";
import Transactions from "./pages/Transactions";
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
          <Route path="/holdings" element={<Holdings />} />
          <Route path="/transactions" element={<Transactions />} />
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
