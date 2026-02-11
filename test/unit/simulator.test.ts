import { describe, it, expect } from "vitest";
import { FillSimulator } from "../../src/router/simulator.js";
import {
  TSLA_BOOK_DEEP,
  TSLA_BOOK_THIN,
  EMPTY_BOOK,
} from "../fixtures/books.js";

describe("FillSimulator", () => {
  const sim = new FillSimulator();

  describe("simulate", () => {
    it("estimates fill for size within top level", () => {
      const result = sim.simulate(TSLA_BOOK_DEEP, "buy", 3);
      expect(result).not.toBeNull();
      expect(result!.avgPrice).toBe(431.5);
      expect(result!.filledSize).toBe(3);
      expect(result!.totalCost).toBe(431.5 * 3);
    });

    it("walks multiple levels for larger size", () => {
      // buy 12: 5 @ 431.50 + 7 @ 432.00
      const result = sim.simulate(TSLA_BOOK_DEEP, "buy", 12);
      expect(result).not.toBeNull();
      expect(result!.avgPrice).toBeGreaterThan(431.5);
      expect(result!.avgPrice).toBeLessThan(432.0);
      expect(result!.filledSize).toBe(12);
    });

    it("fills entire book exactly", () => {
      // Total ask depth: 5 + 10 + 20 + 50 = 85
      const result = sim.simulate(TSLA_BOOK_DEEP, "buy", 85);
      expect(result).not.toBeNull();
      expect(result!.filledSize).toBe(85);
    });

    it("returns null for insufficient depth", () => {
      // TSLA_BOOK_THIN has 0.5 on each side
      const result = sim.simulate(TSLA_BOOK_THIN, "buy", 10);
      expect(result).toBeNull();
    });

    it("returns null for empty book", () => {
      const result = sim.simulate(EMPTY_BOOK, "buy", 1);
      expect(result).toBeNull();
    });

    it("handles sell side correctly (walks bids)", () => {
      const result = sim.simulate(TSLA_BOOK_DEEP, "sell", 3);
      expect(result).not.toBeNull();
      expect(result!.avgPrice).toBe(431.0); // top bid
    });

    it("calculates price impact in bps", () => {
      const result = sim.simulate(TSLA_BOOK_DEEP, "buy", 5);
      expect(result).not.toBeNull();
      // mid = (431.00 + 431.50) / 2 = 431.25
      // avg = 431.50 (all from first ask level)
      // impact = |431.50 - 431.25| / 431.25 * 10000
      const expectedImpact =
        Math.abs((431.5 - 431.25) / 431.25) * 10000;
      expect(result!.priceImpactBps).toBeCloseTo(expectedImpact, 2);
    });

    it("handles sell price impact correctly", () => {
      const result = sim.simulate(TSLA_BOOK_DEEP, "sell", 5);
      expect(result).not.toBeNull();
      // avg = 431.00 (top bid), mid = 431.25
      // impact should be positive
      expect(result!.priceImpactBps).toBeGreaterThan(0);
    });
  });

  describe("getMidPrice", () => {
    it("returns mid between best bid and ask", () => {
      const mid = sim.getMidPrice(TSLA_BOOK_DEEP);
      expect(mid).toBe((431.0 + 431.5) / 2);
    });

    it("returns 0 for empty book", () => {
      const mid = sim.getMidPrice(EMPTY_BOOK);
      expect(mid).toBe(0);
    });
  });
});
