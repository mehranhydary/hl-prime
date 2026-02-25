import { useWallet } from "../hooks/use-wallet";
import { useNetwork } from "../lib/network-context";
import { ThemeToggle } from "./ThemeToggle";
import type { Network } from "@shared/types";
import { NavLink } from "react-router-dom";
import { useAuthSession } from "../hooks/use-auth-session";

function truncateAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

const BANNER_HEIGHT = 28; // px

export function Header() {
  const { address, isConnected, isConnecting, connect, disconnect } = useWallet();
  const { network, setNetwork } = useNetwork();
  const auth = useAuthSession();

  return (
    <>
    {/* Warning banner */}
    <div
      className="fixed top-0 left-0 right-0 z-[10000] flex items-center justify-center px-4 text-[10px] tracking-wide"
      style={{
        height: BANNER_HEIGHT,
        background: "var(--color-short)",
        color: "#fff",
      }}
    >
      Testing &amp; demo only. Use at your own risk.
    </div>
    <header
      className="fixed left-0 right-0 z-[9999] h-12 border-b border-border backdrop-blur-md"
      style={{
        top: BANNER_HEIGHT,
        background: "color-mix(in srgb, var(--color-surface-0) 85%, transparent)",
      }}
    >
      <div className="max-w-lg mx-auto h-full px-4 flex items-center justify-between">
        {/* Logo */}
        <NavLink to="/markets" className="flex items-center">
          <span className="text-2xl leading-none text-accent font-logo">P</span>
        </NavLink>

        {/* Controls */}
        <div className="flex items-center gap-1.5">
          <ThemeToggle />
          <select
            value={network}
            onChange={(e) => setNetwork(e.target.value as Network)}
            className="bg-surface-2 border border-border px-1.5 py-1 text-[11px] text-text-muted cursor-pointer"
          >
            <option value="mainnet">Mainnet</option>
            <option value="testnet">Testnet</option>
          </select>
          {isConnected ? (
            <>
              {auth.isAuthenticated ? (
                <button
                  onClick={auth.signOut}
                  className="bg-long/10 hover:bg-long/20 border border-long/30 px-2.5 py-1 text-[11px] font-medium text-long transition-colors"
                >
                  Signed in
                </button>
              ) : (
                <button
                  onClick={() => { void auth.signIn(); }}
                  className="bg-accent hover:bg-accent/90 border border-accent/20 px-2.5 py-1 text-[11px] font-medium text-surface-0 transition-colors"
                >
                  {auth.authRequired ? "Sign In" : "Sign In"}
                </button>
              )}
              <button
                onClick={disconnect}
                className="bg-surface-2 hover:bg-surface-3 border border-border px-2.5 py-1 text-[11px] text-text-muted transition-colors font-mono"
              >
                {truncateAddress(address!)}
              </button>
            </>
          ) : (
            <button
              onClick={connect}
              disabled={isConnecting}
              className="bg-accent hover:bg-accent/90 disabled:opacity-50 px-3 py-1 text-[11px] font-medium text-surface-0 transition-colors"
            >
              {isConnecting ? "Connecting..." : "Connect"}
            </button>
          )}
        </div>
      </div>
    </header>
    </>
  );
}
