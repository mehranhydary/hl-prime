/**
 * Shared EIP-712 auth constants used by both server middleware and frontend signer.
 *
 * Auth flow:
 *   1. Frontend requests POST /api/auth/challenge
 *   2. Frontend signs ONE EIP-712 challenge message
 *   3. Frontend sends signature to POST /api/auth/session
 *   4. Server verifies challenge + signature and issues a session token
 *   5. All subsequent requests use Authorization: Bearer <token>
 */

export const AUTH_DOMAIN = {
  name: "HyperliquidPrime Trader",
  version: "2",
} as const;

/** Bind auth signatures to this app-specific audience string. */
export const AUTH_AUDIENCE = "hl-prime-trader";

/** Supported EIP-712 chain IDs for auth signatures. */
export const AUTH_ALLOWED_CHAIN_IDS = [42161, 421614] as const;
export type AuthChainId = typeof AUTH_ALLOWED_CHAIN_IDS[number];

export function isAuthChainId(value: number): value is AuthChainId {
  return AUTH_ALLOWED_CHAIN_IDS.includes(value as AuthChainId);
}

export const AUTH_TYPES = {
  Auth: [
    { name: "address", type: "address" },
    { name: "nonce", type: "string" },
    { name: "issuedAt", type: "uint256" },
    { name: "audience", type: "string" },
  ],
} as const;

/** Challenge lifetime and signature max age (server-enforced) is 5 minutes. */
export const AUTH_CHALLENGE_TTL_MS = 5 * 60 * 1000;
export const AUTH_SIGNATURE_MAX_AGE_MS = 5 * 60 * 1000;

/** Sessions last 24 hours. */
export const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export interface SessionChallengeRequest {
  address: string;
  chainId: number;
}

export interface SessionChallengeResponse {
  address: string;
  chainId: number;
  nonce: string;
  issuedAt: number;
  expiresAt: number;
  audience: string;
}

export interface SessionRequest {
  address: string;
  chainId: number;
  nonce: string;
  signature: string;
}

export interface SessionResponse {
  expiresAt: number;
}
