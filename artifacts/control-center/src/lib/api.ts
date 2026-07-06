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

export function usePlugins() {
  return useQuery<Plugin[]>({
    queryKey: ["plugins"],
    queryFn: () => apiFetch("/api/plugins"),
    refetchInterval: POLL,
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
