export interface CollateralRequirement {
  token: string;              // e.g., "USDH"
  amountNeeded: number;       // USD-equivalent amount needed for this leg
  currentBalance: number;     // user's current spot balance of this token
  shortfall: number;          // max(0, amountNeeded - currentBalance)
  swapFrom: string;           // token to swap from (typically "USDC")
  estimatedSwapCostBps: number; // estimated cost to swap in basis points
}

export interface CollateralPlan {
  requirements: CollateralRequirement[];
  totalSwapCostBps: number;   // weighted average swap cost across all requirements
  swapsNeeded: boolean;       // true if any requirement has shortfall > 0
  abstractionEnabled: boolean; // whether DEX abstraction is already enabled
}

export interface CollateralReceipt {
  success: boolean;
  swapsExecuted: {
    from: string;
    to: string;
    amount: string;
    filled: string;
  }[];
  abstractionWasEnabled: boolean; // true if we had to enable it
  error?: string;
}
