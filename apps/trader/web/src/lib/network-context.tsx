import { createContext, useContext, useState, type ReactNode } from "react";
import type { Network } from "@shared/types";

interface NetworkCtx {
  network: Network;
  setNetwork: (n: Network) => void;
}

const NetworkContext = createContext<NetworkCtx>({
  network: "mainnet",
  setNetwork: () => {},
});

export function NetworkProvider({ children }: { children: ReactNode }) {
  const [network, setNetwork] = useState<Network>("mainnet");
  return (
    <NetworkContext.Provider value={{ network, setNetwork }}>
      {children}
    </NetworkContext.Provider>
  );
}

export function useNetwork() {
  return useContext(NetworkContext);
}
