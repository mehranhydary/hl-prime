import { describe, it, expect } from "vitest";
import { normalizeBook, getBookDepth } from "../../src/market/book.js";
import type { L2Book, L2Level } from "../../src/provider/types.js";

function makeBook(bids: L2Level[], asks: L2Level[], coin = "BTC"): L2Book {
  return { coin, time: 1700000000000, levels: [bids, asks] };
}

function lvl(px: string, sz: string, n = 1): L2Level {
  return { px, sz, n };
}

describe("normalizeBook", () => {
  it("computes mid price from best bid and ask", () => {
    const book = makeBook(
      [lvl("42000", "1.0")],
      [lvl("42010", "2.0")],
    );
    const result = normalizeBook(book);
    expect(result.midPrice).toBe(42005);
  });

  it("computes spread and spreadBps", () => {
    const book = makeBook(
      [lvl("42000", "1.0")],
      [lvl("42010", "2.0")],
    );
    const result = normalizeBook(book);
    expect(result.spread).toBe(10);
    // 10 / 42005 * 10000 ≈ 2.38
    expect(result.spreadBps).toBeCloseTo(2.38, 1);
  });

  it("preserves coin and timestamp", () => {
    const book = makeBook([lvl("100", "1")], [lvl("101", "1")], "ETH");
    const result = normalizeBook(book);
    expect(result.coin).toBe("ETH");
    expect(result.timestamp).toBe(1700000000000);
  });

  it("preserves bid and ask levels", () => {
    const bids = [lvl("100", "5"), lvl("99", "10")];
    const asks = [lvl("101", "3"), lvl("102", "7")];
    const result = normalizeBook(makeBook(bids, asks));
    expect(result.bids).toHaveLength(2);
    expect(result.asks).toHaveLength(2);
    expect(result.bids[0].px).toBe("100");
    expect(result.asks[0].px).toBe("101");
  });

  it("handles empty bids — mid is best ask", () => {
    const result = normalizeBook(makeBook([], [lvl("42010", "2.0")]));
    expect(result.midPrice).toBe(42010);
    expect(result.spread).toBe(0);
    expect(result.spreadBps).toBe(0);
  });

  it("handles empty asks — mid is best bid", () => {
    const result = normalizeBook(makeBook([lvl("42000", "1.0")], []));
    expect(result.midPrice).toBe(42000);
    expect(result.spread).toBe(0);
    expect(result.spreadBps).toBe(0);
  });

  it("handles completely empty book", () => {
    const result = normalizeBook(makeBook([], []));
    expect(result.midPrice).toBe(0);
    expect(result.spread).toBe(0);
    expect(result.spreadBps).toBe(0);
  });

  it("handles wide spread", () => {
    const book = makeBook(
      [lvl("100", "1.0")],
      [lvl("200", "1.0")],
    );
    const result = normalizeBook(book);
    expect(result.midPrice).toBe(150);
    expect(result.spread).toBe(100);
    // 100 / 150 * 10000 ≈ 6666.67
    expect(result.spreadBps).toBeCloseTo(6666.67, 0);
  });
});

describe("getBookDepth", () => {
  const levels: L2Level[] = [
    lvl("100", "5.0"),
    lvl("99", "10.0"),
    lvl("98", "15.0"),
    lvl("97", "20.0"),
  ];

  it("sums all levels when no maxLevels", () => {
    const result = getBookDepth(levels);
    expect(result.totalSize).toBe(50);
    expect(result.levelCount).toBe(4);
  });

  it("limits to maxLevels", () => {
    const result = getBookDepth(levels, 2);
    expect(result.totalSize).toBe(15); // 5 + 10
    expect(result.levelCount).toBe(2);
  });

  it("handles maxLevels larger than available levels", () => {
    const result = getBookDepth(levels, 100);
    expect(result.totalSize).toBe(50);
    expect(result.levelCount).toBe(4);
  });

  it("handles empty levels", () => {
    const result = getBookDepth([]);
    expect(result.totalSize).toBe(0);
    expect(result.levelCount).toBe(0);
  });

  it("handles maxLevels of 0", () => {
    const result = getBookDepth(levels, 0);
    expect(result.totalSize).toBe(0);
    expect(result.levelCount).toBe(0);
  });

  it("handles single level", () => {
    const result = getBookDepth([lvl("100", "7.5")], 5);
    expect(result.totalSize).toBe(7.5);
    expect(result.levelCount).toBe(1);
  });
});
