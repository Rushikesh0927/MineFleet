import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { BotStatus, BotTasks } from '../lib/api';
import { useServerContext } from '../contexts/ServerContext';

export function useWebSocketSync() {
  const queryClient = useQueryClient();
  const { activeServerId } = useServerContext();
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let reconnectTimer: any;
    let ws: WebSocket;

    function connect() {
      // Connect to the same host that serves the dashboard
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = process.env.NODE_ENV === 'development' ? 'localhost:3000' : window.location.host;
      const url = `${protocol}//${host}/${activeServerId ? `?serverId=${activeServerId}` : ''}`;
      ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[useWebSocketSync] Connected to', url);
        setConnected(true);
        queryClient.setQueryData(['wsConnected'], true);
      };

      ws.onclose = () => {
        console.log('[useWebSocketSync] Disconnected. Reconnecting in 3s...');
        setConnected(false);
        queryClient.setQueryData(['wsConnected'], false);
        reconnectTimer = setTimeout(connect, 3000);
      };

      ws.onerror = (err) => {
        console.error('[useWebSocketSync] WebSocket error:', err);
        ws.close();
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'STATE_UPDATE') {
            const { bots, tasks } = data.payload as { bots: BotStatus[], tasks: BotTasks[] };
            
            // Overwrite caches natively (scoped by serverId)
            // React Query keys for bots lists are: ["bots", activeServerId] and ["bots"] (global)
            // The WS server already filtered this payload by activeServerId, so we can overwrite BOTH
            queryClient.setQueryData(['bots', activeServerId || null], bots);
            queryClient.setQueryData(['tasks', activeServerId || null], tasks);
            
            // Also update individual bot queries
            bots.forEach(bot => {
              queryClient.setQueryData(['bots', bot.id], bot);
              queryClient.setQueryData(['fleet-bots', bot.id], bot);
            });
          }
          else if (data.type === 'MAP_UPDATE') {
            queryClient.setQueryData(['map-positions', activeServerId || null], data.payload);
          }
          else if (data.type === 'CONSOLE_LOG') {
            const entry = data.payload;
            queryClient.setQueryData(['logs', activeServerId || null], (old: any) => {
              if (!old) return [entry];
              const newLogs = [...old, entry];
              if (newLogs.length > 200) newLogs.shift();
              return newLogs;
            });
          }
        } catch (e) {
          console.error('[useWebSocketSync] Failed to parse message', e);
        }
      };
    }

    connect();

    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) {
        ws.onclose = null; // prevent reconnect loop on unmount
        ws.close();
      }
    };
  }, [queryClient, activeServerId]);

  return connected;
}
