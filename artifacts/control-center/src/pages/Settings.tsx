import React from "react";
import { useSystem, useConfig, useHealth } from "@/lib/api";
import { Settings as SettingsIcon, Server, Cpu, MemoryStick, Package, Clock } from "lucide-react";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-border last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm text-foreground font-medium font-mono">{value}</span>
    </div>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-card-border rounded-lg">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <Icon className="w-4 h-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      </div>
      <div className="px-4">{children}</div>
    </div>
  );
}

export default function Settings() {
  const { data: system } = useSystem();
  const { data: config  } = useConfig();
  const { data: health  } = useHealth();

  return (
    <div className="space-y-6 max-w-2xl">
      <p className="text-sm text-muted-foreground">
        Read-only view of the MineFleet platform configuration and runtime state.
      </p>

      {/* Platform */}
      <Section title="Platform" icon={SettingsIcon}>
        <Row label="Name"    value={system?.name    ?? config?.name    ?? "MineFleet"} />
        <Row label="Version" value={system?.version ?? config?.version ?? "—"} />
        <Row label="Status"  value={
          <span className="text-green-400">{health?.status ?? "—"}</span>
        } />
        <Row label="Uptime"  value={system?.uptimeFormatted ?? `${health?.uptime ?? "—"}s`} />
      </Section>

      {/* Runtime */}
      <Section title="Runtime" icon={Cpu}>
        <Row label="Node.js"  value={system?.nodeVersion ?? "—"} />
        <Row label="Platform" value={system?.platform    ?? "—"} />
        <Row label="Heap Used"  value={system ? `${system.memory.usedMb} MB` : "—"} />
        <Row label="Heap Total" value={system ? `${system.memory.totalMb} MB` : "—"} />
        <Row label="RSS"        value={system ? `${system.memory.rssMb} MB`  : "—"} />
      </Section>

      {/* Counts */}
      <Section title="Resources" icon={Package}>
        <Row label="Total Bots"   value={system?.bots.total  ?? "—"} />
        <Row label="Online Bots"  value={system?.bots.online ?? "—"} />
        <Row label="Plugins"      value={system?.plugins     ?? "—"} />
        <Row label="Log Entries"  value={system?.logEntries  ?? "—"} />
      </Section>

      {/* Raw config */}
      {config && (
        <Section title="App Config (raw)" icon={Clock}>
          <div className="py-3">
            <pre className="text-xs text-muted-foreground whitespace-pre-wrap break-all">
              {JSON.stringify(config, null, 2)}
            </pre>
          </div>
        </Section>
      )}
    </div>
  );
}
