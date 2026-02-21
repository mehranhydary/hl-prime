import { describe, it, expect } from "vitest";
import {
  groupBy,
  weightedAverage,
  sumField,
  maxField,
} from "../../apps/trader/server/src/utils/aggregation.js";

describe("aggregation utilities", () => {
  describe("groupBy", () => {
    it("groups items by key function", () => {
      const items = [
        { name: "a", type: "x" },
        { name: "b", type: "y" },
        { name: "c", type: "x" },
      ];
      const groups = groupBy(items, (i) => i.type);

      expect(groups.size).toBe(2);
      expect(groups.get("x")).toHaveLength(2);
      expect(groups.get("y")).toHaveLength(1);
    });

    it("returns empty map for empty input", () => {
      const groups = groupBy([], () => "key");
      expect(groups.size).toBe(0);
    });

    it("preserves item references", () => {
      const items = [{ id: 1 }, { id: 2 }];
      const groups = groupBy(items, () => "all");
      expect(groups.get("all")![0]).toBe(items[0]);
    });

    it("handles single-item groups", () => {
      const items = [
        { id: 1, k: "a" },
        { id: 2, k: "b" },
        { id: 3, k: "c" },
      ];
      const groups = groupBy(items, (i) => i.k);
      expect(groups.size).toBe(3);
      for (const [, bucket] of groups) {
        expect(bucket).toHaveLength(1);
      }
    });
  });

  describe("weightedAverage", () => {
    it("computes size-weighted average", () => {
      const items = [
        { price: 100, size: 10 },
        { price: 200, size: 30 },
      ];
      const avg = weightedAverage(
        items,
        (i) => i.price,
        (i) => i.size,
      );
      // (100*10 + 200*30) / (10+30) = 7000/40 = 175
      expect(avg).toBe(175);
    });

    it("returns fallback when total weight is zero", () => {
      const items = [
        { price: 100, size: 0 },
        { price: 200, size: 0 },
      ];
      const avg = weightedAverage(
        items,
        (i) => i.price,
        (i) => i.size,
        42,
      );
      expect(avg).toBe(42);
    });

    it("returns default fallback (0) when weight is zero and no fallback given", () => {
      const avg = weightedAverage(
        [{ v: 10, w: 0 }],
        (i) => i.v,
        (i) => i.w,
      );
      expect(avg).toBe(0);
    });

    it("handles single item", () => {
      const avg = weightedAverage(
        [{ price: 431.50, size: 5 }],
        (i) => i.price,
        (i) => i.size,
      );
      expect(avg).toBe(431.50);
    });

    it("handles empty array", () => {
      const avg = weightedAverage(
        [] as { v: number; w: number }[],
        (i) => i.v,
        (i) => i.w,
        99,
      );
      expect(avg).toBe(99);
    });
  });

  describe("sumField", () => {
    it("sums numeric field", () => {
      const items = [{ amount: 10 }, { amount: 20 }, { amount: 30 }];
      expect(sumField(items, (i) => i.amount)).toBe(60);
    });

    it("returns 0 for empty array", () => {
      expect(sumField([], () => 1)).toBe(0);
    });

    it("handles negative values", () => {
      const items = [{ pnl: 100 }, { pnl: -50 }, { pnl: -25 }];
      expect(sumField(items, (i) => i.pnl)).toBe(25);
    });
  });

  describe("maxField", () => {
    it("returns maximum value", () => {
      const items = [{ ts: 100 }, { ts: 300 }, { ts: 200 }];
      expect(maxField(items, (i) => i.ts)).toBe(300);
    });

    it("returns -Infinity for empty array", () => {
      expect(maxField([], () => 0)).toBe(-Infinity);
    });

    it("handles negative values", () => {
      const items = [{ v: -10 }, { v: -5 }, { v: -20 }];
      expect(maxField(items, (i) => i.v)).toBe(-5);
    });

    it("handles single item", () => {
      expect(maxField([{ v: 42 }], (i) => i.v)).toBe(42);
    });
  });
});
