import { getAddress, isAddress } from "viem";
import type { Network } from "../../../shared/types.js";

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export function parseNetwork(value: unknown, fallback: Network): Network {
  if (value === undefined || value === null || value === "") return fallback;
  if (value === "mainnet" || value === "testnet") return value;
  throw new ValidationError("Invalid network. Expected mainnet or testnet.");
}

export function requireAddress(value: unknown, fieldName: string): `0x${string}` {
  if (typeof value !== "string" || !isAddress(value)) {
    throw new ValidationError(`Invalid ${fieldName}. Expected 0x-prefixed address.`);
  }
  return getAddress(value);
}

export function requireString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ValidationError(`Missing ${fieldName}.`);
  }
  return value.trim();
}

export function parsePositiveNumber(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new ValidationError(`Invalid ${fieldName}. Expected a positive number.`);
  }
  return value;
}

export function parseLimit(value: unknown, fallback = 50, min = 1, max = 200): number {
  if (value === undefined || value === null || value === "") return fallback;
  const num = typeof value === "string" ? parseInt(value, 10) : typeof value === "number" ? value : NaN;
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

