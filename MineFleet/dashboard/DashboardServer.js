/**
 * dashboard/DashboardServer.js
 *
 * REST API backend for the MineFleet dashboard.
 * Provides read-only endpoints for bot status, plugin info, and configuration.
 *
 * Routes:
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
 * Default port: 3000 (overridden by DASHBOARD_PORT env var)
 */

const express = require('express');

const DEFAULT_PORT = 3000;
const DEBUG = process.env.DEBUG_RECONNECT === 'true';

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
    app.use((_req, res, next) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      if (_req.method === 'OPTIONS') {
        return res.sendStatus(204);
      }
      next();
    });

    // ── Existing endpoints ──────────────────────────────────────────────────

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

    // ── New endpoints ───────────────────────────────────────────────────────

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
  }
}

module.exports = DashboardServer;
