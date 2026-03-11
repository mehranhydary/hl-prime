import type { Network } from "./types.js";

// ========== Server → Client ==========

export type WSServerMessage =
  | WSPricesMessage
  | WSClearinghouseMessage
  | WSConnectedMessage
  | WSErrorMessage;

export interface WSPricesMessage {
  type: "prices";
  mids: Record<string, string>;
}

export interface WSClearinghouseMessage {
  type: "clearinghouse";
  balance: {
    perpAccountValueUsd: number;
    perpRawUsd: number;
  };
}

export interface WSConnectedMessage {
  type: "connected";
}

export interface WSErrorMessage {
  type: "error";
  message: string;
}

// ========== Client → Server ==========

/** Not used in v1 — connection params are in the query string. */
export type WSClientMessage = never;

// ========== Connection params (query string) ==========

export interface WSConnectParams {
  address: `0x${string}`;
  network: Network;
}
