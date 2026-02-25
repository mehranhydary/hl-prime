import { useEffect, useState } from "react";
import {
  getAccessSnapshot,
  lock,
  subscribeAccess,
  unlock,
  type AccessSnapshot,
  type UnlockResult,
} from "../lib/access-gate.js";

interface AccessGateState extends AccessSnapshot {
  unlock: (password: string) => Promise<UnlockResult>;
  lock: () => void;
}

export function useAccessGate(): AccessGateState {
  const [state, setState] = useState<AccessSnapshot>(() => getAccessSnapshot());

  useEffect(() => subscribeAccess(setState), []);

  return {
    ...state,
    unlock,
    lock,
  };
}
