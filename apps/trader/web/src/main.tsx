import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PrivyProvider, type PrivyProviderProps } from "@privy-io/react-auth";
import { App } from "./App";
import "./index.css";

// Set theme class as early as possible without inline HTML script.
try {
  const storedTheme = localStorage.getItem("prime-theme");
  if (storedTheme === "light") {
    document.documentElement.classList.remove("dark");
    document.documentElement.classList.add("light");
  } else {
    document.documentElement.classList.remove("light");
    document.documentElement.classList.add("dark");
  }
} catch {
  // Ignore storage access errors and keep default dark class.
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5_000,
      retry: 2,
    },
  },
});
const privyAppId = import.meta.env.VITE_TRADER_PRIVY_APP_ID;
const privyConfig: PrivyProviderProps["config"] = {
  loginMethods: ["wallet"],
  appearance: {
    showWalletLoginFirst: true,
    walletChainType: "ethereum-only",
  },
  embeddedWallets: {
    ethereum: {
      createOnLogin: "off",
    },
  },
};

if (!privyAppId) {
  throw new Error("Missing VITE_TRADER_PRIVY_APP_ID.");
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PrivyProvider appId={privyAppId} config={privyConfig}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </PrivyProvider>
  </StrictMode>,
);
