import { WebSocketServer, WebSocket } from "ws";
import { WebSocketTransport, SubscriptionClient } from "@nktkas/hyperliquid";
import type { ISubscription } from "@nktkas/hyperliquid";
import type { WebSocketTransportOptions } from "@nktkas/hyperliquid";
import type { Server, IncomingMessage } from "node:http";
import type { ServerConfig } from "../config.js";
import type { Network } from "../../../shared/types.js";
import type { WSServerMessage } from "../../../shared/ws-types.js";
import { parseCookieHeader } from "../utils/cookies.js";
import { isValidAppAccessToken } from "../middleware/password-gate.js";
import { getRuntimeStateStore } from "./runtime-state.js";

const APP_ACCESS_TOKEN_COOKIE = "trader_access_token";
const HEARTBEAT_INTERVAL_MS = 30_000;
const WS_PATH = "/api/ws";
const MAX_PAYLOAD_BYTES = 256 * 1024; // 256 KB
const MAX_CONNECTIONS_PER_IP = 5;

function normalizeOrigin(origin: string): string {
  return origin.replace(/\/+$/, "");
}

interface ClientState {
  ws: WebSocket;
  address: string;
  network: Network;
  alive: boolean;
}

interface NetworkState {
  transport: WebSocketTransport;
  subClient: SubscriptionClient;
  allMidsSub: ISubscription | null;
  /** clearinghouseState subscription per user address (lowercased). */
  userSubs: Map<string, ISubscription>;
}

interface AuthorizedUpgradeRequest extends IncomingMessage {
  wsTicket?: {
    address: string;
    network: Network;
    expiresAt: number;
  };
}

type ReconnectOptions = NonNullable<WebSocketTransportOptions["reconnect"]>;
const nodeReconnect: ReconnectOptions = {
  WebSocket: WebSocket as unknown as ReconnectOptions["WebSocket"],
};

export class WebSocketHub {
  private wss: WebSocketServer;
  private clients = new Set<ClientState>();
  private networks = new Map<string, NetworkState>();
  private connectionsByIp = new Map<string, number>();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private config: ServerConfig;

  constructor(server: Server, config: ServerConfig) {
    this.config = config;
    this.wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD_BYTES });

    server.on("upgrade", (request, socket, head) => {
      const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
      if (url.pathname !== WS_PATH) {
        socket.destroy();
        return;
      }

      if (!this.validateOrigin(request)) {
        socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
        socket.destroy();
        return;
      }

      const requestedAddress = url.searchParams.get("address");
      if (!this.validateAuth(request, requestedAddress)) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }

      const ip = request.socket.remoteAddress ?? "unknown";
      const currentCount = this.connectionsByIp.get(ip) ?? 0;
      if (currentCount >= MAX_CONNECTIONS_PER_IP) {
        socket.write("HTTP/1.1 429 Too Many Requests\r\n\r\n");
        socket.destroy();
        return;
      }

      this.wss.handleUpgrade(request, socket, head, (ws) => {
        this.wss.emit("connection", ws, request);
      });
    });

    this.wss.on("connection", (ws: WebSocket, request: IncomingMessage) => {
      void this.handleConnection(ws, request);
    });

    this.heartbeatTimer = setInterval(() => this.checkHeartbeats(), HEARTBEAT_INTERVAL_MS);
  }

  private validateOrigin(request: IncomingMessage): boolean {
    if (this.config.devInsecure) return true;
    const origin = request.headers.origin;
    if (!origin) return false;
    const normalizedOrigin = normalizeOrigin(origin);
    return this.config.allowedOrigins.some((allowed) => normalizeOrigin(allowed) === normalizedOrigin);
  }

  private validateAuth(request: AuthorizedUpgradeRequest, requestedAddress: string | null = null): boolean {
    // Enforce the same password-gate check that HTTP routes use via requireAppAccess.
    const cookies = parseCookieHeader(request.headers.cookie);
    const accessToken = cookies[APP_ACCESS_TOKEN_COOKIE];
    if (!accessToken || !isValidAppAccessToken(accessToken, this.config.appPassword)) {
      return false;
    }

    if (!this.config.authEnabled) return true;

    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    const ticketToken = url.searchParams.get("ticket");
    if (!ticketToken) return false;
    const ticket = getRuntimeStateStore().takeWSTicket(ticketToken);
    if (!ticket) return false;
    if (requestedAddress && ticket.address.toLowerCase() !== requestedAddress.toLowerCase()) {
      return false;
    }
    request.wsTicket = ticket;
    return true;
  }

  private async handleConnection(ws: WebSocket, request: IncomingMessage): Promise<void> {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    const authorizedRequest = request as AuthorizedUpgradeRequest;
    const address = authorizedRequest.wsTicket?.address ?? url.searchParams.get("address");
    const network = authorizedRequest.wsTicket?.network ?? (url.searchParams.get("network") ?? this.config.defaultNetwork) as Network;

    if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
      this.sendMessage(ws, { type: "error", message: "Invalid or missing address parameter" });
      ws.close(1008, "Invalid address");
      return;
    }

    const ip = request.socket.remoteAddress ?? "unknown";
    const client: ClientState = { ws, address: address.toLowerCase(), network, alive: true };
    this.clients.add(client);
    this.connectionsByIp.set(ip, (this.connectionsByIp.get(ip) ?? 0) + 1);

    // Server-only broadcast model: reject any incoming client messages.
    ws.on("message", () => {
      ws.close(1008, "Client messages not accepted");
    });
    ws.on("pong", () => { client.alive = true; });
    ws.on("close", () => {
      this.clients.delete(client);
      const remaining = (this.connectionsByIp.get(ip) ?? 1) - 1;
      if (remaining <= 0) this.connectionsByIp.delete(ip);
      else this.connectionsByIp.set(ip, remaining);
      void this.cleanupNetwork(network, client.address);
    });
    ws.on("error", (err) => {
      console.warn("[ws-hub] Client WebSocket error:", err.message);
    });

    try {
      await this.ensureSubscriptions(network, client.address);
      this.sendMessage(ws, { type: "connected" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[ws-hub] Failed to start HL subscriptions:", msg);
      this.sendMessage(ws, { type: "error", message: "Failed to connect to Hyperliquid WebSocket" });
      ws.close(1011, "Subscription failed");
    }
  }

  private async ensureSubscriptions(network: Network, userAddress: string): Promise<void> {
    let state = this.networks.get(network);

    if (!state) {
      const transport = new WebSocketTransport({
        isTestnet: network === "testnet",
        reconnect: nodeReconnect,
      });
      const subClient = new SubscriptionClient({ transport });
      state = { transport, subClient, allMidsSub: null, userSubs: new Map() };
      this.networks.set(network, state);
      console.log(`[ws-hub] Created HL WebSocket transport for ${network}`);
    }

    // Subscribe to allMids (shared across all clients on this network)
    if (!state.allMidsSub) {
      state.allMidsSub = await state.subClient.allMids((data) => {
        this.broadcastToNetwork(network, { type: "prices", mids: data.mids });
      });
      console.log(`[ws-hub] Subscribed to allMids on ${network}`);
    }

    // Subscribe to clearinghouseState for this user (if not already)
    if (!state.userSubs.has(userAddress)) {
      const sub = await state.subClient.clearinghouseState(
        { user: userAddress as `0x${string}` },
        (data) => {
          const ms = data.clearinghouseState.marginSummary;
          this.broadcastToUser(network, userAddress, {
            type: "clearinghouse",
            balance: {
              perpAccountValueUsd: parseFloat(ms.accountValue),
              perpRawUsd: parseFloat(ms.totalRawUsd),
            },
          });
        },
      );
      state.userSubs.set(userAddress, sub);
      console.log(`[ws-hub] Subscribed to clearinghouseState for ${userAddress.slice(0, 10)}... on ${network}`);
    }
  }

  private async cleanupNetwork(network: Network, userAddress: string): Promise<void> {
    const state = this.networks.get(network);
    if (!state) return;

    // Check if any other client still needs this user's subscription
    const hasOtherClient = [...this.clients].some(
      (c) => c.network === network && c.address === userAddress,
    );

    if (!hasOtherClient) {
      const sub = state.userSubs.get(userAddress);
      if (sub) {
        try {
          await sub.unsubscribe();
        } catch (err) {
          console.warn("[ws-hub] Failed to unsubscribe clearinghouseState:", err);
        }
        state.userSubs.delete(userAddress);
        console.log(`[ws-hub] Unsubscribed clearinghouseState for ${userAddress.slice(0, 10)}... on ${network}`);
      }
    }

    // If no clients left on this network, tear down the entire connection
    const hasAnyClient = [...this.clients].some((c) => c.network === network);
    if (!hasAnyClient) {
      if (state.allMidsSub) {
        try { await state.allMidsSub.unsubscribe(); } catch {}
        state.allMidsSub = null;
      }
      try { await state.transport.close(); } catch {}
      this.networks.delete(network);
      console.log(`[ws-hub] Closed HL WebSocket transport for ${network}`);
    }
  }

  private broadcastToNetwork(network: Network, msg: WSServerMessage): void {
    const json = JSON.stringify(msg);
    for (const client of this.clients) {
      if (client.network === network && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(json);
      }
    }
  }

  private broadcastToUser(network: Network, userAddress: string, msg: WSServerMessage): void {
    const json = JSON.stringify(msg);
    for (const client of this.clients) {
      if (
        client.network === network &&
        client.address === userAddress &&
        client.ws.readyState === WebSocket.OPEN
      ) {
        client.ws.send(json);
      }
    }
  }

  private sendMessage(ws: WebSocket, msg: WSServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  private checkHeartbeats(): void {
    getRuntimeStateStore().cleanupWSTickets();
    for (const client of this.clients) {
      if (!client.alive) {
        client.ws.terminate();
        this.clients.delete(client);
        void this.cleanupNetwork(client.network, client.address);
        continue;
      }
      client.alive = false;
      client.ws.ping();
    }
  }

  async shutdown(): Promise<void> {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    // Close all frontend connections
    for (const client of this.clients) {
      client.ws.close(1001, "Server shutting down");
    }
    this.clients.clear();

    // Tear down all HL subscriptions and transports
    for (const [network, state] of this.networks) {
      if (state.allMidsSub) {
        try { await state.allMidsSub.unsubscribe(); } catch {}
      }
      for (const sub of state.userSubs.values()) {
        try { await sub.unsubscribe(); } catch {}
      }
      try { await state.transport.close(); } catch {}
      console.log(`[ws-hub] Shutdown: closed ${network} transport`);
    }
    this.networks.clear();

    this.wss.close();
  }
}
