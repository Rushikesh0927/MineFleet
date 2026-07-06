/**
 * core/KeepAlive.js
 *
 * Replit Free Plan Keep-Alive System
 *
 * ROOT CAUSE OF THE DISCONNECT PROBLEM:
 *   Replit's free "autoscale" deployment goes to sleep when no HTTP requests
 *   arrive for ~5 minutes. When it sleeps, the entire Node.js process is
 *   suspended. All Mineflayer TCP connections are dropped. When it wakes up
 *   (on the next HTTP request), the bots need to reconnect via autoReconnect.
 *
 *   A Google Apps Script pinging once per minute SHOULD prevent sleep, but
 *   there are two failure modes:
 *     1. The GAS script itself has gaps (quota limits, execution delays)
 *     2. The Replit wake-up takes >30s — during which the ping returns and
 *        GAS marks it as "up" but the bot connections never recovered
 *
 * THIS MODULE FIXES IT WITH THREE LAYERS:
 *
 *   Layer 1 — Internal self-ping (every 28 seconds)
 *     The server pings its own /health endpoint via HTTP. This keeps the
 *     Node.js event loop from going completely idle even when no browser
 *     or external pinger is connected. Works even on the same process.
 *
 *   Layer 2 — External URL ping (every 55 seconds)
 *     If REPLIT_URL is set in env, pings the public URL. This wakes Replit
 *     from any idle state before the 5-minute sleep timer fires.
 *     (Set REPLIT_URL = your published Replit app URL in the Replit secrets)
 *
 *   Layer 3 — Reconnect health check (every 60 seconds)
 *     Scans all bots. If a bot has been DISCONNECTED or RECONNECTING for
 *     more than 90 seconds without recovering, forces a fresh reconnect
 *     attempt. This catches the case where autoReconnect scheduled a timer
 *     but the process was suspended and the timer never fired.
 *
 * SETUP:
 *   1. In Replit Secrets (the padlock icon), add:
 *        REPLIT_URL = https://your-app-name.repl.co
 *        DASHBOARD_PORT = 3000   (already set if you have it)
 *
 *   2. Keep your Google Apps Script running (it's a useful backup).
 *
 *   3. For best results, also add a free UptimeRobot monitor:
 *        https://uptimerobot.com — ping your URL every 5 minutes (free tier)
 *        Combined with the internal ping, this virtually eliminates sleeps.
 */

const http  = require('http');
const https = require('https');

// ── Timing constants ────────────────────────────────────────────────────────
const SELF_PING_INTERVAL_MS    = 28_000;   // Internal self-ping every 28s
const EXTERNAL_PING_INTERVAL_MS = 55_000;  // External URL ping every 55s
const HEALTH_CHECK_INTERVAL_MS  = 60_000;  // Bot health scan every 60s
const STALE_THRESHOLD_MS        = 90_000;  // Bot considered stuck after 90s offline

function ts() {
  return new Date().toISOString();
}

class KeepAlive {
  /**
   * @param {BotManager} botManager — used by Layer 3 health check
   * @param {BotEngine}  botEngine  — used by Layer 3 to force-reconnect stuck bots
   */
  constructor(botManager, botEngine) {
    this.botManager = botManager;
    this.botEngine  = botEngine;

    this._selfPingTimer    = null;
    this._externalPingTimer = null;
    this._healthCheckTimer  = null;

    // Track when each bot entered a non-ONLINE state
    this._offlineSince = {};
  }

  /**
   * Starts all three keep-alive layers.
   * Call this after the HTTP server is fully started.
   *
   * @param {number} port — the port the DashboardServer is listening on
   */
  start(port) {
    console.log(`[KeepAlive] Starting keep-alive system (port=${port})`);

    this._startSelfPing(port);
    this._startExternalPing();
    this._startHealthCheck();
  }

  /**
   * Stops all timers cleanly on shutdown.
   */
  stop() {
    if (this._selfPingTimer)     { clearInterval(this._selfPingTimer);     this._selfPingTimer     = null; }
    if (this._externalPingTimer) { clearInterval(this._externalPingTimer); this._externalPingTimer = null; }
    if (this._healthCheckTimer)  { clearInterval(this._healthCheckTimer);  this._healthCheckTimer  = null; }
    console.log('[KeepAlive] Stopped');
  }

  // ── Layer 1: Internal self-ping ─────────────────────────────────────────

  _startSelfPing(port) {
    this._selfPingTimer = setInterval(() => {
      const req = http.request(
        { hostname: '127.0.0.1', port, path: '/health', method: 'GET', timeout: 5000 },
        (res) => {
          // Drain the response body so the socket closes cleanly
          res.resume();
          console.log(`[KeepAlive] Self-ping OK | status=${res.statusCode} | ${ts()}`);
        },
      );
      req.on('error', (err) => {
        console.warn(`[KeepAlive] Self-ping failed | ${err.message} | ${ts()}`);
      });
      req.on('timeout', () => {
        req.destroy();
        console.warn(`[KeepAlive] Self-ping timed out | ${ts()}`);
      });
      req.end();
    }, SELF_PING_INTERVAL_MS);

    // .unref() so the timer doesn't prevent clean shutdown
    if (this._selfPingTimer.unref) this._selfPingTimer.unref();
    console.log(`[KeepAlive] Layer 1: Self-ping every ${SELF_PING_INTERVAL_MS / 1000}s`);
  }

  // ── Layer 2: External URL ping ───────────────────────────────────────────

  _startExternalPing() {
    const externalUrl = process.env.REPLIT_URL;

    if (!externalUrl) {
      console.log('[KeepAlive] Layer 2: Skipped — set REPLIT_URL secret to enable external ping');
      return;
    }

    const lib = externalUrl.startsWith('https') ? https : http;

    this._externalPingTimer = setInterval(() => {
      const req = lib.request(
        `${externalUrl}/health`,
        { method: 'GET', timeout: 10_000 },
        (res) => {
          res.resume();
          console.log(`[KeepAlive] External ping OK | url=${externalUrl} | status=${res.statusCode} | ${ts()}`);
        },
      );
      req.on('error', (err) => {
        console.warn(`[KeepAlive] External ping failed | ${err.message} | ${ts()}`);
      });
      req.on('timeout', () => {
        req.destroy();
        console.warn(`[KeepAlive] External ping timed out | url=${externalUrl} | ${ts()}`);
      });
      req.end();
    }, EXTERNAL_PING_INTERVAL_MS);

    if (this._externalPingTimer.unref) this._externalPingTimer.unref();
    console.log(`[KeepAlive] Layer 2: External ping every ${EXTERNAL_PING_INTERVAL_MS / 1000}s → ${externalUrl}`);
  }

  // ── Layer 3: Bot health check / stuck-reconnect recovery ────────────────

  _startHealthCheck() {
    this._healthCheckTimer = setInterval(() => {
      const profiles = this.botManager.getProfiles();
      const now      = Date.now();

      for (const profile of profiles) {
        const status = this.botManager.getStatus(profile.id);
        if (!status) continue;

        if (status.status === 'ONLINE') {
          // Bot is healthy — reset its offline timer
          delete this._offlineSince[profile.id];
          continue;
        }

        // Bot is not online — track how long it has been in this state
        if (!this._offlineSince[profile.id]) {
          this._offlineSince[profile.id] = now;
          continue;
        }

        const offlineFor = now - this._offlineSince[profile.id];

        if (offlineFor > STALE_THRESHOLD_MS) {
          console.warn(
            `[KeepAlive] Layer 3: ${profile.username} has been ${status.status}` +
            ` for ${Math.round(offlineFor / 1000)}s — forcing reconnect | ${ts()}`,
          );

          // Cancel any stale reconnect timer that may have been frozen
          const timerInfo = this.botEngine.reconnectTimers?.[profile.id];
          if (timerInfo) {
            clearTimeout(timerInfo.handle || timerInfo);
            delete this.botEngine.reconnectTimers[profile.id];
          }

          // Only attempt reconnect if autoReconnect is enabled
          if (profile.autoReconnect) {
            this._offlineSince[profile.id] = now; // reset so we don't hammer
            this.botManager.startBot(profile.id);
          } else {
            console.log(`[KeepAlive] ${profile.username} autoReconnect=false — skipping force-reconnect`);
          }
        }
      }
    }, HEALTH_CHECK_INTERVAL_MS);

    if (this._healthCheckTimer.unref) this._healthCheckTimer.unref();
    console.log(`[KeepAlive] Layer 3: Bot health check every ${HEALTH_CHECK_INTERVAL_MS / 1000}s (stale threshold=${STALE_THRESHOLD_MS / 1000}s)`);
  }
}

module.exports = KeepAlive;
