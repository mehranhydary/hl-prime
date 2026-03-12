import { useWallet } from "../hooks/use-wallet";
import { useNetwork } from "../lib/network-context";
import { ThemeToggle } from "./ThemeToggle";
import type { Network } from "@shared/types";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuthSession } from "../hooks/use-auth-session";
import { lock as lockAccess } from "../lib/access-gate";

function truncateAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function walletLabel(address: string, walletClientType?: string): string {
  const prefix = walletClientType === "privy" || walletClientType === "privy-v2"
    ? "Embedded"
    : "Wallet";
  return `${prefix} ${truncateAddress(address)}`;
}

const BANNER_HEIGHT = 28; // px

export function Header() {
  const navigate = useNavigate();
  const {
    address,
    isConnected,
    isConnecting,
    connect,
    disconnect,
    wallets,
    activeWallet,
    setActiveWalletAddress,
  } = useWallet();
  const { network, setNetwork } = useNetwork();
  const auth = useAuthSession();

  function handleLock(): void {
    lockAccess();
    navigate("/", { replace: true });
  }

  function handleLogout(): void {
    void disconnect().catch(() => {});
  }

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
          <button
            onClick={handleLock}
            className="app-control bg-surface-2 hover:bg-surface-3 border border-border px-2.5 text-[11px] text-text-muted transition-colors"
          >
            Lock
          </button>
          <select
            value={network}
            onChange={(e) => setNetwork(e.target.value as Network)}
            className="app-control bg-surface-2 border border-border px-1.5 text-[11px] text-text-muted cursor-pointer"
          >
            <option value="mainnet">Mainnet</option>
            <option value="testnet">Testnet</option>
          </select>
          {wallets.length > 1 && address ? (
            <select
              value={address}
              onChange={(e) => setActiveWalletAddress(e.target.value as `0x${string}`)}
              className="app-control max-w-[132px] bg-surface-2 border border-border px-1.5 text-[11px] text-text-muted cursor-pointer"
            >
              {wallets.map((wallet) => (
                <option key={wallet.address} value={wallet.address}>
                  {walletLabel(wallet.address, wallet.walletClientType)}
                </option>
              ))}
            </select>
          ) : null}
          {isConnected ? (
            <>
              {wallets.length <= 1 && activeWallet ? (
                <div className="app-control bg-surface-2 border border-border px-2.5 text-[11px] text-text-muted">
                  {walletLabel(activeWallet.address, activeWallet.walletClientType)}
                </div>
              ) : null}
              {auth.isAuthenticated ? (
                <button
                  onClick={handleLogout}
                  className="app-control bg-long/10 hover:bg-long/20 border border-long/30 px-2.5 text-[11px] font-medium text-long transition-colors"
                >
                  Log Out
                </button>
              ) : (
                <button
                  onClick={() => { void auth.signIn(); }}
                  className="app-control bg-accent hover:bg-accent/90 border border-accent/20 px-2.5 text-[11px] font-medium text-surface-0 transition-colors"
                >
                  Sign In
                </button>
              )}
            </>
          ) : (
            <button
              onClick={connect}
              disabled={isConnecting}
              className="app-control bg-accent hover:bg-accent/90 disabled:opacity-50 px-3 text-[11px] font-medium text-surface-0 transition-colors"
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
