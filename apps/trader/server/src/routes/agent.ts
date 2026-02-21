import { Router } from "express";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { v4 as uuid } from "uuid";
import type { ServerConfig } from "../config.js";
import { PendingAgentStore } from "../services/agent-store.js";
import { HLClientService } from "../services/hl-client.js";
import { parseNetwork, requireAddress, requireString, ValidationError } from "../utils/validation.js";
import type {
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

  // POST /api/agent/init
  // Generate a pending agent keypair and return the address for frontend approval
  router.post("/init", async (_req, res) => {
    try {
      const agentPrivateKey = generatePrivateKey();
      const agentAccount = privateKeyToAccount(agentPrivateKey);

      const expiryMs = Date.now() + config.agentExpiryDays * 24 * 60 * 60 * 1000;
      const agentName = `hlprime valid_until ${expiryMs}`;

      const pendingId = uuid();
      pendingStore.add({
        id: pendingId,
        agentPrivateKey,
        agentAddress: agentAccount.address,
        agentName,
        createdAt: Date.now(),
      });

      const response: AgentInitResponse = {
        pendingAgentId: pendingId,
        agentAddress: agentAccount.address,
        agentName,
        builderApproval: {
          builder: config.defaultBuilderAddress,
          feeBps: config.defaultBuilderFeeBps,
          maxFeeRate: `${(config.defaultBuilderFeeBps * 0.01).toFixed(2)}%`,
        },
      };

      res.json(response);
    } catch (err) {
      res.status(500).json({
        error: "Failed to initialize agent",
        code: "AGENT_INIT_FAILED",
        details: err instanceof Error ? err.message : String(err),
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

      const pending = pendingStore.get(pendingAgentId);
      if (!pending) {
        res.status(404).json({
          error: "Pending agent not found or expired",
          code: "PENDING_NOT_FOUND",
        });
        return;
      }

      // Persist the agent key
      await agentStore.save({
        backend: config.signerBackend,
        agentPrivateKey: pending.agentPrivateKey,
        agentAddress: pending.agentAddress,
        masterAddress,
        network,
        agentName: pending.agentName,
        createdAt: Date.now(),
      });

      pendingStore.remove(pendingAgentId);

      const response: AgentCompleteResponse = {
        success: true,
        agentAddress: pending.agentAddress,
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
      res.status(500).json({
        error: "Failed to complete agent setup",
        code: "AGENT_COMPLETE_FAILED",
        details: err instanceof Error ? err.message : String(err),
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
      res.status(500).json({
        error: "Failed to check agent status",
        code: "AGENT_STATUS_FAILED",
        details: err instanceof Error ? err.message : String(err),
      });
    }
  });

  return router;
}
