import type { L2Book } from "../../src/provider/types.js";

export const ETH_BOOK_DEEP: L2Book = {
  coin: "ETH",
  time: 1707580800000,
  levels: [
    // bids
    [
      { px: "3200.00", sz: "5.0", n: 3 },
      { px: "3199.50", sz: "10.0", n: 5 },
      { px: "3199.00", sz: "20.0", n: 8 },
      { px: "3198.00", sz: "50.0", n: 12 },
    ],
    // asks
    [
      { px: "3200.50", sz: "5.0", n: 3 },
      { px: "3201.00", sz: "10.0", n: 5 },
      { px: "3201.50", sz: "20.0", n: 8 },
      { px: "3202.00", sz: "50.0", n: 12 },
    ],
  ],
};

export const ETH_BOOK_THIN: L2Book = {
  coin: "ETH",
  time: 1707580800000,
  levels: [
    [{ px: "3200.00", sz: "0.5", n: 1 }],
    [{ px: "3201.00", sz: "0.5", n: 1 }],
  ],
};

export const ETH_HIP3_BOOK: L2Book = {
  coin: "xyz:ETH100",
  time: 1707580800000,
  levels: [
    [
      { px: "3199.80", sz: "3.0", n: 2 },
      { px: "3199.00", sz: "8.0", n: 4 },
    ],
    [
      { px: "3200.70", sz: "3.0", n: 2 },
      { px: "3201.50", sz: "8.0", n: 4 },
    ],
  ],
};

export const BTC_BOOK_DEEP: L2Book = {
  coin: "BTC",
  time: 1707580800000,
  levels: [
    [
      { px: "42000.00", sz: "1.0", n: 5 },
      { px: "41999.00", sz: "2.0", n: 8 },
      { px: "41998.00", sz: "5.0", n: 12 },
    ],
    [
      { px: "42001.00", sz: "1.0", n: 5 },
      { px: "42002.00", sz: "2.0", n: 8 },
      { px: "42003.00", sz: "5.0", n: 12 },
    ],
  ],
};

export const EMPTY_BOOK: L2Book = {
  coin: "EMPTY",
  time: 1707580800000,
  levels: [[], []],
};
