import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { randomBytes } from "node:crypto";
import { isAddress } from "viem";
import type { ServerConfig } from "../config.js";
import { getRuntimeStateStore } from "../services/runtime-state.js";
import { extractLinkedExternalWalletAddresses, getPrivyUser, verifyPrivyAccessToken } from "../services/privy.js";
import { parseNetwork, ValidationError } from "../utils/validation.js";

const WS_TICKET_TTL_MS = 30_000;

export interface AuthenticatedRequest extends Request {
  auth?: {
    privyUserId: string;
    sessionId: string;
    accessToken: string;
    linkedWalletAddresses: `0x${string}`[];
    masterAddress?: `0x${string}`;
  };
}

function readBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  return token.length > 0 ? token : null;
}

function readRequestedAddress(req: AuthenticatedRequest): `0x${string}` | undefined {
  const bodyAddress = typeof req.body?.masterAddress === "string"
    ? req.body.masterAddress
    : undefined;
  const queryAddress = typeof req.query?.masterAddress === "string"
    ? req.query.masterAddress
    : undefined;
  const requestedAddress = bodyAddress ?? queryAddress;
  if (!requestedAddress) return undefined;
  if (!isAddress(requestedAddress)) {
    throw new Error("Invalid masterAddress format");
  }
  return requestedAddress.toLowerCase() as `0x${string}`;
}

export function authRoutes(config: ServerConfig): Router {
  const router = Router();

  router.post("/ws-ticket", sessionAuth(config), (req: Request, res: Response) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const masterAddress = authReq.auth?.masterAddress;
      if (!masterAddress) {
        res.status(400).json({ error: "masterAddress is required", code: "BAD_REQUEST" });
        return;
      }

      const network = parseNetwork(
        (req.body as { network?: unknown } | undefined)?.network,
        config.defaultNetwork,
      );
      const expiresAt = Date.now() + WS_TICKET_TTL_MS;
      const token = randomBytes(24).toString("hex");
      getRuntimeStateStore().putWSTicket({
        token,
        address: masterAddress,
        network,
        expiresAt,
      });
      res.json({ token, expiresAt, address: masterAddress, network });
    } catch (error) {
      if (error instanceof ValidationError) {
        res.status(400).json({ error: error.message, code: "BAD_REQUEST" });
        return;
      }
      res.status(500).json({ error: "Failed to issue websocket ticket", code: "WS_TICKET_FAILED" });
    }
  });

  return router;
}

export function sessionAuth(config: Pick<ServerConfig, "authEnabled" | "privy">) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!config.authEnabled) {
      next();
      return;
    }

    const authReq = req as AuthenticatedRequest;
    const accessToken = readBearerToken(req);
    if (!accessToken) {
      res.status(401).json({ error: "Missing authentication token", code: "AUTH_FAILED" });
      return;
    }

    try {
      const verified = await verifyPrivyAccessToken(config, accessToken);
      const user = await getPrivyUser(config, verified.userId);
      const linkedWalletAddresses = extractLinkedExternalWalletAddresses(user);
      const requestedAddress = readRequestedAddress(authReq);
      if (requestedAddress && !linkedWalletAddresses.includes(requestedAddress)) {
        res.status(403).json({
          error: "masterAddress does not belong to the authenticated Privy user",
          code: "FORBIDDEN",
        });
        return;
      }

      authReq.auth = {
        privyUserId: verified.userId,
        sessionId: verified.sessionId,
        accessToken,
        linkedWalletAddresses,
        ...(requestedAddress ? { masterAddress: requestedAddress } : {}),
      };
      next();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid access token";
      if (message === "Invalid masterAddress format") {
        res.status(400).json({ error: message, code: "BAD_REQUEST" });
        return;
      }
      res.status(401).json({ error: message, code: "AUTH_FAILED" });
    }
  };
}
