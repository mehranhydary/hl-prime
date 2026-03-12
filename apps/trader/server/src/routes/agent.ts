import { Router } from "express";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { v4 as uuid } from "uuid";
import type { ServerConfig } from "../config.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";
import { PendingAgentStore } from "../services/agent-store.js";
import { HLClientService } from "../services/hl-client.js";
import { createPrivyEthereumWallet } from "../services/privy.js";
import { parseNetwork, requireAddress, requireString, ValidationError } from "../utils/validation.js";
import type {
  AgentInitRequest,
  AgentInitResponse,
  AgentCompleteRequest,
  AgentCompleteResponse,
  AgentStatusResponse,
} from "../../../shared/types.js";

// Shared singleton instances
let clientService: HLClientService | null = null;
const pendingStore = new PendingAgentStore();

export function getClientService(config: ServerConfig): HLClientService {
  if (!clientService) {
    clientService = new HLClientService(config);
  }
  return clientService;
}

export function agentRoutes(config: ServerConfig): Router {
  const router = Router();
  const service = getClientService(config);
  const agentStore = service.getAgentStore();

  function buildInitResponse(params: {
    pendingAgentId: string;
    agentAddress: `0x${string}`;
    agentName: string;
  }): AgentInitResponse {
    return {
      pendingAgentId: params.pendingAgentId,
      agentAddress: params.agentAddress,
      agentName: params.agentName,
      builderApproval: {
        builder: config.defaultBuilderAddress,
        feeBps: config.defaultBuilderFeeBps,
        maxFeeRate: `${(config.defaultBuilderFeeBps * 0.01).toFixed(2)}%`,
      },
    };
  }

  // POST /api/agent/init
  // Generate a pending agent keypair and return the address for frontend approval
  router.post("/init", async (req, res) => {
    try {
      const body = req.body as AgentInitRequest;
      const masterAddress = requireAddress(body.masterAddress, "masterAddress");
      const network = parseNetwork(body.network, config.defaultNetwork);
      const ownerPrivyUserId = (req as AuthenticatedRequest).auth?.privyUserId;

      if (await agentStore.exists(masterAddress, network)) {
        res.status(409).json({
          error: "Agent already configured for this wallet and network",
          code: "AGENT_ALREADY_CONFIGURED",
        });
        return;
      }

      const existingPending = pendingStore.findForMaster(masterAddress, network, ownerPrivyUserId);
      if (existingPending) {
        res.json(buildInitResponse({
          pendingAgentId: existingPending.id,
          agentAddress: existingPending.agentAddress,
          agentName: existingPending.agentName,
        }));
        return;
      }

      let agentPrivateKey: `0x${string}` | undefined;
      let agentAddress: `0x${string}`;
      let privyWalletId: string | undefined;

      if (config.signerBackend === "privy") {
        const wallet = await createPrivyEthereumWallet(config);
        agentAddress = wallet.address.toLowerCase() as `0x${string}`;
        privyWalletId = wallet.id;
      } else {
        agentPrivateKey = generatePrivateKey();
        agentAddress = privateKeyToAccount(agentPrivateKey).address;
      }

      const expiryMs = Date.now() + config.agentExpiryDays * 24 * 60 * 60 * 1000;
      const agentName = `hlprime valid_until ${expiryMs}`;

      const pendingId = uuid();
      pendingStore.add({
        id: pendingId,
        agentPrivateKey,
        agentAddress,
        agentName,
        createdAt: Date.now(),
        privyWalletId,
        ownerPrivyUserId,
        masterAddress: masterAddress.toLowerCase() as `0x${string}`,
        network,
      });

      res.json(buildInitResponse({
        pendingAgentId: pendingId,
        agentAddress,
        agentName,
      }));
    } catch (err) {
      if (err instanceof ValidationError) {
        res.status(400).json({
          error: err.message,
          code: "BAD_REQUEST",
        });
        return;
      }
      console.error("[agent/init]", err instanceof Error ? err.message : String(err));
      res.status(500).json({
        error: "Failed to initialize agent",
        code: "AGENT_INIT_FAILED",
      });
    }
  });

  // POST /api/agent/complete
  // After frontend has signed approveAgent + userSetAbstraction, persist the agent key
  router.post("/complete", async (req, res) => {
    try {
      const body = req.body as AgentCompleteRequest;
      const masterAddress = requireAddress(body.masterAddress, "masterAddress");
      const network = parseNetwork(body.network, config.defaultNetwork);
      const pendingAgentId = requireString(body.pendingAgentId, "pendingAgentId");
      const ownerPrivyUserId = (req as AuthenticatedRequest).auth?.privyUserId;
      const pending = pendingStore.get(pendingAgentId);
      if (!pending) {
        res.status(404).json({
          error: "Pending agent not found or expired",
          code: "PENDING_NOT_FOUND",
        });
        return;
      }
      if (!pending.masterAddress || !pending.network) {
        res.status(409).json({
          error: "Pending agent is missing ownership metadata. Start setup again.",
          code: "PENDING_INVALID",
        });
        return;
      }
      if (
        pending.masterAddress.toLowerCase() !== masterAddress.toLowerCase()
        || pending.network !== network
      ) {
        res.status(409).json({
          error: "Pending agent does not match the requested wallet or network",
          code: "PENDING_MISMATCH",
        });
        return;
      }
      if (ownerPrivyUserId && pending.ownerPrivyUserId !== ownerPrivyUserId) {
        res.status(403).json({
          error: "Pending agent does not belong to the authenticated user",
          code: "FORBIDDEN",
        });
        return;
      }

      const takenPending = pendingStore.take(pendingAgentId);
      if (!takenPending) {
        res.status(404).json({
          error: "Pending agent not found or expired",
          code: "PENDING_NOT_FOUND",
        });
        return;
      }

      // Persist the agent key
      await agentStore.save({
        backend: config.signerBackend,
        agentPrivateKey: takenPending.agentPrivateKey,
        agentAddress: takenPending.agentAddress,
        masterAddress,
        network,
        agentName: takenPending.agentName,
        createdAt: Date.now(),
        privyWalletId: takenPending.privyWalletId,
      });

      // Evict any cached HP client so the next trade creates a fresh one
      // that will re-check the builder fee approval on-chain.
      service.evictClient(masterAddress, network);

      const response: AgentCompleteResponse = {
        success: true,
        agentAddress: takenPending.agentAddress,
      };

      res.json(response);
    } catch (err) {
      if (err instanceof ValidationError) {
        res.status(400).json({
          error: err.message,
          code: "BAD_REQUEST",
        });
        return;
      }
      console.error("[agent/complete]", err instanceof Error ? err.message : String(err));
      res.status(500).json({
        error: "Failed to complete agent setup",
        code: "AGENT_COMPLETE_FAILED",
      });
    }
  });

  // GET /api/agent/status?masterAddress=0x...&network=mainnet
  router.get("/status", async (req, res) => {
    try {
      const masterAddress = requireAddress(req.query.masterAddress, "masterAddress");
      const network = parseNetwork(req.query.network, config.defaultNetwork);

      const configured = await agentStore.exists(masterAddress, network);
      let agentAddress: `0x${string}` | undefined;

      if (configured) {
        const stored = await agentStore.load(masterAddress, network);
        agentAddress = stored?.agentAddress;
      }

      const response: AgentStatusResponse = {
        configured,
        agentAddress,
        network,
      };

      res.json(response);
    } catch (err) {
      if (err instanceof ValidationError) {
        res.status(400).json({
          error: err.message,
          code: "BAD_REQUEST",
        });
        return;
      }
      console.error("[agent/status]", err instanceof Error ? err.message : String(err));
      res.status(500).json({
        error: "Failed to check agent status",
        code: "AGENT_STATUS_FAILED",
      });
    }
  });

  return router;
}
