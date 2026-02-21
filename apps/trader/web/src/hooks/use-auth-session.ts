import { useEffect, useState } from "react";
import { getAuthSnapshot, subscribeAuth, signIn, signOut, type AuthSnapshot } from "../lib/auth.js";

interface AuthSessionState extends AuthSnapshot {
  signIn: () => Promise<boolean>;
  signOut: () => void;
}

export function useAuthSession(): AuthSessionState {
  const [state, setState] = useState<AuthSnapshot>(() => getAuthSnapshot());

  useEffect(() => subscribeAuth(setState), []);

  return {
    ...state,
    signIn,
    signOut,
  };
}

