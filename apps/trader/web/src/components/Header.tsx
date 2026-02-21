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
      className="flex items-center justify-start px-4 text-[11px] tracking-wide"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: BANNER_HEIGHT,
        zIndex: 10000,
        background: "var(--color-short)",
        color: "#fff",
      }}
    >
      This UI is for testing and demo purposes only. Use at your own risk.
    </div>
    <header
      className="h-14 border-b border-border px-4 flex items-center backdrop-blur-md"
      style={{
        position: "fixed",
        top: BANNER_HEIGHT,
        left: 0,
        right: 0,
        zIndex: 9999,
        background: "color-mix(in srgb, var(--color-surface-0) 85%, transparent)",
      }}
    >
        <div className="w-full flex items-center justify-between">
        {/* Logo — ρ from site */}
        <div className="flex items-center gap-3">
          <NavLink to="/markets" className="flex items-center">
            <span className="text-3xl leading-none text-accent" style={{ fontFamily: "serif", transform: "translateY(-1px)" }}>&#961;</span>
          </NavLink>
          <nav className="flex items-center gap-1">
            <NavLink
              to="/markets"
              className={({ isActive }) =>
                `px-2 py-1 text-xs border transition-colors ${
                  isActive
                    ? "border-accent/40 bg-accent/10 text-accent"
                    : "border-transparent text-text-muted hover:text-text-primary"
                }`
              }
            >
              Markets
            </NavLink>
            <NavLink
              to="/portfolio"
              className={({ isActive }) =>
                `px-2 py-1 text-xs border transition-colors ${
                  isActive
                    ? "border-accent/40 bg-accent/10 text-accent"
                    : "border-transparent text-text-muted hover:text-text-primary"
                }`
              }
            >
              Portfolio
            </NavLink>
            <NavLink
              to="/referrals"
              className={({ isActive }) =>
                `px-2 py-1 text-xs border transition-colors ${
                  isActive
                    ? "border-accent/40 bg-accent/10 text-accent"
                    : "border-transparent text-text-muted hover:text-text-primary"
                }`
              }
            >
              Referrals
            </NavLink>
          </nav>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <select
            value={network}
            onChange={(e) => setNetwork(e.target.value as Network)}
            className="bg-surface-2 border border-border px-2 py-1 text-xs text-text-muted cursor-pointer"
          >
            <option value="mainnet">Mainnet</option>
            <option value="testnet">Testnet</option>
          </select>
          {isConnected ? (
            <>
              {auth.isAuthenticated ? (
                <button
                  onClick={auth.signOut}
                  className="bg-long/10 hover:bg-long/20 border border-long/30 px-3 py-1.5 text-xs font-medium text-long transition-colors"
                >
                  Signed in
                </button>
              ) : (
                <button
                  onClick={() => { void auth.signIn(); }}
                  className="bg-accent hover:bg-accent/90 border border-accent/20 px-3 py-1.5 text-xs font-medium text-surface-0 transition-colors"
                >
                  {auth.authRequired ? "Sign In Required" : "Sign In"}
                </button>
              )}
              <button
                onClick={disconnect}
                className="bg-surface-2 hover:bg-surface-3 border border-border px-3 py-1.5 text-sm text-text-muted transition-colors"
              >
                {truncateAddress(address!)}
              </button>
            </>
          ) : (
            <button
              onClick={connect}
              disabled={isConnecting}
              className="bg-accent hover:bg-accent/90 disabled:opacity-50 px-4 py-1.5 text-sm font-medium text-surface-0 transition-colors"
            >
              {isConnecting ? "Connecting..." : "Connect Wallet"}
            </button>
          )}
        </div>
      </div>
    </header>
    </>
  );
}
