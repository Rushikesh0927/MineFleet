/**
 * dashboard/DashboardServer.js
 *
 * REST API backend for the MineFleet dashboard.
 * Provides read-only status endpoints AND Phase 2.1 fleet control endpoints.
 *
 * ── Phase 1 (read-only) Routes ────────────────────────────────────────────────
 *   GET /              — API identification
 *   GET /health        — platform health check
 *   GET /api/bots      — all bot statuses
 *   GET /api/bots/:id  — single bot status
 *   GET /api/plugins   — loaded plugins
 *   GET /api/config    — application configuration
 *   GET /api/tasks     — task queues for all bots
 *   GET /api/logs      — recent log ring buffer (last 500 entries)
 *   GET /api/system    — process / platform metrics
 *
 * ── Phase 2.1 (fleet control) Routes ─────────────────────────────────────────
 *   GET    /api/fleet/bots                  — all bots with full details panel
 *   GET    /api/fleet/bots/:id/details      — single bot full details panel
 *   POST   /api/fleet/bots                  — add new bot
 *   DELETE /api/fleet/bots/:id              — remove bot
 *   PATCH  /api/fleet/bots/:id/rename       — rename bot
 *   POST   /api/fleet/bots/:id/start        — start bot
 *   POST   /api/fleet/bots/:id/stop         — stop bot (intentional)
 *   POST   /api/fleet/bots/:id/restart      — restart bot
 *   PATCH  /api/fleet/bots/:id/autoreconnect— toggle autoReconnect
 *   POST   /api/fleet/bulk/start            — start all (staggered)
 *   POST   /api/fleet/bulk/stop             — stop all (staggered)
 *   POST   /api/fleet/bulk/restart          — restart all (staggered)
 *   POST   /api/fleet/bulk/follow           — follow owner (body: { target })
 *   POST   /api/fleet/bulk/gohome           — go home (reads home from app.json)
 *
 * Default port: 3000 (overridden by DASHBOARD_PORT env var)
 */

const express    = require('express');
const path       = require('path');
const { WebSocketServer } = require('ws');
const FollowTask = require('../modules/tasks/FollowTask');
const GotoTask   = require('../modules/tasks/GotoTask');
const LookAtTask = require('../modules/tasks/LookAtTask');
const StopTask   = require('../modules/tasks/StopTask');
const JumpTask   = require('../modules/tasks/JumpTask');
const SneakTask  = require('../modules/tasks/SneakTask');
const AttackTask = require('../modules/tasks/AttackTask');
const BotActionTask = require('../modules/tasks/BotActionTask');
const MoveItemTask = require('../modules/tasks/MoveItemTask');
const EquipTask = require('../modules/tasks/EquipTask');
const DropTask = require('../modules/tasks/DropTask');
const ConsumeTask = require('../modules/tasks/ConsumeTask');
const { fleetLog } = require('../modules/FleetLogger');
const ConsoleBuffer = require('../core/ConsoleBuffer');

const DEFAULT_PORT = 3000;
const DEBUG = process.env.DEBUG_RECONNECT === 'true';

// Stagger between bots in bulk follow/gohome (ms)
const BULK_STAGGER_MS = 500;

// ---------------------------------------------------------------------------
// Module-level log ring buffer — captures console output platform-wide
// ---------------------------------------------------------------------------
const _logBuffer = [];
let _logId = 0;
const MAX_LOG_ENTRIES = 500;

function _captureLog(level, args) {
  const message = args
    .map(a => (typeof a === 'string' ? a : JSON.stringify(a)))
    .join(' ');
  _logBuffer.push({
    id: ++_logId,
    timestamp: new Date().toISOString(),
    level,
    message,
  });
  if (_logBuffer.length > MAX_LOG_ENTRIES) _logBuffer.shift();
}

let _interceptorInstalled = false;
function _installLogInterceptor() {
  if (_interceptorInstalled) return;
  _interceptorInstalled = true;

  const _origLog   = console.log.bind(console);
  const _origWarn  = console.warn.bind(console);
  const _origError = console.error.bind(console);

  console.log   = (...args) => { _origLog(...args);   _captureLog('info',  args); };
  console.warn  = (...args) => { _origWarn(...args);  _captureLog('warn',  args); };
  console.error = (...args) => { _origError(...args); _captureLog('error', args); };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function _formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/**
 * Builds a standard success response for fleet action endpoints.
 */
function _okResponse(action, botId, username, extra = {}) {
  return {
    ok:        true,
    action,
    botId,
    username:  username || botId,
    timestamp: new Date().toISOString(),
    ...extra,
  };
}

/**
 * Builds a standard error response for fleet action endpoints.
 */
function _errResponse(error, statusCode = 400) {
  return {
    ok:        false,
    error,
    timestamp: new Date().toISOString(),
    _status:   statusCode,
  };
}

class DashboardServer {
  /**
   * @param {BotManager}    botManager
   * @param {PluginManager} pluginManager
   * @param {ConfigManager} configManager
   */
  constructor(botManager, pluginManager, configManager, eventManager) {
    this.botManager    = botManager;
    this.pluginManager = pluginManager;
    this.configManager = configManager;
    this.eventManager  = eventManager || global.eventManager; // Support injection or global

    this.app    = express();
    this.server = null;
    this.wss    = null;

    this.startedAt = null;

    this._diag = {
      activeSockets: 0,
      requestCount: 0,
      byPath: {},
      lastRequestAt: null,
    };
  }

  /**
   * Registers all routes and starts the HTTP server.
   */
  initialize() {
    _installLogInterceptor();
    this._registerRoutes();

    const port = parseInt(process.env.DASHBOARD_PORT, 10) || DEFAULT_PORT;

    this.startedAt = Date.now();
    this.server = this.app.listen(port, () => {
      console.log(`[DashboardServer] REST API listening on port ${port}`);

      if (DEBUG) {
        this.server.on('connection', (socket) => {
          this._diag.activeSockets += 1;
          const remote = `${socket.remoteAddress || 'unknown'}:${socket.remotePort || 'unknown'}`;
          console.log(`[DashboardServer][DEBUG] socket open | remote=${remote} | activeSockets=${this._diag.activeSockets}`);

          socket.on('close', () => {
            this._diag.activeSockets = Math.max(0, this._diag.activeSockets - 1);
            console.log(`[DashboardServer][DEBUG] socket close | remote=${remote} | activeSockets=${this._diag.activeSockets}`);
          });
        });
      }

      this._setupWebSockets();
    });
  }

  /**
   * Gracefully stops the HTTP server.
   */
  shutdown() {
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
    if (this._wsIntervals) {
      this._wsIntervals.forEach(clearInterval);
      this._wsIntervals = [];
    }
    if (this.server) {
      this.server.close(() => {
        console.log('[DashboardServer] Server stopped.');
      });
    }
  }

  // ---------------------------------------------------------------------------
  // WebSocket System
  // ---------------------------------------------------------------------------

  _broadcast(type, payload, targetServerId = null) {
    if (!this.wss) return;
    const msg = JSON.stringify({ type, payload });
    this.wss.clients.forEach(client => {
      if (client.readyState === 1) { // WebSocket.OPEN
        // If targetServerId is provided, only send to clients looking at that server (or looking globally if client.serverId is missing)
        // If client.serverId is provided, only send payloads that match it.
        // Wait, if targetServerId is null, it means global state. If client has a specific server, we filter it.
        if (targetServerId && client.serverId && client.serverId !== targetServerId) return;
        
        // However, if the payload itself is an array of items for different servers, 
        // we should just let the frontend filter it, OR we pre-filter it.
        // The instructions said "scope connections per server". So let's actually just send the message.
        // Wait, I will filter it before sending if it's a global array, or just send it and let the client filter.
        // Let's filter the payload if client has a serverId and it's a bulk array!
        let sendMsg = msg;
        if (client.serverId) {
          if (type === 'STATE_UPDATE') {
            const filteredBots = payload.bots.filter(b => b.serverId === client.serverId);
            const filteredTasks = payload.tasks.filter(t => this.botManager.profiles[t.botId]?.serverId === client.serverId);
            sendMsg = JSON.stringify({ type, payload: { bots: filteredBots, tasks: filteredTasks } });
          } else if (type === 'MAP_UPDATE') {
            const filteredPositions = payload.filter(p => p.serverId === client.serverId);
            sendMsg = JSON.stringify({ type, payload: filteredPositions });
          } else if (type === 'CONSOLE_LOG') {
            if (payload.botUsername !== 'System' && payload.botUsername !== 'SYSTEM') {
               const profile = Object.values(this.botManager.profiles).find(p => p.username === payload.botUsername);
               if (profile && profile.serverId !== client.serverId) return;
            }
          }
        }
        client.send(sendMsg);
      }
    });
  }

  _setupWebSockets() {
    this.wss = new WebSocketServer({ server: this.server });
    this._wsIntervals = [];

    this.wss.on('connection', (ws, req) => {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      ws.serverId = url.searchParams.get('serverId');
      ws.send(JSON.stringify({ type: 'hello', payload: { ts: Date.now(), serverId: ws.serverId } }));
    });

    // Broadcast Bot Status & Tasks every 1000ms
    const stateInterval = setInterval(() => {
      if (!this.wss || this.wss.clients.size === 0) return;

      const bots = Object.values(this.botManager.profiles).map((profile) => {
        const id = profile.id;
        const state = this.botManager.runtimes[id] || {};
        const isOnline = state.status === 'ONLINE';
        let botState = {};

        if (isOnline) {
          const bot = this.botManager.botEngine.bots[id];
          if (bot && bot.entity) {
            botState = {
              health: bot.health,
              food: bot.food,
              position: bot.entity.position,
              dimension: bot.game?.dimension || 'overworld',
              gameMode: bot.player?.gamemode === 0 ? 'survival' : 'creative',
              heldItem: bot.heldItem ? { name: bot.heldItem.name, count: bot.heldItem.count } : null,
              nearbyPlayers: Object.values(bot.players)
                .filter(p => p.entity && p.username !== bot.username && p.entity.position.distanceTo(bot.entity.position) < 50)
                .map(p => p.username),
            };
          }
        }
        return {
          id,
          serverId: profile.serverId,
          username: profile.username,
          status: state.status || 'OFFLINE',
          error: state.error || null,
          uptime: state.connectedAt ? Math.floor((Date.now() - state.connectedAt) / 1000) : 0,
          ping: state.ping || 0,
          autoReconnect: profile.autoReconnect ?? true,
          ...botState,
        };
      });

      const tasks = Object.values(this.botManager.profiles).map(profile => {
        const id = profile.id;
        const taskManager = this.botManager.taskManagers[id];
        return {
          botId: id,
          botUsername: profile.username,
          active: taskManager?.activeTask || null,
          queue: taskManager?.queue || [],
        };
      });

      this._broadcast('STATE_UPDATE', { bots, tasks });
    }, 1000);

    // Broadcast Map Positions every 500ms for smooth rendering
    const mapInterval = setInterval(() => {
      if (!this.wss || this.wss.clients.size === 0) return;
      
      const positions = [];
      Object.entries(this.botManager.botEngine.bots).forEach(([id, bot]) => {
        if (bot && bot.entity && bot.entity.position) {
          const profile = this.botManager.profiles[id];
          if (!profile) return;
          positions.push({
            id,
            username: bot.username,
            serverId: profile.serverId,
            health: bot.health,
            dimension: bot.game?.dimension || 'overworld',
            position: {
              x: bot.entity.position.x,
              y: bot.entity.position.y,
              z: bot.entity.position.z,
              yaw: bot.entity.yaw
            }
          });
        }
      });
      
      this._broadcast('MAP_UPDATE', positions);
    }, 500);

    // Listen to ConsoleBuffer events
    const onLog = (entry) => {
      this._broadcast('CONSOLE_LOG', entry);
    };
    ConsoleBuffer.on('log', onLog);

    // Event-driven bot state updates (Phase 2.10 requirement)
    const onBotStateChange = (id) => {
      if (!this.wss || this.wss.clients.size === 0) return;
      
      const profile = this.botManager.profiles[id];
      if (!profile) return;
      
      const state = this.botManager.runtimes[id] || {};
      const isOnline = state.status === 'ONLINE';
      let botState = {};

      if (isOnline) {
        const bot = this.botManager.botEngine.bots[id];
        if (bot && bot.entity) {
          botState = {
            health: bot.health,
            food: bot.food,
            position: bot.entity.position,
            dimension: bot.game?.dimension || 'overworld',
            gameMode: bot.player?.gamemode === 0 ? 'survival' : 'creative',
            heldItem: bot.heldItem ? { name: bot.heldItem.name, count: bot.heldItem.count } : null,
            nearbyPlayers: Object.values(bot.players)
              .filter(p => p.entity && p.username !== bot.username && p.entity.position.distanceTo(bot.entity.position) < 50)
              .map(p => p.username),
          };
        }
      }
      
      const botStatusObj = {
        id,
        serverId: profile.serverId,
        username: profile.username,
        status: state.status || 'OFFLINE',
        error: state.error || null,
        uptime: state.connectedAt ? Math.floor((Date.now() - state.connectedAt) / 1000) : 0,
        ping: state.ping || 0,
        autoReconnect: profile.autoReconnect ?? true,
        ...botState,
      };

      const taskManager = this.botManager.taskManagers[id];
      const taskObj = {
        botId: id,
        botUsername: profile.username,
        active: taskManager?.activeTask || null,
        queue: taskManager?.queue || [],
      };

      // Broadcast single bot update (wrapping in arrays to match STATE_UPDATE schema)
      this._broadcast('STATE_UPDATE', { bots: [botStatusObj], tasks: [taskObj] });
    };

    if (this.eventManager) {
      this.eventManager.on('bot:connecting', (botId) => onBotStateChange(botId));
      this.eventManager.on('bot:login', (botId) => onBotStateChange(botId));
      this.eventManager.on('bot:spawn', (botId) => onBotStateChange(botId));
      this.eventManager.on('bot:end', (botId) => onBotStateChange(botId));
      this.eventManager.on('bot:error', (botId) => onBotStateChange(botId));
    }

    this._wsIntervals.push(stateInterval, mapInterval);
  }

  // ---------------------------------------------------------------------------
  // Private — route registration
  // ---------------------------------------------------------------------------

  _registerRoutes() {
    const app = this.app;

    app.use(express.json());
    app.use(express.static(path.join(__dirname, 'public')));

    if (DEBUG) {
      app.use((req, res, next) => {
        const start = Date.now();
        const path = req.originalUrl || req.url || 'unknown';
        this._diag.requestCount += 1;
        this._diag.byPath[path] = (this._diag.byPath[path] || 0) + 1;
        this._diag.lastRequestAt = new Date().toISOString();

        res.on('finish', () => {
          console.log(
            `[DashboardServer][DEBUG] ${req.method} ${path} -> ${res.statusCode}` +
            ` | ${Date.now() - start}ms` +
            ` | ua=${req.headers['user-agent'] || 'unknown'}` +
            ` | activeSockets=${this._diag.activeSockets}`,
          );
        });

        next();
      });
    }

    // CORS — allow the Replit proxy / same-origin frontend
    // Phase 2.1: extended to include POST, PATCH, DELETE for fleet control
    app.use((_req, res, next) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      if (_req.method === 'OPTIONS') {
        return res.sendStatus(204);
      }
      next();
    });

    // ── Phase 1: Existing read-only endpoints ───────────────────────────────

    // GET / — API identification
    app.get('/', (_req, res) => {
      res.json({ message: 'MineFleet Dashboard API' });
    });

    // GET /health — platform health check
    app.get('/health', (_req, res) => {
      const uptimeSeconds = this.startedAt
        ? Math.floor((Date.now() - this.startedAt) / 1000)
        : 0;

      res.json({
        status:  'ok',
        uptime:  uptimeSeconds,
        version: this.configManager.getAppConfig()?.version || 'unknown',
      });
    });

    // GET /api/bots — all bot statuses
    app.get('/api/bots', (req, res) => {
      const serverId = req.query.serverId;
      let statuses = this.botManager.getStatuses();
      if (serverId) {
        // Need to filter by serverId. We'll join with profiles.
        statuses = statuses.filter(s => {
          const p = this.botManager.getProfile(s.id);
          return p && p.serverId === serverId;
        });
      }
      res.json(statuses);
    });

    // GET /api/bots/:id — single bot status
    app.get('/api/bots/:id', (req, res) => {
      const status = this.botManager.getStatus(req.params.id);
      if (!status) {
        return res.status(404).json({ error: `Bot '${req.params.id}' not found` });
      }
      res.json(status);
    });

    // GET /api/plugins — all loaded plugins
    app.get('/api/plugins', (_req, res) => {
      const plugins = Object.values(this.pluginManager.plugins).map(p => ({
        name:        p.name,
        version:     p.version,
        description: p.description,
        enabled:     p.enabled,
      }));
      res.json(plugins);
    });

    // GET /api/config — application configuration
    app.get('/api/config', (_req, res) => {
      res.json(this.configManager.getAppConfig());
    });

    // GET /api/tasks — task queues for every registered bot
    app.get('/api/tasks', (req, res) => {
      const serverId = req.query.serverId;
      const result = [];
      let profiles = this.botManager.getProfiles();
      if (serverId) profiles = profiles.filter(p => p.serverId === serverId);

      for (const profile of profiles) {
        let active = null;
        let queue  = [];
        try {
          const tm = this.botManager.getTaskManager(profile.id);
          const a  = tm.getActive();
          active = a ? {
            id:           a.id,
            name:         a.name,
            state:        a.state,
            priority:     a.priority,
            interruptible: a.interruptible,
            createdAt:    a.createdAt,
          } : null;
          queue = (tm.getQueue() || []).map(t => ({
            id:           t.id,
            name:         t.name,
            state:        t.state,
            priority:     t.priority,
            interruptible: t.interruptible,
            createdAt:    t.createdAt,
          }));
        } catch (_e) {
          // Bot may not be fully initialised yet — skip gracefully
        }
        result.push({
          botId:       profile.id,
          botUsername: profile.username,
          active,
          queue,
        });
      }
      res.json(result);
    });

    // GET /api/logs — recent log ring buffer
    // Query params: limit (default 200, max 500), level (info|warn|error), search
    app.get('/api/logs', (req, res) => {
      const limit  = Math.min(parseInt(req.query.limit, 10) || 200, 500);
      const level  = req.query.level  || null;
      const search = req.query.search || null;

      let entries = [..._logBuffer];
      if (level)  entries = entries.filter(e => e.level === level);
      if (search) {
        const s = search.toLowerCase();
        entries = entries.filter(e => e.message.toLowerCase().includes(s));
      }

      res.json(entries.slice(-limit));
    });

    // GET /api/system — process / platform metrics
    app.get('/api/system', (_req, res) => {
      const uptimeSeconds = this.startedAt
        ? Math.floor((Date.now() - this.startedAt) / 1000)
        : 0;

      const appConfig  = this.configManager.getAppConfig() || {};
      const mem        = process.memoryUsage();

      let totalBots    = 0;
      let onlineBots   = 0;
      let totalPlugins = 0;

      try {
        totalBots  = this.botManager.getProfiles().length;
        onlineBots = this.botManager
          .getStatuses()
          .filter(s => s.status === 'ONLINE').length;
      } catch (_e) {}

      try {
        totalPlugins = Object.keys(this.pluginManager.plugins).length;
      } catch (_e) {}

      res.json({
        status:          'ok',
        name:            appConfig.name    || 'MineFleet',
        version:         appConfig.version || 'unknown',
        uptime:          uptimeSeconds,
        uptimeFormatted: _formatUptime(uptimeSeconds),
        nodeVersion:     process.version,
        platform:        process.platform,
        memory: {
          usedMb:  Math.round(mem.heapUsed  / 1024 / 1024),
          totalMb: Math.round(mem.heapTotal / 1024 / 1024),
          rssMb:   Math.round(mem.rss       / 1024 / 1024),
        },
        bots: {
          total:  totalBots,
          online: onlineBots,
        },
        plugins:    totalPlugins,
        logEntries: _logBuffer.length,
      });
    });

    // GET /api/console/logs — phase 2.3 live console structured event buffer
    app.get('/api/console/logs', (req, res) => {
      const since = parseInt(req.query.since, 10) || 0;
      const serverId = req.query.serverId;
      let events = ConsoleBuffer.getEventsSince(since);
      
      // Filter logs to only bots on the selected server (and SYSTEM logs)
      if (serverId) {
        events = events.filter(e => {
          if (e.botUsername === 'System' || e.botUsername === 'SYSTEM') return true;
          // Find the profile by username (assuming username is unique PER server, we can just check if any bot on this server matches the username)
          const p = Object.values(this.botManager.profiles).find(
            prof => (prof.username === e.botUsername || prof.id === e.botUsername) && prof.serverId === serverId
          );
          return !!p;
        });
      }
      res.json(events);
    });

    // ── Phase 2.1: Fleet Management endpoints ───────────────────────────────

    // GET /api/fleet/bots — all bots, optionally filtered by serverId
    app.get('/api/fleet/bots', (req, res) => {
      const serverId = req.query.serverId;
      let statuses = this.botManager.getDetailedStatuses();
      if (serverId) {
        statuses = statuses.filter(s => s.profile.serverId === serverId);
      }
      res.json(statuses);
    });

    // GET /api/fleet/bots/:id/details — single bot full details panel
    app.get('/api/fleet/bots/:id/details', (req, res) => {
      const details = this.botManager.getDetailedStatus(req.params.id);
      if (!details) {
        return res.status(404).json(_errResponse(`Bot '${req.params.id}' not found`, 404));
      }
      res.json(details);
    });

    // POST /api/fleet/bots — add a new bot
    // Body: { id, username, host, port, version, enabled?, autoReconnect? }
    app.post('/api/fleet/bots', (req, res) => {
      const config = req.body || {};
      const result = this.botManager.addBot(config);
      if (!result.ok) {
        fleetLog('ADD_BOT', config.id || '?', config.username || '?', 'fail', { error: result.error });
        return res.status(400).json(_errResponse(result.error));
      }
      res.status(201).json(_okResponse('ADD_BOT', config.id, config.username));
    });

    // DELETE /api/fleet/bots/:id — remove a bot
    app.delete('/api/fleet/bots/:id', (req, res) => {
      const id      = req.params.id;
      const profile = this.botManager.getProfile(id);
      const username = profile?.username || id;

      const result = this.botManager.removeBot(id);
      if (!result.ok) {
        fleetLog('REMOVE_BOT', id, username, 'fail', { error: result.error });
        return res.status(404).json(_errResponse(result.error, 404));
      }
      res.json(_okResponse('REMOVE_BOT', id, username));
    });

    // PATCH /api/fleet/bots/:id/rename — rename a bot
    // Body: { username }
    app.patch('/api/fleet/bots/:id/rename', (req, res) => {
      const id          = req.params.id;
      const newUsername = req.body?.username;
      const profile     = this.botManager.getProfile(id);
      const oldUsername = profile?.username || id;

      const result = this.botManager.renameBot(id, newUsername);
      if (!result.ok) {
        fleetLog('RENAME_BOT', id, oldUsername, 'fail', { error: result.error });
        return res.status(400).json(_errResponse(result.error));
      }
      res.json(_okResponse('RENAME_BOT', id, newUsername, {
        oldUsername: result.oldUsername,
        newUsername: result.newUsername,
      }));
    });

    // POST /api/fleet/bots/:id/start — start a stopped bot
    app.post('/api/fleet/bots/:id/start', (req, res) => {
      const id      = req.params.id;
      const profile = this.botManager.getProfile(id);
      if (!profile) {
        return res.status(404).json(_errResponse(`Bot '${id}' not found`, 404));
      }

      fleetLog('START', id, profile.username, 'ok');
      this.botManager.startBot(id);
      res.json(_okResponse('START', id, profile.username));
    });

    // POST /api/fleet/bots/:id/stop — intentionally stop a bot (no reconnect)
    app.post('/api/fleet/bots/:id/stop', (req, res) => {
      const id      = req.params.id;
      const profile = this.botManager.getProfile(id);
      if (!profile) {
        return res.status(404).json(_errResponse(`Bot '${id}' not found`, 404));
      }

      // fleetLog is called inside stopBot() for intentional stops
      this.botManager.stopBot(id, true);
      res.json(_okResponse('STOP', id, profile.username, { intentional: true }));
    });

    // ── Phase 2.5: World Map endpoints ──────────────────────────────────────
    
    // GET /api/map/positions — all bot and owner positions
    app.get('/api/map/positions', (req, res) => {
      const serverId = req.query.serverId;
      const positions = [];
      const perms = this.configManager.getPermissions();
      const ownerUsername = perms ? perms.owner : null;

      let bestOwnerDimension = null;
      let bestOwnerPos = null;

      let profiles = this.botManager.getProfiles();
      if (serverId) profiles = profiles.filter(p => p.serverId === serverId);

      for (const profile of profiles) {
        const liveBot = this.botManager.botEngine?.getBot(profile.id);
        if (!liveBot) continue;

        const dimension = liveBot.game?.dimension || 'minecraft:overworld';
        const botPos = liveBot.entity?.position;
        
        if (ownerUsername && liveBot.players && liveBot.players[ownerUsername]?.entity) {
            bestOwnerPos = liveBot.players[ownerUsername].entity.position;
            bestOwnerDimension = dimension;
        }

        let destination = null;
        try {
            const tm = this.botManager.getTaskManager(profile.id);
            const active = tm.getActive();
            if (active) {
                const gotoMatch = active.name.match(/^goto\(([-.\d]+),([-.\d]+),([-.\d]+)\)$/);
                if (gotoMatch) {
                    destination = { x: parseFloat(gotoMatch[1]), z: parseFloat(gotoMatch[3]) };
                }
                const followMatch = active.name.match(/^follow\(([^)]+)\)$/);
                if (followMatch) {
                    const targetName = followMatch[1];
                    if (liveBot.players[targetName]?.entity) {
                        const tPos = liveBot.players[targetName].entity.position;
                        destination = { x: tPos.x, z: tPos.z };
                    }
                }
            }
        } catch (e) {}

        if (botPos) {
          positions.push({
            type: 'bot',
            id: profile.id,
            username: profile.username,
            x: botPos.x,
            z: botPos.z,
            dimension,
            destination
          });
        }
      }

      if (ownerUsername && bestOwnerPos) {
          positions.push({
              type: 'owner',
              username: ownerUsername,
              x: bestOwnerPos.x,
              z: bestOwnerPos.z,
              dimension: bestOwnerDimension
          });
      }

      res.json(positions);
    });

    // POST /api/fleet/bots/:id/restart — restart a bot
    app.post('/api/fleet/bots/:id/restart', (req, res) => {
      const id      = req.params.id;
      const profile = this.botManager.getProfile(id);
      if (!profile) {
        return res.status(404).json(_errResponse(`Bot '${id}' not found`, 404));
      }

      // fleetLog is called inside restartBot()
      this.botManager.restartBot(id);
      res.json(_okResponse('RESTART', id, profile.username));
    });

    // PATCH /api/fleet/bots/:id/autoreconnect — enable/disable autoReconnect
    // Body: { enabled: true|false }
    app.patch('/api/fleet/bots/:id/autoreconnect', (req, res) => {
      const id      = req.params.id;
      const enabled = req.body?.enabled;

      if (typeof enabled !== 'boolean') {
        return res.status(400).json(_errResponse('Body must include { "enabled": true|false }'));
      }

      const result = this.botManager.setAutoReconnect(id, enabled);
      if (!result.ok) {
        return res.status(404).json(_errResponse(result.error, 404));
      }

      const profile = this.botManager.getProfile(id);
      res.json(_okResponse('AUTORECONNECT', id, profile?.username || id, { autoReconnect: enabled }));
    });

    // POST /api/bots/:id/command — phase 2.2 remote commands
    app.post('/api/bots/:id/command', (req, res) => {
      const id = req.params.id;
      const cmd = req.body;
      const profile = this.botManager.getProfile(id);

      if (!profile) {
        return res.status(404).json(_errResponse(`Bot '${id}' not found`, 404));
      }

      const liveBot = this.botManager.botEngine?.getBot(id);
      const status = this.botManager.getStatus(id)?.status;

      if (!liveBot || status !== 'ONLINE') {
        return res.status(400).json(_errResponse(`Bot '${id}' is offline or reconnecting`, 400));
      }

      const mm = this.botManager.getMovementManager(id);
      let task = null;

      try {
        switch (cmd.command) {
          case 'goto':
            if (cmd.x === undefined || cmd.y === undefined || cmd.z === undefined) {
              return res.status(400).json(_errResponse('Missing x, y, or z parameters for goto'));
            }
            if (!mm) return res.status(400).json(_errResponse('Movement system not available'));
            task = new GotoTask(Number(cmd.x), Number(cmd.y), Number(cmd.z), mm);
            break;
          case 'follow':
            if (!cmd.target) return res.status(400).json(_errResponse('Missing target parameter for follow'));
            if (!mm) return res.status(400).json(_errResponse('Movement system not available'));
            const playerEntry = liveBot.players[cmd.target];
            if (!playerEntry || !playerEntry.entity) {
              return res.status(400).json(_errResponse(`Player "${cmd.target}" not found or not in range`));
            }
            task = new FollowTask(playerEntry.entity, cmd.target, mm);
            break;
          case 'look':
            if (cmd.x === undefined || cmd.y === undefined || cmd.z === undefined) {
              return res.status(400).json(_errResponse('Missing x, y, or z parameters for look'));
            }
            if (!mm) return res.status(400).json(_errResponse('Movement system not available'));
            task = new LookAtTask(Number(cmd.x), Number(cmd.y), Number(cmd.z), mm);
            break;
          case 'stop':
            if (!mm) return res.status(400).json(_errResponse('Movement system not available'));
            task = new StopTask(mm);
            break;
          case 'jump':
            task = new JumpTask(liveBot);
            break;
          case 'sneak':
            task = new SneakTask(liveBot, !!cmd.enabled);
            break;
          case 'attack':
            task = new AttackTask(liveBot, cmd.target);
            break;
          case 'mine':
          case 'place':
            if (cmd.x === undefined || cmd.y === undefined || cmd.z === undefined) {
              return res.status(400).json(_errResponse(`Missing x, y, or z parameters for ${cmd.command}`));
            }
            task = new BotActionTask(liveBot, cmd.command, { x: Number(cmd.x), y: Number(cmd.y), z: Number(cmd.z) });
            break;
          case 'use':
            task = new BotActionTask(liveBot, cmd.command);
            break;
          default:
            return res.status(400).json(_errResponse(`Unknown command: ${cmd.command}`));
        }

        if (task) {
          this.botManager.assignTask(id, task);
          fleetLog(`CMD_${cmd.command.toUpperCase()}`, id, profile.username, 'ok', { params: cmd });
          res.json(_okResponse(`CMD_${cmd.command.toUpperCase()}`, id, profile.username, { params: cmd }));
        }
      } catch (err) {
        fleetLog(`CMD_${cmd.command?.toUpperCase() || 'UNKNOWN'}`, id, profile.username, 'fail', { error: err.message });
        res.status(500).json(_errResponse(`Command failed: ${err.message}`, 500));
      }
    });

    // ── Phase 2.6: Inventory Management Endpoints ───────────────────────────

    // GET /api/bots/:id/inventory — expose real-time inventory state
    app.get('/api/bots/:id/inventory', (req, res) => {
      const id = req.params.id;
      const liveBot = this.botManager.botEngine?.getBot(id);
      
      if (!liveBot) {
        return res.status(404).json(_errResponse(`Bot '${id}' is offline or not found`, 404));
      }

      try {
        const inv = liveBot.inventory;
        const slots = inv.slots.map((item, index) => {
          if (!item) return { slot: index, empty: true };
          return {
            slot: index,
            name: item.name,
            displayName: item.displayName,
            count: item.count,
            type: item.type,
            maxDurability: item.maxDurability,
            durabilityUsed: item.durabilityUsed
          };
        });

        res.json({
          slots,
          quickBarSlot: liveBot.quickBarSlot,
          equipment: {
            head: liveBot.equipment[5] ? liveBot.equipment[5].name : null,
            torso: liveBot.equipment[6] ? liveBot.equipment[6].name : null,
            legs: liveBot.equipment[7] ? liveBot.equipment[7].name : null,
            feet: liveBot.equipment[8] ? liveBot.equipment[8].name : null,
            'off-hand': liveBot.equipment[45] ? liveBot.equipment[45].name : null,
            hand: liveBot.heldItem ? liveBot.heldItem.name : null
          }
        });
      } catch (err) {
        res.status(500).json(_errResponse(`Failed to read inventory: ${err.message}`, 500));
      }
    });

    // POST /api/bots/:id/inventory/action — dispatch inventory tasks
    app.post('/api/bots/:id/inventory/action', (req, res) => {
      const id = req.params.id;
      const action = req.body;
      const profile = this.botManager.getProfile(id);

      if (!profile) {
        return res.status(404).json(_errResponse(`Bot '${id}' not found`, 404));
      }

      const liveBot = this.botManager.botEngine?.getBot(id);
      const status = this.botManager.getStatus(id)?.status;

      if (!liveBot || status !== 'ONLINE') {
        return res.status(400).json(_errResponse(`Bot '${id}' is offline or reconnecting`, 400));
      }

      let task = null;
      try {
        switch (action.type) {
          case 'move':
            if (action.sourceSlot === undefined || action.destSlot === undefined) {
              return res.status(400).json(_errResponse('Missing sourceSlot or destSlot'));
            }
            task = new MoveItemTask(liveBot, Number(action.sourceSlot), Number(action.destSlot));
            break;
          case 'equip':
            if (!action.destination || action.itemId === undefined) {
              return res.status(400).json(_errResponse('Missing destination or itemId'));
            }
            task = new EquipTask(liveBot, action.destination, Number(action.itemId));
            break;
          case 'drop':
            if (action.slotId === undefined) {
              return res.status(400).json(_errResponse('Missing slotId'));
            }
            task = new DropTask(liveBot, Number(action.slotId), action.count ? Number(action.count) : undefined);
            break;
          case 'consume':
            task = new ConsumeTask(liveBot);
            break;
          default:
            return res.status(400).json(_errResponse(`Unknown inventory action: ${action.type}`));
        }

        if (task) {
          this.botManager.assignTask(id, task);
          fleetLog(`CMD_INVENTORY_${action.type.toUpperCase()}`, id, profile.username, 'ok', { params: action });
          res.json(_okResponse(`CMD_INVENTORY_${action.type.toUpperCase()}`, id, profile.username, { params: action }));
        }
      } catch (err) {
        fleetLog(`CMD_INVENTORY_${action.type?.toUpperCase() || 'UNKNOWN'}`, id, profile.username, 'fail', { error: err.message });
        res.status(500).json(_errResponse(`Inventory action failed: ${err.message}`, 500));
      }
    });

    // ── Bulk actions ────────────────────────────────────────────────────────

    // POST /api/fleet/bulk/start — start all bots (staggered in BotManager)
    app.post('/api/fleet/bulk/start', (req, res) => {
      const serverId = req.query.serverId;
      fleetLog('BULK_START_ALL', 'ALL', 'ALL', 'ok', { serverId });
      this.botManager.startAll(serverId);
      res.json({ ok: true, action: 'BULK_START', timestamp: new Date().toISOString() });
    });

    // POST /api/fleet/bulk/stop — stop all bots (staggered in BotManager)
    app.post('/api/fleet/bulk/stop', (req, res) => {
      const serverId = req.query.serverId;
      fleetLog('BULK_STOP_ALL', 'ALL', 'ALL', 'ok', { serverId });
      this.botManager.stopAll(serverId);
      res.json({ ok: true, action: 'BULK_STOP', timestamp: new Date().toISOString() });
    });

    // POST /api/fleet/bulk/restart — restart all bots (staggered in BotManager)
    app.post('/api/fleet/bulk/restart', (req, res) => {
      const serverId = req.query.serverId;
      fleetLog('BULK_RESTART_ALL', 'ALL', 'ALL', 'ok', { serverId });
      this.botManager.restartAll(serverId);
      res.json({ ok: true, action: 'BULK_RESTART', timestamp: new Date().toISOString() });
    });

    // POST /api/fleet/bulk/follow — follow a named player with all bots (staggered)
    // Body: { target: "playerUsername" }
    app.post('/api/fleet/bulk/follow', (req, res) => {
      const target = req.body?.target;
      if (!target || typeof target !== 'string') {
        return res.status(400).json(_errResponse('Body must include { "target": "playerUsername" }'));
      }

      const serverId = req.query.serverId;
      let profiles = this.botManager.getProfiles();
      if (serverId) profiles = profiles.filter(p => p.serverId === serverId);
      
      let scheduled  = 0;
      let skipped    = 0;

      profiles.forEach((profile, i) => {
        setTimeout(() => {
          const liveBot = this.botManager.botEngine?.getBot(profile.id);
          if (!liveBot) {
            fleetLog('BULK_FOLLOW', profile.id, profile.username, 'fail', { reason: 'bot_offline', target });
            skipped++;
            return;
          }

          const entity = liveBot.players?.[target]?.entity;
          if (!entity) {
            fleetLog('BULK_FOLLOW', profile.id, profile.username, 'fail', { reason: 'target_not_visible', target });
            skipped++;
            return;
          }

          const mm = this.botManager.getMovementManager(profile.id);
          if (!mm) {
            fleetLog('BULK_FOLLOW', profile.id, profile.username, 'fail', { reason: 'no_movement_manager', target });
            skipped++;
            return;
          }

          const task = new FollowTask(entity, target, mm, 2, 0);
          this.botManager.assignTask(profile.id, task);
          fleetLog('BULK_FOLLOW', profile.id, profile.username, 'ok', { target });
          scheduled++;
        }, i * BULK_STAGGER_MS);
      });

      res.json({
        ok:        true,
        action:    'BULK_FOLLOW',
        target,
        total:     profiles.length,
        timestamp: new Date().toISOString(),
        note:      'Tasks dispatched asynchronously with stagger. Check /api/logs for per-bot results.',
      });
    });

    // POST /api/fleet/bulk/gohome — send all bots to the home position from app.json
    app.post('/api/fleet/bulk/gohome', (_req, res) => {
      const appConfig = this.configManager.getAppConfig();
      const home      = appConfig?.home;

      if (!home || home.x === undefined || home.y === undefined || home.z === undefined) {
        return res.status(400).json(_errResponse(
          'No home coordinates configured. Add { "home": { "x": 0, "y": 64, "z": 0 } } to config/app.json'
        ));
      }

      const { x, y, z } = home;
      const serverId = req.query.serverId;
      let profiles = this.botManager.getProfiles();
      if (serverId) profiles = profiles.filter(p => p.serverId === serverId);

      profiles.forEach((profile, i) => {
        setTimeout(() => {
          const liveBot = this.botManager.botEngine?.getBot(profile.id);
          if (!liveBot) {
            fleetLog('BULK_GOHOME', profile.id, profile.username, 'fail', { reason: 'bot_offline', x, y, z });
            return;
          }

          const mm = this.botManager.getMovementManager(profile.id);
          if (!mm) {
            fleetLog('BULK_GOHOME', profile.id, profile.username, 'fail', { reason: 'no_movement_manager', x, y, z });
            return;
          }

          const task = new GotoTask(x, y, z, mm, 0);
          this.botManager.assignTask(profile.id, task);
          fleetLog('BULK_GOHOME', profile.id, profile.username, 'ok', { x, y, z });
        }, i * BULK_STAGGER_MS);
      });

      res.json({
        ok:        true,
        action:    'BULK_GOHOME',
        home:      { x, y, z },
        total:     profiles.length,
        timestamp: new Date().toISOString(),
        note:      'Tasks dispatched asynchronously with stagger. Check /api/logs for per-bot results.',
      });
    });

    // ── Phase 2.7: Plugin Manager Endpoints ─────────────────────────────────

    app.get('/api/plugins', (_req, res) => {
      const plugins = this.pluginManager.plugins;
      const result = Object.values(plugins).map(p => ({
        name: p.name,
        version: p.version,
        description: p.description,
        enabled: p.enabled
      }));
      res.json(result);
    });

    app.post('/api/plugins/:name/enable', (req, res) => {
      const name = req.params.name;
      try {
        const success = this.pluginManager.enablePlugin(name);
        if (success) {
          res.json({ ok: true, message: `Plugin ${name} enabled` });
        } else {
          res.status(400).json(_errResponse(`Plugin ${name} is already enabled`, 400));
        }
      } catch (err) {
        res.status(500).json(_errResponse(`Failed to enable ${name}: ${err.message}`, 500));
      }
    });

    app.post('/api/plugins/:name/disable', (req, res) => {
      const name = req.params.name;
      try {
        const success = this.pluginManager.disablePlugin(name);
        if (success) {
          res.json({ ok: true, message: `Plugin ${name} disabled` });
        } else {
          res.status(400).json(_errResponse(`Plugin ${name} is already disabled`, 400));
        }
      } catch (err) {
        res.status(500).json(_errResponse(`Failed to disable ${name}: ${err.message}`, 500));
      }
    });

    app.post('/api/plugins/:name/reload', (req, res) => {
      const name = req.params.name;
      try {
        this.pluginManager.reloadPlugin(name);
        res.json({ ok: true, message: `Plugin ${name} reloaded (state reset)` });
      } catch (err) {
        res.status(500).json(_errResponse(`Failed to reload ${name}: ${err.message}`, 500));
      }
    });
    // ── Phase 2.9: Servers Endpoints ─────────────────────────────────

    app.get('/api/servers', (_req, res) => {
      res.json(this.configManager.getServers());
    });

    app.post('/api/servers', (req, res) => {
      const { name, host, port, version } = req.body;
      if (!name || !host || !port || !version) {
        return res.status(400).json(_errResponse('Missing required fields'));
      }

      const servers = this.configManager.getServers();
      const id = `server_${Date.now()}`;
      servers.push({ id, name, host, port: Number(port), version });
      
      if (this.configManager.saveServers(servers)) {
        fleetLog('SERVER_CREATE', 'SYSTEM', 'SYSTEM', 'ok', { serverId: id, name });
        res.status(201).json({ ok: true, id });
      } else {
        res.status(500).json(_errResponse('Failed to save servers'));
      }
    });

    app.delete('/api/servers/:id', (req, res) => {
      const servers = this.configManager.getServers();
      const filtered = servers.filter(s => s.id !== req.params.id);
      
      if (filtered.length === servers.length) {
        return res.status(404).json(_errResponse('Server not found', 404));
      }

      if (this.configManager.saveServers(filtered)) {
        fleetLog('SERVER_DELETE', 'SYSTEM', 'SYSTEM', 'ok', { serverId: req.params.id });
        res.json({ ok: true });
      } else {
        res.status(500).json(_errResponse('Failed to save servers'));
      }
    });

    // ── Phase 2.8: Fleet Profiles Endpoints ─────────────────────────────────

    app.get('/api/fleet/profiles', (_req, res) => {
      res.json(this.configManager.getFleetProfiles());
    });

    app.post('/api/fleet/profiles', (req, res) => {
      const { name, bots, defaultAutoReconnect } = req.body;
      if (!name || !bots) return res.status(400).json(_errResponse('Missing name or bots array'));

      const profiles = this.configManager.getFleetProfiles();
      const id = `profile_${Date.now()}`;
      profiles.push({ id, name, bots, defaultAutoReconnect: !!defaultAutoReconnect });
      
      if (this.configManager.saveFleetProfiles(profiles)) {
        fleetLog('PROFILE_CREATE', 'SYSTEM', 'SYSTEM', 'ok', { profileId: id, name });
        res.status(201).json({ ok: true, id });
      } else {
        res.status(500).json(_errResponse('Failed to save profiles'));
      }
    });

    app.put('/api/fleet/profiles/:id', (req, res) => {
      const { name, bots, defaultAutoReconnect } = req.body;
      const profiles = this.configManager.getFleetProfiles();
      const idx = profiles.findIndex(p => p.id === req.params.id);
      
      if (idx === -1) return res.status(404).json(_errResponse('Profile not found', 404));

      profiles[idx] = { ...profiles[idx], name, bots, defaultAutoReconnect: !!defaultAutoReconnect };
      
      if (this.configManager.saveFleetProfiles(profiles)) {
        fleetLog('PROFILE_UPDATE', 'SYSTEM', 'SYSTEM', 'ok', { profileId: req.params.id, name });
        res.json({ ok: true });
      } else {
        res.status(500).json(_errResponse('Failed to save profiles'));
      }
    });

    app.delete('/api/fleet/profiles/:id', (req, res) => {
      const profiles = this.configManager.getFleetProfiles();
      const filtered = profiles.filter(p => p.id !== req.params.id);
      
      if (filtered.length === profiles.length) {
        return res.status(404).json(_errResponse('Profile not found', 404));
      }

      if (this.configManager.saveFleetProfiles(filtered)) {
        fleetLog('PROFILE_DELETE', 'SYSTEM', 'SYSTEM', 'ok', { profileId: req.params.id });
        res.json({ ok: true });
      } else {
        res.status(500).json(_errResponse('Failed to save profiles'));
      }
    });

    app.post('/api/fleet/profiles/:id/deploy', (req, res) => {
      const serverId = req.query.serverId;
      const profile = this.configManager.getFleetProfiles().find(p => p.id === req.params.id);
      if (!profile) return res.status(404).json(_errResponse('Profile not found', 404));

      let scheduled = 0;
      let skipped = 0;
      const botsToStart = [];

      profile.bots.forEach(botConfig => {
        const targetServerId = serverId || botConfig.serverId || profile.targetServerId || 'default';
        const existingProfile = Object.values(this.botManager.profiles).find(
          p => p.username === botConfig.username && p.serverId === targetServerId
        );
        if (existingProfile) {
          const status = this.botManager.runtimes[existingProfile.id]?.status;
          if (status === 'ONLINE' || status === 'CONNECTING') {
            fleetLog('DEPLOY_SKIP', existingProfile.id, existingProfile.username, 'skip', { reason: 'already_running', profileName: profile.name });
            skipped++;
          } else {
            // Apply default autoReconnect
            this.botManager.setAutoReconnect(existingProfile.id, botConfig.autoReconnect ?? profile.defaultAutoReconnect ?? true);
            botsToStart.push({ id: existingProfile.id, username: existingProfile.username, action: 'start' });
          }
        } else {
          const newId = `bot_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
          const newConfig = {
            id: newId,
            username: botConfig.username,
            serverId: targetServerId,
            host: botConfig.host,
            port: botConfig.port,
            version: botConfig.version,
            enabled: true,
            autoReconnect: botConfig.autoReconnect ?? profile.defaultAutoReconnect ?? true
          };
          botsToStart.push({ id: newId, username: newConfig.username, action: 'add', config: newConfig });
        }
      });

      // Stagger deployments
      botsToStart.forEach((botDeploy, i) => {
        if (botDeploy.action === 'add') {
          // addBot handles stagger automatically via _scheduleInitialStart since enabled = true
          this.botManager.addBot(botDeploy.config);
          fleetLog('DEPLOY_ADD', botDeploy.id, botDeploy.username, 'ok', { profileName: profile.name });
        } else {
          setTimeout(() => {
            this.botManager.startBot(botDeploy.id);
            fleetLog('DEPLOY_START', botDeploy.id, botDeploy.username, 'ok', { profileName: profile.name });
          }, i * BULK_STAGGER_MS);
        }
        scheduled++;
      });

      fleetLog('PROFILE_DEPLOY', 'SYSTEM', 'SYSTEM', 'ok', { profileId: req.params.id, name: profile.name, scheduled, skipped });
      res.json({ ok: true, scheduled, skipped });
    });
  }
}

module.exports = DashboardServer;
