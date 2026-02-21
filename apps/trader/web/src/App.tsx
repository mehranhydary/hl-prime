import { Routes, Route } from "react-router-dom";
import { LandingPage } from "./pages/LandingPage";
import { LandingPage2 } from "./pages/LandingPage2";
import { Dashboard } from "./pages/Dashboard";
import { TradePage } from "./pages/TradePage";
import { SetupPage } from "./pages/SetupPage";
import { PortfolioPage } from "./pages/PortfolioPage";
import { ReferralsPage } from "./pages/ReferralsPage";
import { Header } from "./components/Header";
import { NetworkProvider } from "./lib/network-context";
import { WalletProvider } from "./hooks/use-wallet";
import { ThemeProvider } from "./lib/theme-context";

function AppRoutes() {
  return (
    <Routes>
      {/* Landing page — no app header */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/v2" element={<LandingPage2 />} />

      {/* App routes — with header */}
      <Route
        path="*"
        element={
          <>
            <Header />
            <main className="min-h-screen bg-surface-0 text-text-primary" style={{ paddingTop: 84 }}>
              <Routes>
                <Route path="/markets" element={<Dashboard />} />
                <Route path="/portfolio" element={<PortfolioPage />} />
                <Route path="/referrals" element={<ReferralsPage />} />
                <Route path="/setup" element={<SetupPage />} />
                <Route path="/trade/:asset" element={<TradePage />} />
              </Routes>
            </main>
          </>
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
