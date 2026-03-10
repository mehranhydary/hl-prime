import type { ReactElement } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { LandingPage } from "./pages/LandingPage";
import { LandingPage2 } from "./pages/LandingPage2";
import { PasswordGatePage } from "./pages/PasswordGatePage";
import { Dashboard } from "./pages/Dashboard";
import { TradePage } from "./pages/TradePage";
import { SetupPage } from "./pages/SetupPage";
import { PortfolioPage } from "./pages/PortfolioPage";
import { ReferralsPage } from "./pages/ReferralsPage";
import { useAccessGate } from "./hooks/use-access-gate";
import { useRealtimeUpdates } from "./hooks/use-realtime";
import { Header } from "./components/Header";
import { BottomNav } from "./components/BottomNav";
import { NetworkProvider, useNetwork } from "./lib/network-context";
import { WalletProvider, useWallet } from "./hooks/use-wallet";
import { ThemeProvider } from "./lib/theme-context";

function RequireAccess({ children }: { children: ReactElement }) {
  const access = useAccessGate();
  const location = useLocation();
  if (access.isUnlocked) return children;

  const from = `${location.pathname}${location.search}${location.hash}`;
  return <Navigate to="/unlock" replace state={{ from }} />;
}

function RealtimeUpdates() {
  const { address } = useWallet();
  const { network } = useNetwork();
  useRealtimeUpdates(address, network);
  return null;
}

function AppShell() {
  return (
    <>
      <RealtimeUpdates />
      <Header />
      <main
        className="max-w-lg mx-auto min-h-screen bg-surface-0 text-text-primary"
        style={{ paddingTop: 76 }}
      >
        <Routes>
          <Route path="/markets" element={<Dashboard />} />
          <Route path="/portfolio" element={<PortfolioPage />} />
          <Route path="/referrals" element={<ReferralsPage />} />
          <Route path="/setup" element={<SetupPage />} />
          <Route path="/trade/:asset" element={<TradePage />} />
          <Route path="*" element={<Navigate to="/markets" replace />} />
        </Routes>
      </main>
      <BottomNav />
    </>
  );
}

function AppRoutes() {
  return (
    <Routes>
      {/* Landing page — no app chrome */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/v2" element={<LandingPage2 />} />
      <Route path="/unlock" element={<PasswordGatePage />} />

      {/* App routes — mobile shell */}
      <Route
        path="*"
        element={
          <RequireAccess>
            <AppShell />
          </RequireAccess>
        }
      />
    </Routes>
  );
}

export function App() {
  return (
    <ThemeProvider>
      <WalletProvider>
        <NetworkProvider>
          <AppRoutes />
        </NetworkProvider>
      </WalletProvider>
    </ThemeProvider>
  );
}
