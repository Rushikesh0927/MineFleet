import { useTasks, BotTasks } from "@/lib/api";
import { useServerContext } from "@/contexts/ServerContext";
import { Activity, Clock, Bot, ListTodo } from "lucide-react";
import { cn } from "@/lib/utils";

function TaskRow({
  name,
  state,
  priority,
  interruptible,
  active,
}: {
  name: string;
  state: string;
  priority: number;
  interruptible?: boolean;
  active?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-border last:border-0">
      <div className={cn("shrink-0", active ? "text-primary" : "text-muted-foreground")}>
        {active ? <Activity className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn("text-sm font-medium truncate", active ? "text-foreground" : "text-muted-foreground")}>
          {name}
        </p>
        <p className="text-xs text-muted-foreground">State: {state}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-xs text-muted-foreground">P:{priority}</span>
        {active && (
          <span className="text-xs bg-primary/15 text-primary px-2 py-0.5 rounded-full">Running</span>
        )}
        {interruptible && !active && (
          <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">Interruptible</span>
        )}
      </div>
    </div>
  );
}

function BotTaskSection({ bt }: { bt: BotTasks }) {
  const hasAny = bt.active || bt.queue.length > 0;

  return (
    <div className="bg-card border border-card-border rounded-lg">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <Bot className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-semibold text-foreground">{bt.botUsername}</span>
        <span className="text-xs text-muted-foreground font-mono ml-1">#{bt.botId}</span>
        {bt.active && (
          <span className="ml-auto text-xs bg-green-500/15 text-green-400 border border-green-500/25 px-2 py-0.5 rounded-full">
            Active
          </span>
        )}
      </div>
      <div className="px-4">
        {!hasAny ? (
          <p className="py-4 text-sm text-muted-foreground">No tasks</p>
        ) : (
          <>
            {bt.active && (
              <TaskRow
                name={bt.active.name}
                state={bt.active.state}
                priority={bt.active.priority}
                interruptible={bt.active.interruptible}
                active
              />
            )}
            {bt.queue.map(t => (
              <TaskRow
                key={t.id}
                name={t.name}
                state={t.state}
                priority={t.priority}
                interruptible={t.interruptible}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

export default function Tasks() {
  const { activeServerId } = useServerContext();
  const { data: tasks, isLoading, isError } = useTasks(activeServerId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
        Loading tasks…
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center justify-center h-48 text-red-400 text-sm">
        Failed to load tasks.
      </div>
    );
  }

  if (!tasks || tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-2 text-muted-foreground">
        <ListTodo className="w-10 h-10 opacity-30" />
        <p className="text-sm">No bots configured</p>
      </div>
    );
  }

  const totalRunning = tasks.filter(t => t.active !== null).length;
  const totalQueued  = tasks.reduce((s, t) => s + t.queue.length, 0);

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex items-center gap-6 text-sm text-muted-foreground">
        <span>
          <span className="text-foreground font-medium">{totalRunning}</span> running
        </span>
        <span>
          <span className="text-foreground font-medium">{totalQueued}</span> queued
        </span>
      </div>

      <div className="space-y-4">
        {tasks.map(bt => (
          <BotTaskSection key={bt.botId} bt={bt} />
        ))}
      </div>
    </div>
  );
}
