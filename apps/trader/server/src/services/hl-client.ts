import { HyperliquidPrime } from "hyperliquid-prime";
import type { Network } from "../../../shared/types.js";
import type { ServerConfig } from "../config.js";
import type { AgentStore } from "./agent-store.js";
import type { StoredSignerRecord, SignerStore } from "./signer-store.js";
import { createSignerStore } from "./signer-store.js";

interface ClientKey {
  masterAddress: string;
  network: Network;
}

function clientId(key: ClientKey): string {
  return `${key.masterAddress.toLowerCase()}_${key.network}`;
}

interface ManagedClient {
  hp: HyperliquidPrime;
  masterAddress: string;
  network: Network;
  connectedAt: number;
}

function normalizeAddress(value: string): `0x${string}` {
  return value.toLowerCase() as `0x${string}`;
}

/** How often to re-discover markets so prices, funding, and volume stay fresh. */
const MARKET_REFRESH_MS = 30_000;

export class HLClientService {
  private clients = new Map<string, ManagedClient>();
  private connecting = new Map<string, Promise<ManagedClient>>();
  private publicClients = new Map<string, HyperliquidPrime>();
  private publicConnecting = new Map<string, Promise<HyperliquidPrime>>();
  private refreshTimers = new Map<string, ReturnType<typeof setInterval>>();
  private signerStore: SignerStore;
  private localSignerStore: AgentStore | null;
  private localSignerStoreAvailable: boolean;
  private config: ServerConfig;

  constructor(config: ServerConfig) {
    this.config = config;
    const { signerStore, localStore } = createSignerStore(config);
    this.signerStore = signerStore;
    this.localSignerStore = localStore;
    this.localSignerStoreAvailable = Boolean(localStore);
  }

  getAgentStore(): SignerStore {
    return this.signerStore;
  }

  /** Read-only client for public market data (no agent key needed). */
  async getPublicClient(network: Network): Promise<HyperliquidPrime> {
    const existing = this.publicClients.get(network);
    if (existing) return existing;

    const inflight = this.publicConnecting.get(network);
    if (inflight) return inflight;

    const promise = (async () => {
      const hp = new HyperliquidPrime({
        testnet: network === "testnet",
        logLevel: "warn",
      });
      await hp.connect();
      return hp;
    })();
    this.publicConnecting.set(network, promise);

    try {
      const hp = await promise;
      this.publicClients.set(network, hp);
      this.startMarketRefresh(network, hp);
      return hp;
    } finally {
      this.publicConnecting.delete(network);
    }
  }

  /**
   * Periodically re-discover markets so that markPrice, prevDayPx, funding,
   * and volume stay fresh instead of being frozen at server-start values.
   */
  private startMarketRefresh(network: string, hp: HyperliquidPrime): void {
    if (this.refreshTimers.has(network)) return;
    const timer = setInterval(async () => {
      try {
        await hp.markets.discover();
      } catch (err) {
        console.warn(`[hl-client] market refresh failed (${network}):`, err);
      }
    }, MARKET_REFRESH_MS);
    this.refreshTimers.set(network, timer);
  }

  /** Authenticated client for trading (requires agent key). */
  async getClient(masterAddress: string, network: Network): Promise<HyperliquidPrime> {
    const key = clientId({ masterAddress, network });

    const existing = this.clients.get(key);
    if (existing) return existing.hp;

    const inflight = this.connecting.get(key);
    if (inflight) return (await inflight).hp;

    const promise = this.createClient(masterAddress, network);
    this.connecting.set(key, promise);

    try {
      const managed = await promise;
      this.clients.set(key, managed);
      return managed.hp;
    } finally {
      this.connecting.delete(key);
    }
  }

  /** Remove a cached authenticated client so the next getClient() creates a fresh one. */
  async evictClient(masterAddress: string, network: Network): Promise<void> {
    const key = clientId({ masterAddress, network });
    const existing = this.clients.get(key);
    if (existing) {
      await existing.hp.disconnect().catch(() => {});
      this.clients.delete(key);
    }
  }

  async hasClient(masterAddress: string, network: Network): Promise<boolean> {
    const key = clientId({ masterAddress, network });
    if (this.clients.has(key)) return true;
    return this.signerStore.exists(masterAddress, network);
  }

  async disconnectAll(): Promise<void> {
    for (const timer of this.refreshTimers.values()) {
      clearInterval(timer);
    }
    this.refreshTimers.clear();
    for (const [, managed] of this.clients) {
      await managed.hp.disconnect().catch(() => {});
    }
    this.clients.clear();
    for (const [, hp] of this.publicClients) {
      await hp.disconnect().catch(() => {});
    }
    this.publicClients.clear();
  }

  private async createClient(masterAddress: string, network: Network): Promise<ManagedClient> {
    const stored = await this.signerStore.load(masterAddress, network);
    if (!stored) {
      throw new Error(`No agent configured for ${masterAddress} on ${network}`);
    }

    const executable = await this.resolveExecutableSigner(masterAddress, network, stored);

    const hp = new HyperliquidPrime({
      privateKey: executable.agentPrivateKey,
      walletAddress: executable.masterAddress,
      testnet: network === "testnet",
      logLevel: "warn",
    });

    await hp.connect();
    await this.assertAgentIsApproved(hp, executable.masterAddress, executable.agentAddress);

    return {
      hp,
      masterAddress,
      network,
      connectedAt: Date.now(),
    };
  }

  private async resolveExecutableSigner(
    masterAddress: string,
    network: Network,
    stored: StoredSignerRecord,
  ): Promise<StoredSignerRecord & { agentPrivateKey: `0x${string}` }> {
    if (stored.agentPrivateKey) {
      return stored as StoredSignerRecord & { agentPrivateKey: `0x${string}` };
    }

    if (this.config.signerBackend === "privy" && this.config.signerLocalFallback && this.localSignerStore) {
      const local = await this.localSignerStore.load(masterAddress, network);
      if (local?.agentPrivateKey) {
        return {
          ...stored,
          ...local,
          backend: "local",
        } as StoredSignerRecord & { agentPrivateKey: `0x${string}` };
      }
      throw new Error(
        "Privy signer metadata exists, but no local fallback key is available. " +
        "Re-run setup to provision fallback signer material or disable fallback mode.",
      );
    }

    throw new Error(
      "Privy signer backend is configured without executable local fallback. " +
      "Set TRADER_SIGNER_LOCAL_FALLBACK=true during migration or complete direct Privy signing integration.",
    );
  }

  signerSummary(): {
    backend: "local" | "privy";
    localFallback: boolean;
    localSignerStoreAvailable: boolean;
  } {
    return {
      backend: this.config.signerBackend,
      localFallback: this.config.signerLocalFallback,
      localSignerStoreAvailable: this.localSignerStoreAvailable,
    };
  }

  private async assertAgentIsApproved(
    hp: HyperliquidPrime,
    masterAddress: `0x${string}`,
    agentAddress: `0x${string}`,
  ): Promise<void> {
    let agents: { address: `0x${string}`; name: string; validUntil: number }[];
    try {
      agents = await hp.listAgents();
    } catch (error) {
      throw new Error(
        `Could not verify agent approval for ${masterAddress}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    const wanted = normalizeAddress(agentAddress);
    const found = agents.some((agent) => normalizeAddress(agent.address) === wanted);
    if (!found) {
      throw new Error(
        `Agent ${agentAddress} is not approved on-chain for ${masterAddress}. Re-run setup to approve the agent wallet.`,
      );
    }
  }
}
