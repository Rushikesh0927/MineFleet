import React from 'react';
import { useQuery } from "@tanstack/react-query";

const POLL = 2000;

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

// ── Types ───────────────────────────────────────────────────────────────────

export interface BotStatus {
  id: string;
  username: string;
  status: "ONLINE" | "OFFLINE" | "CONNECTING" | "ERROR";
  server?: string;
  health?: number;
  food?: number;
  ping?: number;
  position?: { x: number; y: number; z: number };
  dimension?: string;
  gameMode?: string;
  uptime?: number;
  error?: string;
  autoReconnect?: boolean;
  heldItem?: any;
  nearbyPlayers?: string[];
  inventory?: any[];
}

export interface Plugin {
  name: string;
  version: string;
  description: string;
  enabled: boolean;
}

export interface Task {
  id: string;
  name: string;
  state: string;
  priority: number;
  interruptible: boolean;
  createdAt: string | number;
}

export interface BotTasks {
  botId: string;
  botUsername: string;
  active: Task | null;
  queue: Task[];
}

export interface LogEntry {
  id: number;
  timestamp: string;
  level: "info" | "warn" | "error";
  message: string;
}

export interface ConsoleLogEntry {
  id: number;
  timestamp: string;
  botUsername: string;
  category: 'Errors' | 'Commands' | 'Movement' | 'Reconnect' | 'Plugins' | 'All';
  message: string;
  severity: 'info' | 'warn' | 'error';
}

export interface SystemInfo {
  status: string;
  name: string;
  version: string;
  uptime: number;
  uptimeFormatted: string;
  nodeVersion: string;
  platform: string;
  memory: { usedMb: number; totalMb: number; rssMb: number };
  bots: { total: number; online: number };
  plugins: number;
  logEntries: number;
}

export interface AppConfig {
  name?: string;
  version?: string;
  [key: string]: unknown;
}

export interface HealthStatus {
  status: string;
  uptime: number;
  version: string;
}

// ── Hooks ───────────────────────────────────────────────────────────────────

export function useBots() {
  return useQuery<BotStatus[]>({
    queryKey: ["bots"],
    queryFn: () => apiFetch("/api/bots"),
    refetchInterval: POLL,
  });
}

export function useBot(id: string) {
  return useQuery<BotStatus>({
    queryKey: ["bots", id],
    queryFn: () => apiFetch(`/api/bots/${id}`),
    refetchInterval: POLL,
    enabled: !!id,
  });
}

export function useFleetBot(id: string) {
  return useQuery<BotStatus>({
    queryKey: ["fleet-bots", id],
    queryFn: () => apiFetch(`/api/fleet/bots/${id}/details`),
    refetchInterval: POLL,
    enabled: !!id,
  });
}

export async function sendCommand(id: string, cmd: any) {
  const res = await fetch(`/api/bots/${id}/command`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  if (!res.ok) {
    let err = `Error ${res.status}`;
    try {
      const data = await res.json();
      err = data.error || err;
    } catch (e) {}
    throw new Error(err);
  }
  return res.json();
}

export interface InventoryItem {
  slot: number;
  empty?: boolean;
  name?: string;
  displayName?: string;
  count?: number;
  type?: number;
  maxDurability?: number;
  durabilityUsed?: number;
}

export interface InventoryState {
  slots: InventoryItem[];
  quickBarSlot: number;
  equipment: {
    head: string | null;
    torso: string | null;
    legs: string | null;
    feet: string | null;
    'off-hand': string | null;
    hand: string | null;
  };
}

export function useInventory(id: string) {
  return useQuery<InventoryState>({
    queryKey: ["inventory", id],
    queryFn: () => apiFetch(`/api/bots/${id}/inventory`),
    refetchInterval: POLL,
    enabled: !!id,
  });
}

export async function sendInventoryAction(id: string, action: any) {
  const res = await fetch(`/api/bots/${id}/inventory/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(action),
  });
  if (!res.ok) {
    let err = `Error ${res.status}`;
    try {
      const data = await res.json();
      err = data.error || err;
    } catch (e) {}
    throw new Error(err);
  }
  return res.json();
}

export interface Plugin {
  name: string;
  version: string;
  description: string;
  enabled: boolean;
}

export function usePlugins() {
  return useQuery<Plugin[]>({
    queryKey: ["plugins"],
    queryFn: () => apiFetch("/api/plugins"),
    refetchInterval: POLL,
  });
}

export async function sendPluginAction(name: string, action: string) {
  const res = await fetch(`/api/plugins/${name}/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    let err = `Error ${res.status}`;
    try {
      const data = await res.json();
      err = data.error || err;
    } catch (e) {}
    throw new Error(err);
  }
  return res.json();
}

export interface FleetProfile {
  id: string;
  name: string;
  bots: {
    username: string;
    host: string;
    port: number;
    version: string;
    autoReconnect?: boolean;
  }[];
  defaultAutoReconnect: boolean;
}

export function useFleetProfiles() {
  return useQuery<FleetProfile[]>({
    queryKey: ["fleetProfiles"],
    queryFn: () => apiFetch("/api/fleet/profiles"),
    refetchInterval: POLL,
  });
}

export async function createFleetProfile(profile: Partial<FleetProfile>) {
  return apiFetch("/api/fleet/profiles", {
    method: "POST",
    body: JSON.stringify(profile),
  });
}

export async function updateFleetProfile(id: string, profile: Partial<FleetProfile>) {
  return apiFetch(`/api/fleet/profiles/${id}`, {
    method: "PUT",
    body: JSON.stringify(profile),
  });
}

export async function deleteFleetProfile(id: string) {
  return apiFetch(`/api/fleet/profiles/${id}`, {
    method: "DELETE",
  });
}

export async function deployFleetProfile(id: string) {
  return apiFetch(`/api/fleet/profiles/${id}/deploy`, {
    method: "POST",
  });
}

export function useTasks() {
  return useQuery<BotTasks[]>({
    queryKey: ["tasks"],
    queryFn: () => apiFetch("/api/tasks"),
    refetchInterval: POLL,
  });
}

export function useLogs(params?: { limit?: number; level?: string; search?: string }) {
  const qs = new URLSearchParams();
  if (params?.limit)  qs.set("limit",  String(params.limit));
  if (params?.level)  qs.set("level",  params.level);
  if (params?.search) qs.set("search", params.search);
  const query = qs.toString() ? `?${qs}` : "";

  return useQuery<LogEntry[]>({
    queryKey: ["logs", params],
    queryFn: () => apiFetch(`/api/logs${query}`),
    refetchInterval: POLL,
  });
}

export function useConsoleLogs() {
  const [logs, setLogs] = React.useState<ConsoleLogEntry[]>([]);
  const [lastId, setLastId] = React.useState(0);

  React.useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    let currentLastId = lastId;
    
    const fetchLogs = async () => {
      try {
        const res = await fetch(`/api/console/logs?since=${currentLastId}`);
        if (res.ok) {
          const newLogs: ConsoleLogEntry[] = await res.json();
          if (newLogs.length > 0) {
            setLogs(prev => {
              const combined = [...prev, ...newLogs];
              if (combined.length > 1000) return combined.slice(-1000);
              return combined;
            });
            currentLastId = newLogs[newLogs.length - 1].id;
            setLastId(currentLastId);
          }
        }
      } catch (err) {
        // silently ignore
      }
      timeout = setTimeout(fetchLogs, POLL);
    };
    
    fetchLogs();
    return () => clearTimeout(timeout);
  }, []); // Run once on mount

  return { data: logs };
}

export interface MapPosition {
  type: 'bot' | 'owner';
  id?: string;
  username: string;
  x: number;
  z: number;
  dimension: string;
  destination?: { x: number; z: number } | null;
}

export function useMapPositions() {
  return useQuery<MapPosition[]>({
    queryKey: ["map-positions"],
    queryFn: () => apiFetch("/api/map/positions"),
    refetchInterval: POLL,
  });
}

export function useSystem() {
  return useQuery<SystemInfo>({
    queryKey: ["system"],
    queryFn: () => apiFetch("/api/system"),
    refetchInterval: POLL,
  });
}

export function useHealth() {
  return useQuery<HealthStatus>({
    queryKey: ["health"],
    queryFn: () => apiFetch("/health"),
    refetchInterval: POLL,
  });
}

export function useConfig() {
  return useQuery<AppConfig>({
    queryKey: ["config"],
    queryFn: () => apiFetch("/api/config"),
    refetchInterval: 10_000,
  });
}
