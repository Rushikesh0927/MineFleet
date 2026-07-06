import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Bot,
  ListTodo,
  Puzzle,
  ScrollText,
  Settings,
  Layers3,
  Map,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useServerContext } from "@/contexts/ServerContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const navItems = [
  { href: "/",        label: "Overview",       icon: LayoutDashboard },
  { href: "/bots",    label: "Bots",           icon: Bot },
  { href: "/profiles",label: "Fleet Profiles", icon: Users },
  { href: "/map",     label: "World Map",      icon: Map },
  { href: "/tasks",   label: "Tasks",          icon: ListTodo },
  { href: "/plugins", label: "Plugins",        icon: Puzzle },
  { href: "/logs",    label: "Logs",           icon: ScrollText },
];

const bottomItems = [
  { href: "/settings", label: "Settings", icon: Settings },
];

export default function Sidebar() {
  const [location] = useLocation();
  const { servers, activeServerId, setActiveServerId, isLoading } = useServerContext();

  function isActive(href: string) {
    if (href === "/") return location === "/";
    return location.startsWith(href);
  }

  return (
    <aside className="w-56 shrink-0 flex flex-col bg-sidebar border-r border-sidebar-border">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 py-4 border-b border-sidebar-border">
        <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center shrink-0">
          <Layers3 className="w-4 h-4 text-primary-foreground" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground leading-none truncate">MineFleet</p>
          <p className="text-xs text-muted-foreground leading-none mt-0.5">Control Center</p>
        </div>
      </div>

      {/* Server Selector */}
      <div className="px-4 py-3 border-b border-sidebar-border bg-sidebar-accent/30">
        <Select 
          value={activeServerId || undefined} 
          onValueChange={setActiveServerId}
          disabled={isLoading || servers.length === 0}
        >
          <SelectTrigger className="w-full h-8 text-xs bg-sidebar border-sidebar-border">
            <SelectValue placeholder="Select Server" />
          </SelectTrigger>
          <SelectContent>
            {servers.map(server => (
              <SelectItem key={server.id} value={server.id} className="text-xs">
                {server.name} ({server.version})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {navItems.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors",
              isActive(href)
                ? "bg-sidebar-accent text-primary"
                : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground"
            )}
          >
            <Icon className="w-4 h-4 shrink-0" />
            {label}
          </Link>
        ))}
      </nav>

      {/* Bottom */}
      <div className="px-2 py-3 border-t border-sidebar-border space-y-0.5">
        {bottomItems.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors",
              isActive(href)
                ? "bg-sidebar-accent text-primary"
                : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground"
            )}
          >
            <Icon className="w-4 h-4 shrink-0" />
            {label}
          </Link>
        ))}
      </div>
    </aside>
  );
}
