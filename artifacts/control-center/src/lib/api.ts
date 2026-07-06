import React from 'react';
import { useQuery } from "@tanstack/react-query";

const POLL = 2000;

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, options);
  if (!res.ok) {
    let msg = `API error ${res.status}: ${path}`;
    try {
      const data = await res.json();
      msg = data.error || msg;
    } catch (e) {}
    throw new Error(msg);
  }
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

export function useBots(serverId?: string | null) {
  const { data: wsConnected } = useQuery<boolean>({ queryKey: ["wsConnected"], initialData: false });
  return useQuery<BotStatus[]>({
    queryKey: ["bots", serverId],
    queryFn: () => apiFetch(`/api/bots${serverId ? `?serverId=${serverId}` : ''}`),
    refetchInterval: wsConnected ? false : POLL,
  });
}

export function useBot(id: string) {
  const { data: wsConnected } = useQuery<boolean>({ queryKey: ["wsConnected"], initialData: false });
  return useQuery<BotStatus>({
    queryKey: ["bots", id],
    queryFn: () => apiFetch(`/api/bots/${id}`),
    refetchInterval: wsConnected ? false : POLL,
    enabled: !!id,
  });
}

export function useFleetBot(id: string) {
  const { data: wsConnected } = useQuery<boolean>({ queryKey: ["wsConnected"], initialData: false });
  return useQuery<BotStatus>({
    queryKey: ["fleet-bots", id],
    queryFn: () => apiFetch(`/api/fleet/bots/${id}/details`),
    refetchInterval: wsConnected ? false : POLL,
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

export async function deployFleetProfile(id: string, serverId?: string | null) {
  return apiFetch(`/api/fleet/profiles/${id}/deploy${serverId ? `?serverId=${serverId}` : ''}`, {
    method: "POST",
  });
}

export function useTasks(serverId?: string | null) {
  const { data: wsConnected } = useQuery<boolean>({ queryKey: ["wsConnected"], initialData: false });
  return useQuery<BotTasks[]>({
    queryKey: ["tasks", serverId],
    queryFn: () => apiFetch(`/api/tasks${serverId ? `?serverId=${serverId}` : ''}`),
    refetchInterval: wsConnected ? false : POLL,
  });
}

export function useLogs(params?: { limit?: number; level?: string; search?: string }) {
  const { data: wsConnected } = useQuery<boolean>({ queryKey: ["wsConnected"], initialData: false });
  const qs = new URLSearchParams();
  if (params?.limit)  qs.set("limit",  String(params.limit));
  if (params?.level)  qs.set("level",  params.level);
  if (params?.search) qs.set("search", params.search);
  const query = qs.toString() ? `?${qs}` : "";

  return useQuery<LogEntry[]>({
    queryKey: ["logs", params],
    queryFn: () => apiFetch(`/api/logs${query}`),
    refetchInterval: wsConnected ? false : POLL,
  });
}

export function useConsoleLogs(serverId?: string | null) {
  const { data: wsConnected } = useQuery<boolean>({ queryKey: ["wsConnected"], initialData: false });
  return useQuery<ConsoleLogEntry[]>({
    queryKey: ["logs", serverId],
    queryFn: () => apiFetch(`/api/console/logs${serverId ? `?serverId=${serverId}` : ''}`),
    refetchInterval: wsConnected ? false : POLL,
  });
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

export function useMapPositions(serverId?: string | null) {
  const { data: wsConnected } = useQuery<boolean>({ queryKey: ["wsConnected"], initialData: false });
  return useQuery<MapPosition[]>({
    queryKey: ["map-positions", serverId],
    queryFn: () => apiFetch(`/api/map/positions${serverId ? `?serverId=${serverId}` : ''}`),
    refetchInterval: wsConnected ? false : POLL,
  });
}

export function useSystem() {
  return useQuery<SystemInfo>({
    queryKey: ["system"],
    queryFn: () => apiFetch("/api/system"),
  });
}

export function useHealth() {
  return useQuery<HealthStatus>({
    queryKey: ["health"],
    queryFn: () => apiFetch("/health"),
  });
}

export function useConfig() {
  return useQuery<AppConfig>({
    queryKey: ["config"],
    queryFn: () => apiFetch("/api/config"),
  });
}
