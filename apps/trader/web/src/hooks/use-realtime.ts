import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { BootstrapResponse } from "@shared/types";
import type { WSServerMessage, WSTicketResponse } from "@shared/ws-types";
import { getAuthHeaders } from "../lib/auth";

const THROTTLE_MS = 500;
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 15_000;

export function useRealtimeUpdates(
  address: `0x${string}` | null,
  network: string,
  enabled = true,
) {
  const queryClient = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttempt = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingMids = useRef<Record<string, string> | null>(null);
  const throttleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!address || !enabled) return;

    let disposed = false;

    function flushPrices() {
      const mids = pendingMids.current;
      if (!mids) return;
      pendingMids.current = null;

      queryClient.setQueryData<BootstrapResponse>(
        ["bootstrap", address, network],
        (old) => {
          if (!old) return old;
          return {
            ...old,
            assets: old.assets.map((asset) => {
              const mid = mids[asset.primaryCoin];
              if (mid === undefined) return asset;
              return { ...asset, price: parseFloat(mid) };
            }),
          };
        },
      );
    }

    function handleMessage(event: MessageEvent) {
      let msg: WSServerMessage;
      try {
        msg = JSON.parse(event.data as string);
      } catch {
        return;
      }

      if (msg.type === "prices") {
        // Throttle price updates to avoid render thrashing
        pendingMids.current = msg.mids;
        if (!throttleTimer.current) {
          throttleTimer.current = setTimeout(() => {
            throttleTimer.current = null;
            flushPrices();
          }, THROTTLE_MS);
        }
      }

      if (msg.type === "clearinghouse") {
        queryClient.setQueryData<BootstrapResponse>(
          ["bootstrap", address, network],
          (old) => {
            if (!old?.balance) return old;
            const spotStableUsd = old.balance.spotStableUsd;
            const newPerpValue = msg.balance.perpAccountValueUsd;
            return {
              ...old,
              balance: {
                ...old.balance,
                perpAccountValueUsd: newPerpValue,
                perpRawUsd: msg.balance.perpRawUsd,
                totalUsd: newPerpValue + spotStableUsd,
              },
            };
          },
        );
      }

      if (msg.type === "connected") {
        reconnectAttempt.current = 0;
      }
    }

    function connect() {
      if (disposed) return;

      void (async () => {
        try {
          const authHeaders = await getAuthHeaders();
          const ticketRes = await fetch("/api/auth/ws-ticket", {
            method: "POST",
            credentials: "same-origin",
            headers: {
              "Content-Type": "application/json",
              ...authHeaders,
            },
            body: JSON.stringify({ masterAddress: address, network }),
          });
          if (!ticketRes.ok) {
            throw new Error(`WS ticket request failed: ${ticketRes.status}`);
          }

          const ticket = await ticketRes.json() as WSTicketResponse;
          const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
          const url = `${protocol}//${window.location.host}/api/ws?address=${address}&network=${network}&ticket=${ticket.token}`;
          const ws = new WebSocket(url);
          wsRef.current = ws;

          ws.onmessage = handleMessage;

          ws.onopen = () => {
            reconnectAttempt.current = 0;
          };

          ws.onclose = (event) => {
            wsRef.current = null;
            if (disposed) return;

            // Don't reconnect on intentional close (1000) or auth failure (1008)
            if (event.code === 1000 || event.code === 1008) return;

            const delay = Math.min(
              RECONNECT_BASE_MS * Math.pow(2, reconnectAttempt.current),
              RECONNECT_MAX_MS,
            );
            reconnectAttempt.current++;
            reconnectTimer.current = setTimeout(connect, delay);
          };

          ws.onerror = () => {
            // onclose will fire after onerror, which handles reconnection
          };
        } catch {
          if (disposed) return;
          const delay = Math.min(
            RECONNECT_BASE_MS * Math.pow(2, reconnectAttempt.current),
            RECONNECT_MAX_MS,
          );
          reconnectAttempt.current++;
          reconnectTimer.current = setTimeout(connect, delay);
        }
      })();
    }

    connect();

    return () => {
      disposed = true;
      if (throttleTimer.current) clearTimeout(throttleTimer.current);
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);

      // Flush any pending price update before unmount
      flushPrices();

      const ws = wsRef.current;
      if (ws) {
        ws.onmessage = null;
        ws.onclose = null;
        ws.onerror = null;
        ws.close(1000, "Component unmounted");
        wsRef.current = null;
      }
    };
  }, [address, network, enabled, queryClient]);
}
