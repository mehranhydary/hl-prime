import { describe, it, expect } from "vitest";
import {
  displayCoin,
  collateralIconUrl,
  getDeployer,
  getBaseToken,
  tokenIconUrl,
  tokenIconFallbackUrl,
  deployerIconUrl,
} from "../../apps/trader/web/src/lib/display.js";

describe("display utilities", () => {
  describe("displayCoin", () => {
    it("maps USDT0 to USDT", () => {
      expect(displayCoin("USDT0")).toBe("USDT");
    });

    it("passes through unknown coins unchanged", () => {
      expect(displayCoin("USDC")).toBe("USDC");
      expect(displayCoin("ETH")).toBe("ETH");
      expect(displayCoin("TSLA")).toBe("TSLA");
    });
  });

  describe("collateralIconUrl", () => {
    it("returns lowercase path for standard coin", () => {
      expect(collateralIconUrl("USDC")).toBe("/collateral/usdc.png");
    });

    it("uses display name mapping for USDT0", () => {
      expect(collateralIconUrl("USDT0")).toBe("/collateral/usdt.png");
    });

    it("handles mixed case", () => {
      expect(collateralIconUrl("USDH")).toBe("/collateral/usdh.png");
    });
  });

  describe("getDeployer", () => {
    it("extracts deployer prefix from HIP-3 coin", () => {
      expect(getDeployer("cash:BTC")).toBe("cash");
      expect(getDeployer("xyz:TSLA")).toBe("xyz");
      expect(getDeployer("flx:ETH")).toBe("flx");
    });

    it("returns null for native coins", () => {
      expect(getDeployer("ETH")).toBeNull();
      expect(getDeployer("BTC")).toBeNull();
    });

    it("handles coin with no prefix", () => {
      expect(getDeployer("HYPE")).toBeNull();
    });
  });

  describe("getBaseToken", () => {
    it("extracts base token from HIP-3 coin", () => {
      expect(getBaseToken("cash:BTC")).toBe("BTC");
      expect(getBaseToken("xyz:TSLA")).toBe("TSLA");
    });

    it("returns coin as-is for native coins", () => {
      expect(getBaseToken("ETH")).toBe("ETH");
      expect(getBaseToken("BTC")).toBe("BTC");
    });
  });

  describe("tokenIconUrl", () => {
    it("returns Hyperliquid CDN URL with full coin name", () => {
      expect(tokenIconUrl("ETH")).toBe(
        "https://app.hyperliquid.xyz/coins/ETH.svg",
      );
      expect(tokenIconUrl("xyz:TSLA")).toBe(
        "https://app.hyperliquid.xyz/coins/xyz:TSLA.svg",
      );
    });
  });

  describe("tokenIconFallbackUrl", () => {
    it("returns fallback URL for HIP-3 coins", () => {
      expect(tokenIconFallbackUrl("xyz:TSLA")).toBe(
        "https://app.hyperliquid.xyz/coins/TSLA.svg",
      );
    });

    it("returns null for native coins (no useful fallback)", () => {
      expect(tokenIconFallbackUrl("ETH")).toBeNull();
      expect(tokenIconFallbackUrl("BTC")).toBeNull();
    });
  });

  describe("deployerIconUrl", () => {
    it("returns local icon URL for known deployers", () => {
      expect(deployerIconUrl("cash:BTC")).toBe("/perp-dexes/cash.png");
      expect(deployerIconUrl("xyz:TSLA")).toBe("/perp-dexes/xyz.png");
      expect(deployerIconUrl("flx:ETH")).toBe("/perp-dexes/flx.png");
    });

    it("returns null for unknown deployers", () => {
      expect(deployerIconUrl("unknown:BTC")).toBeNull();
    });

    it("returns null for native coins", () => {
      expect(deployerIconUrl("ETH")).toBeNull();
      expect(deployerIconUrl("BTC")).toBeNull();
    });
  });
});
