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
 *
 * Default port: 3000 (overridden by DASHBOARD_PORT env var)
 */

const express = require('express');

const DEFAULT_PORT = 3000;

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

    // Record when the server started for uptime reporting
    this.startedAt = null;
  }

  /**
   * Registers all routes and starts the HTTP server.
   */
  initialize() {
    this._registerRoutes();

    const port = parseInt(process.env.DASHBOARD_PORT, 10) || DEFAULT_PORT;

    this.startedAt = Date.now();
    this.server = this.app.listen(port, () => {
      console.log(`[DashboardServer] REST API listening on port ${port}`);
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

    // Force JSON responses
    app.use(express.json());

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
  }
}

module.exports = DashboardServer;
