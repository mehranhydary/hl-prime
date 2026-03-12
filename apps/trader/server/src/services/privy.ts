import {
  PrivyClient,
  verifyAccessToken,
  type AuthorizationContext,
  type LinkedAccount,
  type User as PrivyUser,
  type Wallet as PrivyWallet,
} from "@privy-io/node";
import { createViemAccount } from "@privy-io/node/viem";
import type { LocalAccount } from "viem/accounts";
import type { ServerConfig } from "../config.js";

let privyClient: PrivyClient | null = null;

function requirePrivyConfig(config: Pick<ServerConfig, "privy">): {
  appId: string;
  appSecret: string;
  authorizationKey: string | null;
  jwtVerificationKey: string | null;
} {
  const appId = config.privy.appId;
  const appSecret = config.privy.appSecret;
  if (!appId || !appSecret) {
    throw new Error("Privy client requires TRADER_PRIVY_APP_ID and TRADER_PRIVY_APP_SECRET.");
  }
  return {
    appId,
    appSecret,
    authorizationKey: config.privy.authorizationKey,
    jwtVerificationKey: config.privy.jwtVerificationKey,
  };
}

export function getPrivyClient(config: Pick<ServerConfig, "privy">): PrivyClient {
  if (privyClient) return privyClient;
  const privy = requirePrivyConfig(config);
  privyClient = new PrivyClient({
    appId: privy.appId,
    appSecret: privy.appSecret,
    jwtVerificationKey: privy.jwtVerificationKey ?? undefined,
  });
  return privyClient;
}

export function getPrivyAuthorizationContext(
  config: Pick<ServerConfig, "privy">,
): AuthorizationContext | undefined {
  const authorizationKey = config.privy.authorizationKey;
  if (!authorizationKey) return undefined;
  return {
    authorization_private_keys: [authorizationKey],
  };
}

export async function verifyPrivyAccessToken(
  config: Pick<ServerConfig, "privy">,
  accessToken: string,
): Promise<{ userId: string; sessionId: string }> {
  if (!config.privy.appId || !config.privy.jwtVerificationKey) {
    throw new Error("Privy auth verification requires TRADER_PRIVY_APP_ID and TRADER_PRIVY_JWT_VERIFICATION_KEY.");
  }
  const payload = await verifyAccessToken({
    access_token: accessToken,
    app_id: config.privy.appId,
    verification_key: config.privy.jwtVerificationKey,
  });
  return {
    userId: payload.user_id,
    sessionId: payload.session_id,
  };
}

export async function getPrivyUser(
  config: Pick<ServerConfig, "privy">,
  userId: string,
): Promise<PrivyUser> {
  const client = getPrivyClient(config);
  return client.users()._get(userId);
}

function isEmbeddedEthereumWalletAccount(account: LinkedAccount): boolean {
  return account.type === "wallet"
    && "chain_type" in account
    && account.chain_type === "ethereum"
    && "wallet_client_type" in account
    && account.wallet_client_type === "privy"
    && "connector_type" in account
    && account.connector_type === "embedded";
}

function isExternalEthereumWalletAccount(
  account: LinkedAccount,
): account is Extract<LinkedAccount, { type: "wallet"; address: string; chain_type: "ethereum" }> {
  return account.type === "wallet"
    && "address" in account
    && typeof account.address === "string"
    && "chain_type" in account
    && account.chain_type === "ethereum"
    && !isEmbeddedEthereumWalletAccount(account);
}

export function extractLinkedExternalWalletAddresses(user: PrivyUser): `0x${string}`[] {
  const addresses = new Set<`0x${string}`>();
  for (const account of user.linked_accounts) {
    if (!isExternalEthereumWalletAccount(account)) continue;
    addresses.add(account.address.toLowerCase() as `0x${string}`);
  }
  return [...addresses];
}

export async function createPrivyEthereumWallet(
  config: Pick<ServerConfig, "privy">,
): Promise<PrivyWallet> {
  const client = getPrivyClient(config);
  return client.wallets().create({
    chain_type: "ethereum",
  });
}

export function createPrivyViemAccount(
  config: Pick<ServerConfig, "privy">,
  params: { walletId: string; address: `0x${string}` },
): LocalAccount {
  return createViemAccount(getPrivyClient(config), {
    walletId: params.walletId,
    address: params.address,
    authorizationContext: getPrivyAuthorizationContext(config),
  });
}
