import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { AgentApprovalModal } from "../components/AgentApprovalModal";

interface AgentApprovalContextValue {
  showApprovalModal: () => void;
  hideApprovalModal: () => void;
}

const AgentApprovalContext = createContext<AgentApprovalContextValue | null>(null);

export function AgentApprovalProvider({ children }: { children: ReactNode }) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const showApprovalModal = useCallback(() => {
    setIsModalOpen(true);
  }, []);

  const hideApprovalModal = useCallback(() => {
    setIsModalOpen(false);
  }, []);

  return (
    <AgentApprovalContext.Provider value={{ showApprovalModal, hideApprovalModal }}>
      {children}
      <AgentApprovalModal
        isOpen={isModalOpen}
        onClose={hideApprovalModal}
        onComplete={hideApprovalModal}
      />
    </AgentApprovalContext.Provider>
  );
}

export function useAgentApprovalModal() {
  const context = useContext(AgentApprovalContext);
  if (!context) {
    throw new Error("useAgentApprovalModal must be used within AgentApprovalProvider");
  }
  return context;
}

/**
 * Check if an error message indicates agent approval is needed
 */
export function isAgentApprovalError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /agent.*not approved|not approved.*agent|re-run setup/i.test(message);
}
