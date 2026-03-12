import { useState, type ReactNode } from "react";
import { useWallet } from "../hooks/use-wallet";
import { useAuthSession } from "../hooks/use-auth-session";
import { useNetwork } from "../lib/network-context";
import {
  useReferralData,
  useCreateCode,
  useEnterCode,
  useClaimRewards,
} from "../hooks/use-referrals";
import type { ReferralRow } from "@shared/types";

const ROWS_PER_PAGE = 10;

function formatUsd(value: string): string {
  const n = parseFloat(value);
  if (!Number.isFinite(n)) return "$0.00";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function formatDate(ms: number): string {
  const d = new Date(ms);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const year = d.getFullYear();
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  const s = d.getSeconds().toString().padStart(2, "0");
  return `${month}/${day}/${year} - ${h}:${m}:${s}`;
}

function truncAddr(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function normalizeReferralCode(code: string): string {
  return code.trim().toUpperCase();
}

// ─── Modal Shell ──────────────────────────────────────────────

function Modal({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative bg-surface-1 border border-border p-8 w-full max-w-md mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-text-muted hover:text-text-primary transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
        {children}
      </div>
    </div>
  );
}

// ─── Enter Code Modal ─────────────────────────────────────────

function EnterCodeModal({
  open,
  onClose,
  currentCode,
  onSubmit,
  isPending,
  error,
}: {
  open: boolean;
  onClose: () => void;
  currentCode: string | null;
  onSubmit: (code: string) => void;
  isPending: boolean;
  error: string | null;
}) {
  const [code, setCode] = useState("");
  const normalizedCode = normalizeReferralCode(code);

  return (
    <Modal open={open} onClose={onClose}>
      <h2 className="text-xl font-semibold text-text-primary font-heading text-center mb-3">
        Enter Code
      </h2>
      {currentCode ? (
        <div className="space-y-2">
          <p className="text-text-secondary text-sm text-center">
            You are using the code: <span className="text-text-primary font-medium">{currentCode}</span>
          </p>
          <p className="text-text-muted text-xs text-center">
            Referral code is linked permanently and cannot be changed.
          </p>
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!normalizedCode || isPending) return;
            onSubmit(normalizedCode);
          }}
        >
          <p className="text-text-muted text-xs text-center">
            Enter a friend&apos;s referral code. This can only be set once.
          </p>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="Enter referral code"
            maxLength={20}
            className="w-full bg-surface-2 border border-border px-4 py-3 text-sm text-text-primary placeholder:text-text-dim focus:outline-none focus:border-accent/40 transition-colors"
          />
          {error && <p className="text-short text-xs">{error}</p>}
          <button
            type="submit"
            disabled={!normalizedCode || isPending}
            className="w-full bg-accent hover:bg-accent/90 disabled:opacity-50 py-3 text-sm font-semibold text-surface-0 transition-all"
          >
            {isPending ? "Signing..." : "Enter"}
          </button>
        </form>
      )}
    </Modal>
  );
}

// ─── Share Code Modal ─────────────────────────────────────────

function ShareCodeModal({
  open,
  onClose,
  code,
  isCreating,
  onCreate,
  createError,
  createPending,
}: {
  open: boolean;
  onClose: () => void;
  code: string | null;
  isCreating: boolean;
  onCreate: (code: string) => void;
  createError: string | null;
  createPending: boolean;
}) {
  const [newCode, setNewCode] = useState("");
  const [copied, setCopied] = useState(false);

  const joinUrl = code ? `https://app.hyperliquid.xyz/join/${code}` : "";

  const handleCopy = async () => {
    await navigator.clipboard.writeText(joinUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Modal open={open} onClose={onClose}>
      {code ? (
        <>
          <h2 className="text-xl font-semibold text-text-primary font-heading text-center mb-3">
            Share Code
          </h2>
          <p className="text-text-secondary text-sm text-center mb-4">
            Your code is <span className="text-text-primary font-medium">{code}</span>
          </p>
          <div className="flex items-center justify-center gap-2 mb-6">
            <span className="text-accent text-sm">{joinUrl}</span>
            <button
              onClick={handleCopy}
              className="text-accent hover:text-accent/80 transition-colors"
              title="Copy link"
            >
              {copied ? (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M3 8l3 3 7-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <rect x="5" y="5" width="9" height="9" rx="1" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M11 5V3a1 1 0 00-1-1H3a1 1 0 00-1 1v7a1 1 0 001 1h2" stroke="currentColor" strokeWidth="1.2" />
                </svg>
              )}
            </button>
          </div>
          <p className="text-text-muted text-xs text-center leading-relaxed">
            You will receive 10% of referred users' fees and they will receive a 4% discount.
            See the Docs for more.
          </p>
        </>
      ) : isCreating ? (
        <>
          <h2 className="text-xl font-semibold text-text-primary font-heading text-center mb-3">
            Create Code
          </h2>
          <div className="space-y-4">
            <input
              type="text"
              value={newCode}
              onChange={(e) => setNewCode(e.target.value.toUpperCase())}
              placeholder="Choose your code (1-20 chars)"
              maxLength={20}
              className="w-full bg-surface-2 border border-border px-4 py-3 text-sm text-text-primary placeholder:text-text-dim focus:outline-none focus:border-accent/40 transition-colors"
            />
            {createError && <p className="text-short text-xs">{createError}</p>}
            <button
              onClick={() => onCreate(newCode)}
              disabled={!newCode || createPending}
              className="w-full bg-accent hover:bg-accent/90 disabled:opacity-50 py-3 text-sm font-semibold text-surface-0 transition-all"
            >
              {createPending ? "Signing..." : "Create Code"}
            </button>
          </div>
        </>
      ) : (
        <>
          <h2 className="text-xl font-semibold text-text-primary font-heading text-center mb-3">
            Share Code
          </h2>
          <p className="text-text-muted text-sm text-center">
            Trade $10,000 in volume to unlock referral code creation.
          </p>
        </>
      )}
    </Modal>
  );
}

// ─── Claim Rewards Modal ──────────────────────────────────────

function ClaimRewardsModal({
  open,
  onClose,
  amount,
  onClaim,
  isPending,
  error,
}: {
  open: boolean;
  onClose: () => void;
  amount: string;
  onClaim: () => void;
  isPending: boolean;
  error: string | null;
}) {
  const n = parseFloat(amount);
  return (
    <Modal open={open} onClose={onClose}>
      <h2 className="text-xl font-semibold text-text-primary font-heading text-center mb-3">
        Claim Rewards
      </h2>
      <p className="text-text-secondary text-sm text-center mb-6">
        Claim {formatUsd(amount)} in rewards
      </p>
      {error && <p className="text-short text-xs text-center mb-3">{error}</p>}
      <button
        onClick={onClaim}
        disabled={isPending || n < 1}
        className="w-full bg-accent hover:bg-accent/90 disabled:opacity-50 py-3 text-sm font-semibold text-surface-0 transition-all"
      >
        {isPending ? "Signing..." : "Claim"}
      </button>
      {n < 1 && (
        <p className="text-text-dim text-xs text-center mt-3">
          Minimum $1.00 to claim
        </p>
      )}
    </Modal>
  );
}

// ─── Referral Table ───────────────────────────────────────────

function ReferralTable({ rows }: { rows: ReferralRow[] }) {
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(rows.length / ROWS_PER_PAGE));
  const visible = rows.slice(page * ROWS_PER_PAGE, (page + 1) * ROWS_PER_PAGE);
  const start = page * ROWS_PER_PAGE + 1;
  const end = Math.min((page + 1) * ROWS_PER_PAGE, rows.length);

  return (
    <div>
      {/* Rows */}
      {visible.length === 0 ? (
        <div className="px-4 py-8 text-center text-text-dim text-sm">
          No referrals yet
        </div>
      ) : (
        visible.map((r) => (
          <div
            key={r.address}
            className="px-4 py-3 border-b border-border/50 hover:bg-surface-2/50 transition-colors"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-text-primary text-xs">{truncAddr(r.address)}</span>
              <span className="text-text-dim text-[10px]">{formatDate(r.dateJoined)}</span>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="text-text-muted">Vol <span className="text-text-primary">{formatUsd(r.totalVolume)}</span></span>
              <span className="text-text-muted">Fees <span className="text-text-primary">{formatUsd(r.feesPaid)}</span></span>
              <span className="text-text-muted ml-auto">Reward <span className="text-accent">{formatUsd(r.yourRewards)}</span></span>
            </div>
          </div>
        ))
      )}

      {/* Pagination */}
      {rows.length > 0 && (
        <div className="flex items-center justify-end gap-3 px-4 py-3 text-xs text-text-muted">
          <span>{start}-{end} of {rows.length}</span>
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="disabled:opacity-30 hover:text-text-primary transition-colors"
          >
            &lt;
          </button>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="disabled:opacity-30 hover:text-text-primary transition-colors"
          >
            &gt;
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────

export function ReferralsPage() {
  const { address, isConnected, connect, isConnecting } = useWallet();
  const auth = useAuthSession();
  const { network } = useNetwork();
  const { data, isLoading, error, refetch } = useReferralData(address, network);

  const enterCodeMut = useEnterCode(address, network);
  const createCodeMut = useCreateCode(address, network);
  const claimMut = useClaimRewards(address, network);

  const [enterOpen, setEnterOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [claimOpen, setClaimOpen] = useState(false);

  // ─── Not connected ────────────────────────────

  if (!isConnected) {
    return (
      <div className="px-4 pt-12 pb-24">
        <div className="bg-surface-1 border border-border p-6 text-center space-y-4">
          <h1 className="text-lg font-semibold text-text-primary font-heading">Referrals</h1>
          <p className="text-text-muted text-sm leading-relaxed">
            Connect your wallet to view and manage your referrals.
          </p>
          <button
            onClick={connect}
            disabled={isConnecting}
            className="app-button-md bg-accent hover:bg-accent/90 disabled:opacity-50 px-6 text-sm font-semibold text-surface-0 transition-colors"
          >
            {isConnecting ? "Connecting..." : "Connect Wallet"}
          </button>
        </div>
      </div>
    );
  }

  if (!auth.isAuthenticated) {
    return (
      <div className="px-4 pt-12 pb-24">
        <div className="bg-surface-1 border border-border p-6 text-center space-y-4">
          <h2 className="text-lg font-semibold text-text-primary font-heading">Sign in required</h2>
          <p className="text-sm text-text-muted">
            Referral data requires an authenticated session.
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

  // ─── Loading ──────────────────────────────────

  if (isLoading) {
    return (
      <div className="px-4 py-4">
        <div className="animate-pulse space-y-3">
          <div className="h-8 bg-surface-1 w-32" />
          <div className="grid grid-cols-3 gap-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 bg-surface-1" />
            ))}
          </div>
          <div className="h-48 bg-surface-1" />
        </div>
      </div>
    );
  }

  // ─── Error ───────────────────────────────────

  if (error || !data) {
    return (
      <div className="px-4 pt-12 pb-24">
        <div className="bg-surface-1 border border-border p-6 text-center space-y-4">
          <h1 className="text-lg font-semibold text-text-primary font-heading">Referrals</h1>
          <p className="text-text-muted text-sm">
            {error?.message ?? "Failed to load referral data. Please try again."}
          </p>
          <button
            onClick={() => refetch()}
            className="border border-accent text-accent hover:bg-accent/10 px-6 py-2.5 text-sm font-medium transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // ─── Derived state ────────────────────────────

  const totalRewards = parseFloat(data.claimedRewards) + parseFloat(data.unclaimedRewards);
  const canCreateCode = data.referrerStage === "needToCreateCode";
  const linkedReferralCode = data.referredBy?.code ?? null;

  return (
    <div className="px-4 py-4 pb-24">
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-text-primary font-heading">Referrals</h1>
        <p className="text-text-muted text-xs mt-1">
          Refer users to earn rewards.{" "}
          <a
            href="https://hyperliquid.gitbook.io/hyperliquid-docs/referrals"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:underline"
          >
            Learn more
          </a>
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="bg-surface-1 border border-border p-3">
          <div className="text-text-muted text-[10px] mb-1">Referred</div>
          <div className="text-lg font-semibold text-text-primary font-heading">{data.referralCount}</div>
        </div>
        <div className="bg-surface-1 border border-border p-3">
          <div className="text-text-muted text-[10px] mb-1">Earned</div>
          <div className="text-lg font-semibold text-text-primary font-heading">{formatUsd(totalRewards.toString())}</div>
        </div>
        <div className="bg-surface-1 border border-border p-3">
          <div className="text-text-muted text-[10px] mb-1">Claimable</div>
          <div className="text-lg font-semibold text-text-primary font-heading">{formatUsd(data.unclaimedRewards)}</div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setEnterOpen(true)}
          className="flex-1 border border-accent text-accent hover:bg-accent/10 px-3 py-2 text-xs font-medium transition-colors"
        >
          Enter Code
        </button>
        <button
          onClick={() => setShareOpen(true)}
          className="flex-1 border border-accent text-accent hover:bg-accent/10 px-3 py-2 text-xs font-medium transition-colors"
        >
          Share Code
        </button>
        <button
          onClick={() => setClaimOpen(true)}
          className="flex-1 bg-accent hover:bg-accent/90 px-3 py-2 text-xs font-semibold text-surface-0 transition-all"
        >
          Claim
        </button>
      </div>

      {/* Referrals heading */}
      <div className="border-b border-border mb-0">
        <span className="inline-block px-1 pb-2 text-sm font-medium text-text-primary border-b-2 border-accent">
          Referrals
        </span>
      </div>

      {/* Table */}
      <ReferralTable rows={data.referrals} />

      {/* Modals */}
      <EnterCodeModal
        open={enterOpen}
        onClose={() => { setEnterOpen(false); enterCodeMut.reset(); }}
        currentCode={linkedReferralCode}
        onSubmit={(code) => {
          if (linkedReferralCode) return;
          enterCodeMut.mutate(code, {
            onSuccess: () => setEnterOpen(false),
          });
        }}
        isPending={enterCodeMut.isPending}
        error={enterCodeMut.error?.message ?? null}
      />

      <ShareCodeModal
        open={shareOpen}
        onClose={() => { setShareOpen(false); createCodeMut.reset(); }}
        code={data.referrerCode}
        isCreating={canCreateCode}
        onCreate={(code) => {
          createCodeMut.mutate(code, {
            onSuccess: () => setShareOpen(false),
          });
        }}
        createError={createCodeMut.error?.message ?? null}
        createPending={createCodeMut.isPending}
      />

      <ClaimRewardsModal
        open={claimOpen}
        onClose={() => { setClaimOpen(false); claimMut.reset(); }}
        amount={data.unclaimedRewards}
        onClaim={() => {
          claimMut.mutate(undefined, {
            onSuccess: () => setClaimOpen(false),
          });
        }}
        isPending={claimMut.isPending}
        error={claimMut.error?.message ?? null}
      />
    </div>
  );
}
