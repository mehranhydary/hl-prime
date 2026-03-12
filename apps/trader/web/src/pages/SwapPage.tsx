import { useWallet } from "../hooks/use-wallet";
import { useBootstrap } from "../hooks/use-bootstrap";
import { useNetwork } from "../lib/network-context";
import { useAuthSession } from "../hooks/use-auth-session";
import { SwapForm } from "../components/SwapForm";

export function SwapPage() {
  const { address, isConnected, connect, isConnecting, error } = useWallet();
  const auth = useAuthSession();
  const { network } = useNetwork();
  const { data: bootstrap, isLoading, error: bootstrapError } = useBootstrap(address, network);

  if (!isConnected) {
    return (
      <div className="max-w-lg mx-auto px-4 pt-12 pb-24">
        <div className="bg-surface-1 border border-border rounded p-6 text-center space-y-4">
          <h1 className="text-lg font-semibold text-text-primary font-heading">Connect Wallet</h1>
          <p className="text-text-muted text-sm leading-relaxed">
            Connect your wallet to swap stablecoins.
          </p>
          <button
            onClick={connect}
            disabled={isConnecting}
            className="app-button-md bg-accent hover:bg-accent/90 disabled:opacity-50 px-6 text-sm font-semibold text-surface-0 transition-colors"
          >
            {isConnecting ? "Connecting..." : "Connect Wallet"}
          </button>
          {error && <p className="text-short text-xs">{error}</p>}
        </div>
      </div>
    );
  }

  if (!auth.isAuthenticated) {
    return (
      <div className="max-w-lg mx-auto px-4 pt-12 pb-24">
        <div className="bg-surface-1 border border-border rounded p-6 text-center space-y-4">
          <h2 className="text-lg font-semibold text-text-primary font-heading">Sign in to continue</h2>
          <p className="text-sm text-text-muted">
            Sign in with your wallet to swap stablecoins.
          </p>
          <button
            onClick={() => { void auth.signIn(); }}
            className="app-button-md bg-accent hover:bg-accent/90 px-6 text-sm font-semibold text-surface-0 transition-colors"
          >
            Sign In
          </button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="max-w-lg mx-auto px-4 py-8 pb-24">
        <div className="animate-pulse space-y-3">
          <div className="h-8 bg-surface-1 w-48 rounded" />
          <div className="h-64 bg-surface-1 rounded" />
        </div>
      </div>
    );
  }

  if (bootstrapError) {
    return (
      <div className="max-w-lg mx-auto px-4 py-8 pb-24">
        <div className="bg-short/10 border border-short/20 rounded p-4 text-sm text-short">
          {bootstrapError.message}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-4 pb-24">
      <div className="space-y-4">
        <h1 className="text-2xl font-heading text-text-primary">Swap Stablecoins</h1>

        <div className="bg-surface-1 border border-border rounded p-4">
          <SwapForm balance={bootstrap?.balance ?? null} />
        </div>

        <div className="text-xs text-text-dim space-y-1">
          <p>• Swaps execute on Hyperliquid spot markets via IOC orders</p>
          <p>• Supported tokens: USDC, USDE, USDH, USDT0</p>
          <p>• Slippage tolerance: 50 bps (0.5%)</p>
        </div>
      </div>
    </div>
  );
}
