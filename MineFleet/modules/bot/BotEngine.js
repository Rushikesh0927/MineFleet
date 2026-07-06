/**
 * modules/bot/BotEngine.js
 *
 * Interface layer between the MineFleet platform and the Mineflayer library.
 * Manages the full lifecycle of individual bot instances.
 *
 * Responsibilities:
 *   - Create Mineflayer bots from BotProfiles
 *   - Load mineflayer-pathfinder and wires a MovementManager
 *   - Tag each bot with bot._minefleetId for command handlers
 *   - Emit platform events (bot:connecting, bot:reconnecting) via EventManager
 *   - Delegate all Mineflayer event logging to EventManager
 *   - Forward chat commands to CommandManager
 *   - Handle auto-reconnect with duplicate-safe timers
 *   - Provide a clean shutdown that disconnects all bots and clears timers
 *
 * Diagnostics (items 1–13) are gated behind DEBUG_RECONNECT=true.
 * When that env var is absent or not 'true', behaviour is identical
 * to the pre-diagnostic version.
 */

const mineflayer      = require('mineflayer');
const MovementManager = require('../movement/MovementManager');

// ─── Debug flag (item 14) ────────────────────────────────────────────────────
const DEBUG = process.env.DEBUG_RECONNECT === 'true';

// ─── Reconnect timing (item 3) ───────────────────────────────────────────────
const RECONNECT_MIN_MS = 15_000;
const RECONNECT_MAX_MS = 30_000;

// ─── Helpers ─────────────────────────────────────────────────────────────────
function randMs(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function ts() {
  return new Date().toISOString();
}

/** Only logs when DEBUG_RECONNECT=true (item 14 gate) */
function dlog(...args) {
  if (DEBUG) console.log(...args);
}

// ─────────────────────────────────────────────────────────────────────────────

class BotEngine {
  constructor() {
    // Active Mineflayer bot instances keyed by bot ID
    this.bots = {};

    // Active MovementManager instances keyed by bot ID
    this.movementManagers = {};

    // Active reconnect timers keyed by bot ID (prevents duplicate timers)
    this.reconnectTimers = {};

    // Injected during initialize()
    this.eventManager   = null;
    this.commandManager = null;

    // ── Diagnostic state (items 1, 6, 7, 12) ──────────────────────────────
    // Per-bot lifecycle phase timestamps
    this._timings = {};

    // Per-bot last-known state strings (for previous-state logging)
    this._states = {};

    // Per-bot reconnect attempt counters
    this._reconnectAttempts = {};

    // Per-bot session start time (ms since epoch)
    this._sessionStart = {};

    // Global reconnect / session statistics (item 12)
    this._stats = {
      totalAttempts:          0,
      successfulReconnects:   0,
      totalDisconnects:       0,
      totalReconnectDuration: 0,   // ms — for averaging
      totalSessionUptime:     0,   // ms — for averaging
      sessionCount:           0,
    };

    // Background monitoring intervals
    this._elMonitorInterval    = null;
    this._registryInterval     = null;
    this._statsInterval        = null;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Public API
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Stores manager references and starts background diagnostic monitors.
   */
  initialize(eventManager, commandManager) {
    this.eventManager   = eventManager;
    this.commandManager = commandManager;

    if (DEBUG) {
      dlog(`[BotEngine][DEBUG] ── Diagnostics enabled (DEBUG_RECONNECT=true) ── ${ts()}`);
      this._startEventLoopMonitor();  // item 10
      this._startRegistryDump();      // item 11
      this._startStatsReport();       // item 12
    }

    console.log('[BotEngine] Initialized');
  }

  /**
   * Creates a Mineflayer bot from a BotProfile.
   *
   * Items implemented here:
   *   1  — full lifecycle logging with timestamps + prev/current state
   *   5  — duplicate client guard (checks connected + destroyed state)
   *   7  — connection phase timing
   *   8  — listener count check after spawn
   *   9  — keepAlive instrumentation (login hook)
   */
  createBot(profile) {
    const id   = profile.id;
    const name = profile.username;

    // ── Item 5: Prevent duplicate Mineflayer clients ──────────────────────
    const existing = this.bots[id];
    if (existing) {
      const clientAlive    = existing._client && !existing._client.ended;
      const clientDestroyed = existing._client ? !!existing._client.ended : true;
      const timerPending   = !!this.reconnectTimers[id];

      dlog(
        `[BotEngine][DUPLICATE] ${ts()} | ${name} |` +
        ` Skipping createBot(). Existing client already active.` +
        ` | connected=${clientAlive} destroyed=${clientDestroyed} reconnectPending=${timerPending}`,
      );
      if (!DEBUG) console.log(`[BotEngine] Bot ${name} already running, skipping.`);
      return;
    }

    // ── Item 1: lifecycle — CREATING ──────────────────────────────────────
    const prevState = this._states[id] || 'NONE';
    this._setState(id, 'CREATING', prevState);
    console.log(`[BotEngine] Creating Bot: ${name}`);

    // ── Item 7: start timing ──────────────────────────────────────────────
    this._timings[id] = { createBotAt: Date.now() };

    // ── Platform event: connecting ────────────────────────────────────────
    this.eventManager.emit('bot:connecting', { id, username: name });
    this._timings[id].connectingAt = Date.now();
    this._setState(id, 'CONNECTING', 'CREATING');
    dlog(
      `[BotEngine][TIMING] ${name} | createBot→connecting:` +
      ` ${this._timings[id].connectingAt - this._timings[id].createBotAt}ms`,
    );

    // ── Create the Mineflayer bot ─────────────────────────────────────────
    const bot = mineflayer.createBot({
      username: name,
      host:     profile.host,
      port:     profile.port,
      version:  profile.version,
    });

    bot._minefleetId = id;

    // Pathfinder + MovementManager
    const mm = new MovementManager();
    mm.initialize(bot);
    this.movementManagers[id] = mm;

    // Delegate lifecycle logging + platform event emissions to EventManager
    this.eventManager.register(bot, profile);

    // ── Item 1 + 7: login ─────────────────────────────────────────────────
    bot.on('login', () => {
      const prev = this._states[id] || 'CONNECTING';
      this._setState(id, 'LOGIN', prev);

      this._timings[id].loginAt     = Date.now();
      this._sessionStart[id]        = Date.now();

      dlog(
        `[BotEngine][TIMING] ${name} | connecting→login:` +
        ` ${this._timings[id].loginAt - (this._timings[id].connectingAt || this._timings[id].createBotAt)}ms`,
      );

      // Was this a successful reconnect? Record it.
      if ((this._reconnectAttempts[id] || 0) > 0 && this._timings[id].reconnectStartedAt) {
        const dur = Date.now() - this._timings[id].reconnectStartedAt;
        this._stats.successfulReconnects++;
        this._stats.totalReconnectDuration += dur;
        dlog(
          `[BotEngine][LIFECYCLE] ${ts()} | ${name} | RECONNECT_COMPLETED` +
          ` | attempt#=${this._reconnectAttempts[id]} duration=${dur}ms`,
        );
      }

      // Item 9: instrument keepAlive now that _client is available
      if (DEBUG) this._instrumentKeepAlive(bot, name, id);
    });

    // ── Item 1 + 7: spawn ─────────────────────────────────────────────────
    bot.on('spawn', () => {
      const prev = this._states[id] || 'LOGIN';
      this._setState(id, 'SPAWN', prev);
      this._timings[id].spawnAt = Date.now();

      dlog(
        `[BotEngine][TIMING] ${name} | login→spawn:` +
        ` ${this._timings[id].spawnAt - (this._timings[id].loginAt || this._timings[id].createBotAt)}ms`,
      );

      this._setState(id, 'ONLINE', 'SPAWN');
      dlog(
        `[BotEngine][TIMING] ${name} | spawn→online:` +
        ` ${Date.now() - this._timings[id].spawnAt}ms`,
      );
      dlog(
        `[BotEngine][TIMING] ${name} | total createBot→online:` +
        ` ${Date.now() - this._timings[id].createBotAt}ms`,
      );

      // Item 8: listener count audit after fully online
      if (DEBUG) this._auditListeners(bot, name);
    });

    // ── BotEngine's own 'end' handler (reconnect business logic) ──────────
    // Item 1, 4, 6, 7 are implemented inside this handler.
    bot.on('end', (reason) => {
      // Remove stale instances
      delete this.bots[id];
      delete this.movementManagers[id];
      this.eventManager.unregister(bot);

      const prevSt = this._states[id] || 'ONLINE';
      this._setState(id, 'DISCONNECTED', prevSt);

      // ── Item 6: disconnect diagnostics report ─────────────────────────
      const sessionUptime = this._sessionStart[id]
        ? Date.now() - this._sessionStart[id]
        : null;

      this._stats.totalDisconnects++;
      if (sessionUptime !== null) {
        this._stats.totalSessionUptime += sessionUptime;
        this._stats.sessionCount++;
      }

      if (DEBUG) {
        const mem = process.memoryUsage();
        dlog(`[BotEngine][DISCONNECT] ────────────────────────────────────────────`);
        dlog(`[BotEngine][DISCONNECT] bot=${name} | ts=${ts()}`);
        dlog(`[BotEngine][DISCONNECT] reason=${reason || 'unknown'} | prevState=${prevSt}`);
        dlog(`[BotEngine][DISCONNECT] reconnectAttempt#=${this._reconnectAttempts[id] || 0}`);
        dlog(`[BotEngine][DISCONNECT] sessionUptime=${sessionUptime !== null ? Math.round(sessionUptime / 1000) + 's' : 'N/A'}`);
        dlog(`[BotEngine][DISCONNECT] rss=${Math.round(mem.rss / 1024 / 1024)}MB heapUsed=${Math.round(mem.heapUsed / 1024 / 1024)}MB heapTotal=${Math.round(mem.heapTotal / 1024 / 1024)}MB`);
        dlog(`[BotEngine][DISCONNECT] ────────────────────────────────────────────`);
      }

      if (!profile.autoReconnect) return;

      // ── Item 4: prevent duplicate reconnect timers ────────────────────
      if (this.reconnectTimers[id]) {
        dlog(
          `[BotEngine][RECONNECT] ${ts()} | ${name} |` +
          ` Reconnect already scheduled. Ignoring duplicate reconnect request.`,
        );
        return;
      }

      // ── Item 3: randomized reconnect delay (15–30s) ───────────────────
      const delayMs = randMs(RECONNECT_MIN_MS, RECONNECT_MAX_MS);

      this._timings[id].disconnectedAt      = Date.now();
      this._timings[id].reconnectScheduledAt = Date.now();

      dlog(
        `[BotEngine][RECONNECT] ${ts()} | ${name} |` +
        ` scheduling reconnect in ${(delayMs / 1000).toFixed(1)}s`,
      );
      dlog(
        `[BotEngine][TIMING] ${name} | disconnect→reconnect scheduled:` +
        ` ${this._timings[id].reconnectScheduledAt - this._timings[id].disconnectedAt}ms`,
      );

      this._setState(id, 'RECONNECTING', 'DISCONNECTED');
      this._reconnectAttempts[id] = (this._reconnectAttempts[id] || 0) + 1;
      this._stats.totalAttempts++;

      console.log(`[BotEngine] ${name} reconnecting in ${(delayMs / 1000).toFixed(1)} seconds...`);
      this.eventManager.emit('bot:reconnecting', { id, username: name });

      this.reconnectTimers[id] = setTimeout(() => {
        delete this.reconnectTimers[id];

        this._timings[id].reconnectStartedAt = Date.now();

        const scheduled = this._timings[id].reconnectScheduledAt;
        if (scheduled) {
          dlog(
            `[BotEngine][TIMING] ${name} | reconnect scheduled→started:` +
            ` ${this._timings[id].reconnectStartedAt - scheduled}ms`,
          );
        }

        this._setState(id, 'RECONNECT_STARTED', 'RECONNECTING');
        console.log(`[BotEngine] ${name} reconnect attempt...`);
        this.createBot(profile);
      }, delayMs);
    });

    // ── Forward !-prefixed chat messages to CommandManager ────────────────
    bot.on('chat', (username, message) => {
      if (username === bot.username) return;
      if (message.startsWith('!')) {
        this.commandManager.execute(username, message, bot);
      }
    });

    // Store the live instance
    this.bots[id] = bot;
  }

  /**
   * Returns the MovementManager for the given bot ID, or null.
   */
  getMovementManager(id) {
    return this.movementManagers[id] || null;
  }

  /**
   * Gracefully shuts down all active bots and cancels pending reconnect timers.
   */
  shutdown() {
    // Stop background monitors
    if (this._elMonitorInterval)  { clearInterval(this._elMonitorInterval);  this._elMonitorInterval  = null; }
    if (this._registryInterval)   { clearInterval(this._registryInterval);   this._registryInterval   = null; }
    if (this._statsInterval)      { clearInterval(this._statsInterval);       this._statsInterval      = null; }

    for (const id of Object.keys(this.reconnectTimers)) {
      clearTimeout(this.reconnectTimers[id]);
      delete this.reconnectTimers[id];
    }

    for (const [id, bot] of Object.entries(this.bots)) {
      const name = bot.username || id;
      console.log(`Disconnecting ${name}...`);
      try { bot.quit(); } catch (_) {}
      delete this.bots[id];
      delete this.movementManagers[id];
    }
  }

  /**
   * Gracefully removes a single bot by ID.
   */
  removeBot(id) {
    if (this.reconnectTimers[id]) {
      clearTimeout(this.reconnectTimers[id]);
      delete this.reconnectTimers[id];
    }

    const bot = this.bots[id];
    if (bot) {
      this.eventManager.unregister(bot);
      bot.quit();
      delete this.bots[id];
      delete this.movementManagers[id];
    }

    console.log(`[BotEngine] Removed Bot: ${id}`);
  }

  /**
   * Returns the live Mineflayer bot instance for the given ID, or null.
   */
  getBot(id) {
    return this.bots[id] || null;
  }

  /**
   * Returns an array of all currently active bot IDs.
   */
  listBots() {
    return Object.keys(this.bots);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Private — diagnostic helpers (all gated by DEBUG in their callers)
  // ───────────────────────────────────────────────────────────────────────────

  /** Convenience: set and log a state transition (item 1). */
  _setState(id, newState, prevState) {
    this._states[id] = newState;
    const name = this.bots[id]?.username || id;
    dlog(`[BotEngine][LIFECYCLE] ${ts()} | ${name || id} | ${newState} | prev=${prevState}`);
  }

  /**
   * Item 9 — KeepAlive diagnostics.
   * Hooks into bot._client's packet-level 'keep_alive' incoming event.
   * Mineflayer auto-replies; we log receipt, gap between packets, and
   * dump diagnostics on a keepAliveTimeout disconnect.
   */
  _instrumentKeepAlive(bot, name, id) {
    if (!bot._client) {
      dlog(`[BotEngine][KEEPALIVE] ${name} | _client not available — skipping keepAlive instrumentation`);
      return;
    }

    const ka = { lastReceived: null, count: 0, gaps: [] };

    bot._client.on('keep_alive', (packet) => {
      const now  = Date.now();
      const gap  = ka.lastReceived !== null ? now - ka.lastReceived : null;
      ka.lastReceived = now;
      ka.count++;
      if (gap !== null) ka.gaps.push(gap);

      const avgGap = ka.gaps.length > 0
        ? Math.round(ka.gaps.reduce((a, b) => a + b, 0) / ka.gaps.length)
        : null;

      dlog(
        `[BotEngine][KEEPALIVE] ${name}` +
        ` | #${ka.count}` +
        ` | id=${packet.keepAliveId ?? packet.id ?? '?'}` +
        ` | gap=${gap !== null ? gap + 'ms' : 'first'}` +
        ` | avgGap=${avgGap !== null ? avgGap + 'ms' : 'n/a'}` +
        ` | ts=${ts()}`,
      );
    });

    // On disconnect, dump keepAlive summary; flag if it was a timeout
    bot.once('end', (reason) => {
      if (!DEBUG) return;
      const isTimeout = reason === 'keepAliveTimeout';
      dlog(
        `[BotEngine][KEEPALIVE] ${name} | session ended` +
        ` | reason=${reason}` +
        (isTimeout ? ' | ⚠️  KEEPALIVE TIMEOUT' : '') +
        ` | totalKA=${ka.count}` +
        ` | lastReceived=${ka.lastReceived ? new Date(ka.lastReceived).toISOString() : 'never'}` +
        ` | ts=${ts()}`,
      );
    });
  }

  /**
   * Item 8 — Duplicate event listener detection.
   * Prints listener counts for key Mineflayer events; warns if any > 1.
   */
  _auditListeners(bot, name) {
    const events = ['login', 'spawn', 'end', 'error', 'kicked', 'health', 'physicsTick', 'message'];
    const counts = {};
    let warned = false;

    for (const ev of events) {
      counts[ev] = bot.listenerCount(ev);
      if (counts[ev] > 1) warned = true;
    }

    dlog(`[BotEngine][LISTENERS] ${name} | ${JSON.stringify(counts)}`);
    if (warned) {
      dlog(`[BotEngine][LISTENERS] ⚠️  ${name} | Listener count > 1 detected — possible listener leak!`);
      for (const [ev, n] of Object.entries(counts)) {
        if (n > 1) dlog(`  → ${ev}: ${n} listeners`);
      }
    }
  }

  /**
   * Item 10 — Event loop delay monitor.
   * A setInterval fires every 1 000 ms; if the actual elapsed time is
   * more than 1 000 ms past due, the event loop was blocked/paused.
   * Uses .unref() so it does not prevent clean shutdown.
   */
  _startEventLoopMonitor() {
    const WARN_THRESHOLD = 1_000;
    let last = Date.now();

    this._elMonitorInterval = setInterval(() => {
      const now    = Date.now();
      const actual = now - last;
      const delay  = actual - 1_000;
      if (delay > WARN_THRESHOLD) {
        dlog(
          `[BotEngine][EVENTLOOP] ⚠️  Loop delayed` +
          ` | expected=1000ms actual=${actual}ms delay=${delay}ms | ts=${ts()}`,
        );
      }
      last = now;
    }, 1_000);

    if (this._elMonitorInterval.unref) this._elMonitorInterval.unref();
  }

  /**
   * Item 11 — Periodic bot registry dump (every 30 s).
   */
  _startRegistryDump() {
    this._registryInterval = setInterval(() => {
      const lines = [`[BotEngine][REGISTRY] ── Bot Registry Dump ${ts()} ──`];
      let totalOnline = 0, totalReconnecting = 0;

      for (const [id, bot] of Object.entries(this.bots)) {
        const state     = this._states[id] || 'UNKNOWN';
        const hasTimer  = !!this.reconnectTimers[id];
        const destroyed = bot._client ? !!bot._client.ended : true;
        const evts      = ['login', 'spawn', 'end', 'error', 'kicked', 'health'];
        const listeners = {};
        for (const e of evts) listeners[e] = bot.listenerCount(e);

        if (state === 'ONLINE') totalOnline++;
        else if (state === 'RECONNECTING' || state === 'RECONNECT_STARTED') totalReconnecting++;

        lines.push(
          `  ${bot.username || id}` +
          ` | state=${state}` +
          ` | clientDestroyed=${destroyed}` +
          ` | reconnectTimer=${hasTimer}` +
          ` | attempt#=${this._reconnectAttempts[id] || 0}` +
          ` | listeners=${JSON.stringify(listeners)}`,
        );
      }

      // Bots with a pending timer but no active client
      for (const id of Object.keys(this.reconnectTimers)) {
        if (!this.bots[id]) {
          totalReconnecting++;
          lines.push(
            `  ${id}` +
            ` | state=TIMER_PENDING` +
            ` | client=none` +
            ` | attempt#=${this._reconnectAttempts[id] || 0}`,
          );
        }
      }

      const total = Object.keys(this.bots).length + Object.keys(this.reconnectTimers).filter(id => !this.bots[id]).length;
      lines.push(`  TOTALS: tracked=${total} | online=${totalOnline} | reconnecting=${totalReconnecting}`);
      dlog(lines.join('\n'));
    }, 30_000);

    if (this._registryInterval.unref) this._registryInterval.unref();
  }

  /**
   * Item 12 — Reconnect statistics report (every 60 s).
   */
  _startStatsReport() {
    this._statsInterval = setInterval(() => {
      const s = this._stats;
      const failed     = s.totalAttempts - s.successfulReconnects;
      const avgDur     = s.successfulReconnects > 0
        ? Math.round(s.totalReconnectDuration / s.successfulReconnects)
        : 0;
      const avgUptime  = s.sessionCount > 0
        ? Math.round(s.totalSessionUptime / s.sessionCount / 1000)
        : 0;

      dlog(`[BotEngine][STATS] ── Reconnect Statistics ${ts()} ──`);
      dlog(`[BotEngine][STATS] attempts=${s.totalAttempts} | successful=${s.successfulReconnects} | failed=${failed}`);
      dlog(`[BotEngine][STATS] totalDisconnects=${s.totalDisconnects} | avgReconnectDuration=${avgDur}ms | avgSessionUptime=${avgUptime}s`);
    }, 60_000);

    if (this._statsInterval.unref) this._statsInterval.unref();
  }
}

module.exports = BotEngine;
