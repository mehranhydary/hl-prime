/**
 * Browser-side referral operations via injected wallet (MetaMask).
 * These require master wallet signing — not the agent key.
 */
import type { Network } from "@shared/types";
import { createExchangeClientFromInjected, getErrorChainMessage } from "./wallet-client";

function normalizeReferralCode(code: string): string {
  return code.trim().toUpperCase();
}

function mapRegisterReferrerError(error: unknown): string {
  const message = getErrorChainMessage(error);

  if (/already registered by another user|already.*(exists|taken)|duplicate/i.test(message)) {
    return "This referral code is already taken. Choose a different code.";
  }

  if (/referr/i.test(message) && /already|cannot|can't|locked|immutable|set once/i.test(message)) {
    return "You already have a referral code and cannot create another one.";
  }

  return message;
}

function mapSetReferrerError(error: unknown): string {
  const message = getErrorChainMessage(error);

  if (/does not exist|not exist|unknown|not found|invalid.*referr/i.test(message)) {
    return "Referral code cannot be set because it does not exist.";
  }

  if (/referr/i.test(message) && /already|cannot|can't|locked|immutable|set once/i.test(message)) {
    return "Referral code is already set and cannot be changed.";
  }

  return message;
}

/** Create a referral code (1-20 chars). Triggers MetaMask signing. */
export async function createReferralCode(
  code: string,
  address: `0x${string}`,
  network: Network,
): Promise<void> {
  const normalizedCode = normalizeReferralCode(code);
  if (!normalizedCode) {
    throw new Error("Enter a referral code.");
  }

  const exchange = await createExchangeClientFromInjected(address, network);
  try {
    await exchange.registerReferrer({ code: normalizedCode });
  } catch (error) {
    throw new Error(mapRegisterReferrerError(error));
  }
}

/** Enter someone else's referral code. Triggers MetaMask signing. */
export async function enterReferralCode(
  code: string,
  address: `0x${string}`,
  network: Network,
): Promise<void> {
  const normalizedCode = normalizeReferralCode(code);
  if (!normalizedCode) {
    throw new Error("Enter a referral code.");
  }

  const exchange = await createExchangeClientFromInjected(address, network);
  try {
    await exchange.setReferrer({ code: normalizedCode });
  } catch (error) {
    throw new Error(mapSetReferrerError(error));
  }
}

/** Claim earned referral rewards. Triggers MetaMask signing. */
export async function claimReferralRewards(
  address: `0x${string}`,
  network: Network,
): Promise<void> {
  const exchange = await createExchangeClientFromInjected(address, network);
  await exchange.claimRewards();
}
