import { useState, useRef, useEffect } from "react";
import { useWallet } from "../hooks/use-wallet";
import { useAuthSession } from "../hooks/use-auth-session";
import { NavLink } from "react-router-dom";

function truncateAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

/**
 * Deterministic identicon: renders a unique 3x3 grid of colored cells
 * derived from the address bytes. Symmetric along the vertical axis.
 */
function AddressIdenticon({ address, size = 24 }: { address: string; size?: number }) {
  const bytes = address.toLowerCase().replace("0x", "").slice(0, 12);
  const h1 = parseInt(bytes.slice(0, 3), 16) % 360;
  const h2 = (h1 + 120) % 360;

  // 3x3 grid, mirrored horizontally (so only col 0 and col 1 matter; col 2 = col 0)
  const cells: boolean[][] = [];
  for (let row = 0; row < 3; row++) {
    const charIdx = row * 2;
    const v0 = parseInt(bytes[charIdx] || "0", 16) > 7;
    const v1 = parseInt(bytes[charIdx + 1] || "0", 16) > 7;
    cells.push([v0, v1, v0]); // mirror
  }

  const cellSize = size / 3;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="rounded-full overflow-hidden">
      <rect width={size} height={size} fill={`hsl(${h1}, 40%, 20%)`} />
      {cells.map((row, ri) =>
        row.map((on, ci) =>
          on ? (
            <rect
              key={`${ri}-${ci}`}
              x={ci * cellSize}
              y={ri * cellSize}
              width={cellSize}
              height={cellSize}
              fill={`hsl(${h2}, 65%, 55%)`}
            />
          ) : null,
        ),
      )}
    </svg>
  );
}

const BANNER_HEIGHT = 28; // px

export function Header() {
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
  const auth = useAuthSession();

  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  function handleLogout(): void {
    setOpen(false);
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
          {isConnected && address ? (
            <div ref={ref} className="relative">
              <button
                onClick={() => setOpen(!open)}
                className="app-control bg-surface-2 hover:bg-surface-3 border border-border px-2 gap-2 transition-colors"
              >
                <AddressIdenticon address={address} size={20} />
                <span className="text-[11px] text-text-muted">{truncateAddress(address)}</span>
                <svg className="w-3 h-3 text-text-dim" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
              </button>

              {open && (
                <div className="absolute right-0 top-full mt-1 z-50 bg-surface-1 border border-border shadow-lg min-w-[200px]">
                  {/* Wallet address(es) */}
                  {wallets.length > 1 ? (
                    wallets.map((w) => (
                      <button
                        key={w.address}
                        onClick={() => {
                          setActiveWalletAddress(w.address as `0x${string}`);
                          setOpen(false);
                        }}
                        className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-xs transition-colors ${
                          w.address === activeWallet?.address
                            ? "text-accent bg-accent-muted"
                            : "text-text-secondary hover:bg-surface-2 hover:text-text-primary"
                        }`}
                      >
                        <AddressIdenticon address={w.address} size={18} />
                        <span>{truncateAddress(w.address)}</span>
                        {w.address === activeWallet?.address && (
                          <svg className="w-3 h-3 ml-auto text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                          </svg>
                        )}
                      </button>
                    ))
                  ) : (
                    <div className="px-3 py-2.5 text-xs text-text-muted flex items-center gap-2.5">
                      <AddressIdenticon address={address} size={18} />
                      <span>{truncateAddress(address)}</span>
                    </div>
                  )}

                  {/* Divider */}
                  <div className="border-t border-border" />

                  {/* Sign in / Log out */}
                  {auth.isAuthenticated ? (
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs text-short hover:bg-surface-2 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
                      </svg>
                      Log Out
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        setOpen(false);
                        void auth.signIn();
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs text-accent hover:bg-surface-2 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
                      </svg>
                      Sign In
                    </button>
                  )}
                </div>
              )}
            </div>
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
