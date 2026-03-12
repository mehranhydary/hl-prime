import { useEffect, useRef, type ReactElement } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useQueryClient } from "@tanstack/react-query";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Toaster } from "react-hot-toast";
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
import { useAuthSession } from "./hooks/use-auth-session";
import { setAuthNetwork, syncPrivyAuth } from "./lib/auth";

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
  const auth = useAuthSession();

  useEffect(() => {
    setAuthNetwork(network);
  }, [network]);

  useRealtimeUpdates(address, network, auth.isAuthenticated);
  return null;
}

function AuthSync() {
  const { ready, authenticated, login, logout, getAccessToken } = usePrivy();

  useEffect(() => {
    syncPrivyAuth({
      ready,
      authenticated,
      login,
      logout,
      getAccessToken,
    });
  }, [authenticated, getAccessToken, login, logout, ready]);

  return null;
}

const AUTHENTICATED_QUERY_KEYS = new Set([
  "agent-status",
  "bootstrap",
  "portfolio",
  "referral",
  "trade-history",
  "candles",
]);

function AuthCacheSync() {
  const auth = useAuthSession();
  const queryClient = useQueryClient();
  const previousAuthenticated = useRef(auth.isAuthenticated);

  useEffect(() => {
    if (previousAuthenticated.current && !auth.isAuthenticated) {
      queryClient.removeQueries({
        predicate: (query) => {
          const rootKey = query.queryKey[0];
          return typeof rootKey === "string" && AUTHENTICATED_QUERY_KEYS.has(rootKey);
        },
      });
    }

    previousAuthenticated.current = auth.isAuthenticated;
  }, [auth.isAuthenticated, queryClient]);

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
        <AuthSync />
        <AuthCacheSync />
        <NetworkProvider>
          <AppRoutes />
          <Toaster
            position="bottom-center"
            containerStyle={{ bottom: 72 }}
            toastOptions={{
              duration: 4000,
              style: {
                background: "var(--color-surface-2)",
                color: "var(--color-text-primary)",
                border: "1px solid var(--color-border)",
                borderRadius: "2px",
                fontSize: "13px",
                maxWidth: "400px",
              },
              success: {
                iconTheme: { primary: "var(--color-long)", secondary: "var(--color-surface-0)" },
              },
              error: {
                iconTheme: { primary: "var(--color-short)", secondary: "var(--color-surface-0)" },
              },
            }}
          />
        </NetworkProvider>
      </WalletProvider>
    </ThemeProvider>
  );
}
