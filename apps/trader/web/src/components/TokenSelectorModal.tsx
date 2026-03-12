import { collateralIconUrl } from "../lib/display";

interface TokenSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedToken: string;
  availableTokens: readonly string[];
  balances: Map<string, number>;
  onSelectToken: (token: string) => void;
}

export function TokenSelectorModal({
  isOpen,
  onClose,
  selectedToken,
  availableTokens,
  balances,
  onSelectToken,
}: TokenSelectorModalProps) {
  if (!isOpen) return null;

  const handleSelect = (token: string) => {
    onSelectToken(token);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg bg-surface-1 rounded-t-2xl sm:rounded-2xl p-6 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-heading text-text-primary">Select a token</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-text-muted hover:text-text-primary transition-colors"
            aria-label="Close"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Quick Access Tokens */}
        <div className="flex gap-3 mb-6 overflow-x-auto pb-2">
          {availableTokens.map((token) => (
            <button
              key={token}
              onClick={() => handleSelect(token)}
              className={`flex flex-col items-center gap-2 min-w-[72px] p-3 rounded-xl transition-colors ${
                selectedToken === token
                  ? "bg-accent/20 border border-accent"
                  : "bg-surface-2 border border-border hover:border-accent/50"
              }`}
            >
              <img
                src={collateralIconUrl(token)}
                alt={token}
                className="w-10 h-10 rounded-full"
              />
              <span className="text-xs font-medium text-text-primary">{token}</span>
            </button>
          ))}
        </div>

        {/* Token List */}
        <div className="flex-1 overflow-y-auto -mx-6 px-6">
          <h3 className="text-sm font-medium text-text-muted mb-3 flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            Your tokens
          </h3>

          <div className="space-y-2">
            {availableTokens.map((token) => {
              const balance = balances.get(token) ?? 0;
              return (
                <button
                  key={token}
                  onClick={() => handleSelect(token)}
                  className={`w-full flex items-center gap-3 p-3 rounded-lg transition-colors ${
                    selectedToken === token
                      ? "bg-accent/20 border border-accent"
                      : "bg-surface-2 hover:bg-surface-3 border border-transparent"
                  }`}
                >
                  <img
                    src={collateralIconUrl(token)}
                    alt={token}
                    className="w-10 h-10 rounded-full"
                  />
                  <div className="flex-1 text-left">
                    <div className="font-medium text-text-primary">{token}</div>
                    <div className="text-xs text-text-dim">{token}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium text-text-primary">
                      {balance.toFixed(2)}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
