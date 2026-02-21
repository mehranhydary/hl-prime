/**
 * Shared EIP-712 auth constants used by both server middleware and frontend signer.
 *
 * Auth flow:
 *   1. Frontend signs ONE EIP-712 message on wallet connect
 *   2. Sends it to POST /api/auth/session
 *   3. Server verifies, returns a session token
 *   4. All subsequent requests use Authorization: Bearer <token>
 */

export const AUTH_DOMAIN = {
  name: "HyperliquidPrime",
  version: "1",
} as const;

export const AUTH_TYPES = {
  Auth: [
    { name: "address", type: "address" },
    { name: "timestamp", type: "uint256" },
    { name: "nonce", type: "string" },
  ],
} as const;

/** The initial EIP-712 signature is valid for 5 minutes (for the session creation request). */
export const AUTH_SIGNATURE_MAX_AGE_MS = 5 * 60 * 1000;

/** Sessions last 24 hours. */
export const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export interface SessionRequest {
  address: string;
  timestamp: number;
  nonce: string;
  signature: string;
}

export interface SessionResponse {
  token: string;
  expiresAt: number;
}
