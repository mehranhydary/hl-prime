import type { L2Book } from "../../src/provider/types.js";

// xyz:TSLA — deepest TSLA book (~$431 range)
export const TSLA_BOOK_DEEP: L2Book = {
  coin: "xyz:TSLA",
  time: 1707580800000,
  levels: [
    // bids
    [
      { px: "431.00", sz: "5.0", n: 3 },
      { px: "430.50", sz: "10.0", n: 5 },
      { px: "430.00", sz: "20.0", n: 8 },
      { px: "429.00", sz: "50.0", n: 12 },
    ],
    // asks
    [
      { px: "431.50", sz: "5.0", n: 3 },
      { px: "432.00", sz: "10.0", n: 5 },
      { px: "432.50", sz: "20.0", n: 8 },
      { px: "433.00", sz: "50.0", n: 12 },
    ],
  ],
};

// km:TSLA — thin book
export const TSLA_BOOK_THIN: L2Book = {
  coin: "km:TSLA",
  time: 1707580800000,
  levels: [
    [{ px: "431.00", sz: "0.5", n: 1 }],
    [{ px: "432.00", sz: "0.5", n: 1 }],
  ],
};

// flx:TSLA — secondary HIP-3 book
export const TSLA_HIP3_BOOK: L2Book = {
  coin: "flx:TSLA",
  time: 1707580800000,
  levels: [
    [
      { px: "430.80", sz: "3.0", n: 2 },
      { px: "430.00", sz: "8.0", n: 4 },
    ],
    [
      { px: "431.70", sz: "3.0", n: 2 },
      { px: "432.50", sz: "8.0", n: 4 },
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
