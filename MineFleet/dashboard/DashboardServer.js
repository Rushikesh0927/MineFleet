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
const FollowTask = require('../modules/tasks/FollowTask');
const GotoTask   = require('../modules/tasks/GotoTask');
const LookAtTask = require('../modules/tasks/LookAtTask');
const StopTask   = require('../modules/tasks/StopTask');
const JumpTask   = require('../modules/tasks/JumpTask');
const SneakTask  = require('../modules/tasks/SneakTask');
const AttackTask = require('../modules/tasks/AttackTask');
const BotActionTask = require('../modules/tasks/BotActionTask');
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
  constructor(botManager, pluginManager, configManager) {
    this.botManager    = botManager;
    this.pluginManager = pluginManager;
    this.configManager = configManager;

    this.app    = express();
    this.server = null;

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
    });
  }

  /**
   * Gracefully stops the HTTP server.
   */
  shutdown() {
    if (this.server) {
      this.server.close(() => {
        console.log('[DashboardServer] Server stopped.');
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Private — route registration
  // ---------------------------------------------------------------------------

  _registerRoutes() {
    const app = this.app;

    app.use(express.json());

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
    app.get('/api/bots', (_req, res) => {
      res.json(this.botManager.getStatuses());
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
    app.get('/api/tasks', (_req, res) => {
      const result = [];
      for (const profile of this.botManager.getProfiles()) {
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
      const events = ConsoleBuffer.getEventsSince(since);
      res.json(events);
    });

    // ── Phase 2.1: Fleet Management endpoints ───────────────────────────────

    // GET /api/fleet/bots — all bots, full details panel
    app.get('/api/fleet/bots', (_req, res) => {
      res.json(this.botManager.getDetailedStatuses());
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

    // ── Bulk actions ────────────────────────────────────────────────────────

    // POST /api/fleet/bulk/start — start all bots (staggered in BotManager)
    app.post('/api/fleet/bulk/start', (_req, res) => {
      fleetLog('BULK_START_ALL', 'ALL', 'ALL', 'ok');
      this.botManager.startAll();
      res.json({ ok: true, action: 'BULK_START', timestamp: new Date().toISOString() });
    });

    // POST /api/fleet/bulk/stop — stop all bots (staggered in BotManager)
    app.post('/api/fleet/bulk/stop', (_req, res) => {
      fleetLog('BULK_STOP_ALL', 'ALL', 'ALL', 'ok');
      this.botManager.stopAll();
      res.json({ ok: true, action: 'BULK_STOP', timestamp: new Date().toISOString() });
    });

    // POST /api/fleet/bulk/restart — restart all bots (staggered in BotManager)
    app.post('/api/fleet/bulk/restart', (_req, res) => {
      fleetLog('BULK_RESTART_ALL', 'ALL', 'ALL', 'ok');
      this.botManager.restartAll();
      res.json({ ok: true, action: 'BULK_RESTART', timestamp: new Date().toISOString() });
    });

    // POST /api/fleet/bulk/follow — follow a named player with all bots (staggered)
    // Body: { target: "playerUsername" }
    app.post('/api/fleet/bulk/follow', (req, res) => {
      const target = req.body?.target;
      if (!target || typeof target !== 'string') {
        return res.status(400).json(_errResponse('Body must include { "target": "playerUsername" }'));
      }

      const profiles = this.botManager.getProfiles();
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
      const profiles = this.botManager.getProfiles();

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
  }
}

module.exports = DashboardServer;
