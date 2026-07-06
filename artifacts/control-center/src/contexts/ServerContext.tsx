import React, { createContext, useContext, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";

interface Server {
  id: string;
  name: string;
  host: string;
  port: number;
  version: string;
}

interface ServerContextType {
  servers: Server[];
  activeServerId: string | null;
  setActiveServerId: (id: string | null) => void;
  isLoading: boolean;
}

const ServerContext = createContext<ServerContextType | undefined>(undefined);

export function ServerProvider({ children }: { children: React.ReactNode }) {
  const [activeServerId, setActiveServerId] = useState<string | null>(null);

  const { data: servers = [], isLoading } = useQuery<Server[]>({
    queryKey: ["/api/servers"],
    queryFn: async () => {
      const res = await fetch("/api/servers");
      if (!res.ok) throw new Error("Failed to fetch servers");
      return res.json();
    }
  });

  // Auto-select the first server if none is selected
  useEffect(() => {
    if (!activeServerId && servers.length > 0) {
      setActiveServerId(servers[0].id);
    }
  }, [servers, activeServerId]);

  return (
    <ServerContext.Provider value={{ servers, activeServerId, setActiveServerId, isLoading }}>
      {children}
    </ServerContext.Provider>
  );
}

export function useServerContext() {
  const context = useContext(ServerContext);
  if (context === undefined) {
    throw new Error("useServerContext must be used within a ServerProvider");
  }
  return context;
}
