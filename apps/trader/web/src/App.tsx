import { Component, useEffect, useRef, type ReactElement, type ReactNode } from "react";
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
import { SwapPage } from "./pages/SwapPage";
import { EarnPage } from "./pages/EarnPage";
import { useAccessGate } from "./hooks/use-access-gate";
import { PASSWORD_GATE_ENABLED } from "./lib/access-gate";
import { useRealtimeUpdates } from "./hooks/use-realtime";
import { Header } from "./components/Header";
import { BottomNav } from "./components/BottomNav";
import { NetworkProvider, useNetwork } from "./lib/network-context";
import { WalletProvider, useWallet } from "./hooks/use-wallet";
import { ThemeProvider } from "./lib/theme-context";
import { AgentApprovalProvider } from "./lib/agent-approval-context";
import { useAuthSession } from "./hooks/use-auth-session";
import { useBridgeBalances } from "./hooks/use-bridge";
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

function BridgeWarmup() {
  const { address } = useWallet();
  const { network } = useNetwork();
  const auth = useAuthSession();

  useBridgeBalances(address, network === "mainnet" && auth.isAuthenticated);
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

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: { componentStack?: string }) {
    console.error("[trader] Unhandled UI error:", error, info.componentStack ?? "");
  }
  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-surface-0 px-6 text-center gap-4">
          <p className="text-text-muted text-sm">Something went wrong. Please refresh and try again.</p>
          <p className="text-text-dim text-[11px] max-w-md break-words">
            {this.state.error.message}
          </p>
          <button
            onClick={() => { this.setState({ error: null }); window.location.reload(); }}
            className="app-button-md bg-accent text-surface-0 px-4 text-sm font-semibold"
          >
            Refresh
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const AUTHENTICATED_QUERY_KEYS = new Set([
  "agent-status",
  "bootstrap",
  "portfolio",
  "bridge-history",
  "referral",
  "earn",
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
      <BridgeWarmup />
      <Header />
      <main
        className="max-w-lg mx-auto min-h-screen bg-surface-0 text-text-primary"
        style={{ paddingTop: 76 }}
      >
        <Routes>
          <Route path="/markets" element={<Dashboard />} />
          <Route path="/portfolio" element={<PortfolioPage />} />
          <Route path="/referrals" element={<ReferralsPage />} />
          <Route path="/earn" element={<EarnPage />} />
          <Route path="/setup" element={<SetupPage />} />
          <Route path="/swap" element={<SwapPage />} />
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
      <Route
        path="/unlock"
        element={PASSWORD_GATE_ENABLED ? <PasswordGatePage /> : <Navigate to="/markets" replace />}
      />

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
          <AgentApprovalProvider>
            <ErrorBoundary>
              <AppRoutes />
            </ErrorBoundary>
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
          </AgentApprovalProvider>
        </NetworkProvider>
      </WalletProvider>
    </ThemeProvider>
  );
}
