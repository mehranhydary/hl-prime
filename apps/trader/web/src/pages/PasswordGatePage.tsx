import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAccessGate } from "../hooks/use-access-gate";

interface AccessRedirectState {
  from?: string;
}

export function PasswordGatePage() {
  const access = useAccessGate();
  const location = useLocation();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const redirectState = location.state as AccessRedirectState | null;
  const destination = redirectState?.from ?? "/markets";

  if (access.isUnlocked) {
    return <Navigate to={destination} replace />;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (isSubmitting) return;

    setError(null);
    setIsSubmitting(true);
    const result = await access.unlock(password);
    setIsSubmitting(false);

    if (result.ok) {
      navigate(destination, { replace: true });
      return;
    }

    if (result.code === "APP_AUTH_FAILED") {
      setError("Incorrect password.");
      return;
    }

    setError(result.error ?? "Unable to unlock app.");
  }

  return (
    <div className="min-h-screen bg-surface-0 text-text-primary flex items-center justify-center px-6">
      <div className="w-full max-w-sm border border-border bg-surface-1 p-6 sm:p-7">
        <div className="mb-6">
          <p className="text-[11px] uppercase tracking-[0.14em] text-text-muted">Private beta</p>
          <h1 className="mt-2 text-2xl font-heading text-text-primary">Enter Access Password</h1>
          <p className="mt-2 text-sm text-text-muted">
            Landing pages are public. App routes require an unlock password.
          </p>
        </div>

        <form onSubmit={(event) => { void onSubmit(event); }} className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-xs text-text-muted">Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full bg-surface-2 border border-border px-3 py-2 text-sm text-text-primary"
              placeholder="Enter password"
              autoComplete="current-password"
              autoFocus
            />
          </label>
          {error ? (
            <p className="text-xs text-short">{error}</p>
          ) : null}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-accent hover:bg-accent/90 disabled:opacity-60 px-4 py-2 text-sm font-medium text-surface-0 transition-colors"
          >
            {isSubmitting ? "Unlocking..." : "Unlock App"}
          </button>
        </form>

        <div className="mt-4 text-center">
          <Link to="/" className="text-xs text-text-muted hover:text-text-primary transition-colors">
            Back to landing
          </Link>
        </div>
      </div>
    </div>
  );
}
