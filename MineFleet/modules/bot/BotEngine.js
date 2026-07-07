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
const ConsoleBuffer   = require('../../core/ConsoleBuffer');

let AIAgent = null;
try {
  AIAgent = require('../ai/AIAgent');
} catch (e) {
  // AI module not present yet, ignore
}

// ─── Debug flag (item 14) ────────────────────────────────────────────────────
const DEBUG = process.env.DEBUG_RECONNECT === 'true';

// ─── Reconnect timing (item 3) ───────────────────────────────────────────────
const RECONNECT_MIN_MS = 15_000;
const RECONNECT_MAX_MS = 30_000;
const KEEPALIVE_TIMEOUT_MS = 30_000;

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

    // Per-bot previous state strings
    this._previousStates = {};

    // Per-bot reconnect attempt counters
    this._reconnectAttempts = {};

    // Per-bot session start time (ms since epoch)
    this._sessionStart = {};

    // Per-bot last disconnect / kick / error diagnostics
    this._disconnectReasons = {};
    this._kickReasons = {};
    this._errorObjects = {};

    // Per-bot keepAlive diagnostics
    this._keepAlive = {};

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
    this.taskManagers     = {}; // id -> TaskManager
    this.aiAgents         = {}; // id -> AIAgent

    this.eventManager   = eventManager;
    this.commandManager = commandManager;

    this.eventManager.on('bot:end', ({ id, reason }) => {
      this._disconnectReasons[id] = reason || 'unknown';
    });

    this.eventManager.on('bot:kicked', ({ id, reason, rawReason }) => {
      this._kickReasons[id] = rawReason !== undefined ? rawReason : reason;

      if (DEBUG) {
        const name = this.bots[id]?.username || id;
        dlog(
          `[BotEngine][LIFECYCLE] ${ts()} | ${name} | state=${this._states[id] || 'UNKNOWN'}` +
          ` | prev=${this._previousStates[id] || 'NONE'} | KICKED | reason=${reason || 'unknown'}`,
        );
      }
    });

    this.eventManager.on('bot:error', ({ id, error }) => {
      this._errorObjects[id] = error;

      if (DEBUG) {
        const name = this.bots[id]?.username || id;
        const errorText = error && error.stack ? error.stack : (error && error.message) || String(error);
        dlog(
          `[BotEngine][LIFECYCLE] ${ts()} | ${name} | state=${this._states[id] || 'UNKNOWN'}` +
          ` | prev=${this._previousStates[id] || 'NONE'} | ERROR | error=${errorText}`,
        );
      }
    });

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
    const reconnectRunning = !!this.reconnectTimers[id];
    const client = existing ? existing._client : null;
    const clientExists = !!client;
    const clientConnected = !!existing && !!client && !client.ended && !client.destroyed;
    const clientDestroyed = !!client ? !!client.destroyed || !!client.ended : true;

    if (existing || reconnectRunning || clientExists || clientConnected || !clientDestroyed) {
      const prevState = this._previousStates[id] || this._states[id] || 'NONE';
      dlog(
        `[BotEngine][DUPLICATE] ${ts()} | ${name} | state=${this._states[id] || 'UNKNOWN'} | prev=${prevState}` +
        ` | Skipping createBot(). Existing client already active.` +
        ` | clientExists=${clientExists} connected=${clientConnected} destroyed=${clientDestroyed}` +
        ` | reconnectRunning=${reconnectRunning}`,
      );
      return;
    }

    // ── Item 1: lifecycle — CREATING ──────────────────────────────────────
    const prevState = this._states[id] || 'NONE';
    this._setState(id, 'CREATING', prevState);
    
    console.log(`[BotEngine] ---------------------------------------------`);
    console.log(`[BotEngine] 🚀 ${name} attempting to connect...`);
    console.log(`[BotEngine] 🌐 Target: ${profile.host}:${profile.port} | Version: ${profile.version}`);
    console.log(`[BotEngine] ---------------------------------------------`);
    
    ConsoleBuffer.pushEvent(name, 'Reconnect', 'Creating bot instance', 'info');

    if (profile.username === 'MineFleetBot5' && AIAgent) {
      this.aiAgents[id] = new AIAgent(this, id, profile.username);
      console.log(`[BotEngine] 🧠 AI module initialized exclusively for ${name}`);
    } else if (profile.username === 'MineFleetBot5') {
      console.log(`[BotEngine] ⚠️ AI enabled for ${name} but AIAgent module is missing.`);
    }

    // ── Pre-login listeners (item 5) ──────────────────────────────────────────────
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
      auth:     'offline', // Critical for Aternos cracked servers to prevent hanging
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

      // Item 9: instrument keepAlive now that _client is available
      if (DEBUG) this._instrumentKeepAlive(bot, name, id);
    });

    // ── Item 1 + 7: spawn ─────────────────────────────────────────────────
    bot.on('spawn', () => {
      console.log(`[BotEngine] ✅ ${name} SUCCESSFULLY JOINED ${profile.host}:${profile.port}!`);
      const prev = this._states[id] || 'LOGIN';
      this._setState(id, 'SPAWN', prev);
      this._timings[id].spawnAt = Date.now();

      dlog(
        `[BotEngine][TIMING] ${name} | login→spawn:` +
        ` ${this._timings[id].spawnAt - (this._timings[id].loginAt || this._timings[id].createBotAt)}ms`,
      );

      setImmediate(() => {
        const readyPrev = this._states[id] || 'SPAWN';
        this._timings[id].readyAt = Date.now();
        this._setState(id, 'READY', readyPrev);
        dlog(
          `[BotEngine][TIMING] ${name} | spawn→ready:` +
          ` ${this._timings[id].readyAt - this._timings[id].spawnAt}ms`,
        );

        setImmediate(() => {
          const onlinePrev = this._states[id] || 'READY';
          this._timings[id].onlineAt = Date.now();
          this._setState(id, 'ONLINE', onlinePrev);
          dlog(
            `[BotEngine][TIMING] ${name} | ready→online:` +
            ` ${this._timings[id].onlineAt - this._timings[id].readyAt}ms`,
          );
          dlog(
            `[BotEngine][TIMING] ${name} | total createBot→online:` +
            ` ${this._timings[id].onlineAt - this._timings[id].createBotAt}ms`,
          );

          if ((this._reconnectAttempts[id] || 0) > 0 && this._timings[id].reconnectStartedAt) {
            const dur = this._timings[id].onlineAt - this._timings[id].reconnectStartedAt;
            this._stats.successfulReconnects++;
            this._stats.totalReconnectDuration += dur;
            dlog(
              `[BotEngine][LIFECYCLE] ${ts()} | ${name} | state=ONLINE | prev=${onlinePrev}` +
              ` | RECONNECT_COMPLETED | attempt#=${this._reconnectAttempts[id]} duration=${dur}ms`,
            );
          }

          // Start autonomous self-learning loop for AI bots
          if (this.aiAgents[id]) {
            this.aiAgents[id].startAutonomousLoop(bot, this.taskManagers[id]);
          }
        });
      });
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

      const disconnectReason = reason || this._disconnectReasons[id] || 'unknown';
      const kickReason       = this._kickReasons[id] || null;
      const errorObject      = this._errorObjects[id] || null;

      this._stats.totalDisconnects++;
      if (sessionUptime !== null) {
        this._stats.totalSessionUptime += sessionUptime;
        this._stats.sessionCount++;
      }

      if (DEBUG) {
        const mem = process.memoryUsage();
        const report = {
          timestamp: ts(),
          bot: name,
          currentState: 'DISCONNECTED',
          previousState: prevSt,
          disconnectReason,
          kickReason,
          errorObject: errorObject ? {
            message: errorObject.message || String(errorObject),
            name: errorObject.name || 'Error',
            stack: errorObject.stack || null,
          } : null,
          reconnectAttempt: this._reconnectAttempts[id] || 0,
          sessionUptimeMs: sessionUptime,
          rssMb: Math.round(mem.rss / 1024 / 1024),
          heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
          heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
        };

        dlog(`[BotEngine][DISCONNECT] ${JSON.stringify(report)}`);
      }

      if (!profile.autoReconnect) return;

      // ── Item 4: prevent duplicate reconnect timers ────────────────────
      if (this.reconnectTimers[id]) {
        dlog(
          `[BotEngine][RECONNECT] ${ts()} | ${name} | state=DISCONNECTED | prev=${prevSt}` +
          ` | Reconnect already scheduled. Ignoring duplicate reconnect request.`,
        );
        return;
      }

      // ── Item 3: randomized reconnect delay (15–30s) ───────────────────
      const delayMs = randMs(RECONNECT_MIN_MS, RECONNECT_MAX_MS);

      this._timings[id].disconnectedAt      = Date.now();
      this._timings[id].reconnectScheduledAt = Date.now();
      this._timings[id].reconnectDelayMs     = delayMs;

      dlog(
        `[BotEngine][RECONNECT] ${ts()} | ${name} | state=DISCONNECTED | prev=${prevSt}` +
        ` | scheduling reconnect in ${(delayMs / 1000).toFixed(1)}s`,
      );
      dlog(
        `[BotEngine][TIMING] ${name} | disconnect→reconnect scheduled:` +
        ` ${this._timings[id].reconnectScheduledAt - this._timings[id].disconnectedAt}ms`,
      );

      this._setState(id, 'RECONNECTING', 'DISCONNECTED');
      this._reconnectAttempts[id] = (this._reconnectAttempts[id] || 0) + 1;
      this._stats.totalAttempts++;

      console.log(`[BotEngine] ${name} reconnecting in ${(delayMs / 1000).toFixed(1)} seconds...`);
      ConsoleBuffer.pushEvent(name, 'Reconnect', `Reconnecting in ${(delayMs / 1000).toFixed(1)} seconds...`, 'warn');
      this.eventManager.emit('bot:reconnecting', { id, username: name });

      this.reconnectTimers[id] = {
        scheduledAt: this._timings[id].reconnectScheduledAt,
        delayMs,
        handle: null,
      };

      this.reconnectTimers[id].handle = setTimeout(() => {
        const reconnectInfo = this.reconnectTimers[id];
        delete this.reconnectTimers[id];

        this._timings[id].reconnectStartedAt = Date.now();

        const scheduled = reconnectInfo ? reconnectInfo.scheduledAt : this._timings[id].reconnectScheduledAt;
        if (scheduled) {
          dlog(
            `[BotEngine][TIMING] ${name} | reconnect scheduled→reconnect started:` +
            ` ${this._timings[id].reconnectStartedAt - scheduled}ms`,
          );
        }

        this._setState(id, 'RECONNECT_STARTED', 'RECONNECTING');
        dlog(
          `[BotEngine][LIFECYCLE] ${ts()} | ${name} | state=RECONNECT_STARTED | prev=RECONNECTING` +
          ` | Reconnect started.`,
        );
        console.log(`[BotEngine] ${name} reconnect attempt...`);
        ConsoleBuffer.pushEvent(name, 'Reconnect', 'Reconnect attempt started...', 'info');
        this.createBot(profile);
      }, delayMs);
    });

    // ── Forward !-prefixed chat messages to CommandManager or AIAgent ────────────────
    bot.on('chat', (username, message) => {
      if (username === bot.username) return;

      // Check if it is an AI command: !MineFleetBot5 <text>
      const aiPrefix = `!${bot.username}`;
      if (this.aiAgents[id] && message.toLowerCase().startsWith(aiPrefix.toLowerCase())) {
        const userMsg = message.slice(aiPrefix.length).trim();
        if (userMsg.length > 0) {
          this.aiAgents[id].handleMessage(username, userMsg, bot);
        }
        return;
      }

      // Otherwise forward !commands to CommandManager
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
      const info = this.reconnectTimers[id];
      clearTimeout(info && info.handle ? info.handle : info);
      delete this.reconnectTimers[id];
    }

    for (const [id, bot] of Object.entries(this.bots)) {
      const name = bot.username || id;
      console.log(`Disconnecting ${name}...`);
      if (DEBUG) {
        dlog(
          `[BotEngine][LIFECYCLE] ${ts()} | ${name} | state=${this._states[id] || 'UNKNOWN'}` +
          ` | prev=${this._previousStates[id] || 'NONE'} | DESTROY | shutdown requested`,
        );
      }
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
      const info = this.reconnectTimers[id];
      clearTimeout(info && info.handle ? info.handle : info);
      delete this.reconnectTimers[id];
    }

    const bot = this.bots[id];
    if (bot) {
      this.eventManager.unregister(bot);
      if (DEBUG) {
        const name = bot.username || id;
        dlog(
          `[BotEngine][LIFECYCLE] ${ts()} | ${name} | state=${this._states[id] || 'UNKNOWN'}` +
          ` | prev=${this._previousStates[id] || 'NONE'} | DESTROY | removeBot()`,
        );
      }
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
    this._previousStates[id] = prevState;
    this._states[id] = newState;
    const name = this.bots[id]?.username || id;
    dlog(`[BotEngine][LIFECYCLE] ${ts()} | ${name || id} | state=${newState} | prev=${prevState}`);
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

    const ka = {
      lastReceived: null,
      lastReplied: null,
      count: 0,
      gaps: [],
      timeoutMs: bot._client.keepAliveTimeout || KEEPALIVE_TIMEOUT_MS,
      timeoutAt: null,
    };

    this._keepAlive[id] = ka;

    const originalWrite = bot._client.write.bind(bot._client);
    bot._client.write = (...args) => {
      const packetName = args[0];
      if (packetName === 'keep_alive' || packetName === 'keep_alive_response') {
        const now = Date.now();
        ka.lastReplied = now;
        const replyGap = ka.lastReceived !== null ? now - ka.lastReceived : null;
        dlog(
          `[BotEngine][KEEPALIVE] ${name}` +
          ` | reply=${packetName}` +
          ` | lastReceived=${ka.lastReceived ? new Date(ka.lastReceived).toISOString() : 'never'}` +
          ` | lastReplied=${new Date(now).toISOString()}` +
          ` | replyGap=${replyGap !== null ? replyGap + 'ms' : 'n/a'}` +
          ` | ping=${bot._client.latency ?? 'n/a'}ms` +
          ` | timeoutCountdown=${ka.lastReceived !== null ? Math.max(0, ka.timeoutMs - (now - ka.lastReceived)) + 'ms' : ka.timeoutMs + 'ms'}` +
          ` | ts=${ts()}`,
        );
      }
      return originalWrite(...args);
    };

    bot._client.on('keep_alive', (packet) => {
      const now  = Date.now();
      const gap  = ka.lastReceived !== null ? now - ka.lastReceived : null;
      ka.lastReceived = now;
      ka.count++;
      ka.timeoutAt = now + ka.timeoutMs;
      if (gap !== null) ka.gaps.push(gap);

      const avgGap = ka.gaps.length > 0
        ? Math.round(ka.gaps.reduce((a, b) => a + b, 0) / ka.gaps.length)
        : null;
      const ping = bot._client.latency ?? null;
      const countdown = Math.max(0, ka.timeoutMs - (now - ka.lastReceived));

      dlog(
        `[BotEngine][KEEPALIVE] ${name}` +
        ` | #${ka.count}` +
        ` | id=${packet.keepAliveId ?? packet.id ?? '?'}` +
        ` | gap=${gap !== null ? gap + 'ms' : 'first'}` +
        ` | avgGap=${avgGap !== null ? avgGap + 'ms' : 'n/a'}` +
        ` | lastReceived=${new Date(now).toISOString()}` +
        ` | lastReplied=${ka.lastReplied ? new Date(ka.lastReplied).toISOString() : 'never'}` +
        ` | ping=${ping !== null ? ping + 'ms' : 'n/a'}` +
        ` | timeoutCountdown=${countdown}ms` +
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
        ` | lastReplied=${ka.lastReplied ? new Date(ka.lastReplied).toISOString() : 'never'}` +
        ` | timeoutCountdown=${ka.lastReceived !== null ? Math.max(0, ka.timeoutMs - (Date.now() - ka.lastReceived)) + 'ms' : ka.timeoutMs + 'ms'}` +
        ` | ping=${bot._client ? (bot._client.latency ?? 'n/a') + 'ms' : 'n/a'}` +
        ` | ts=${ts()}`,
      );

      if (isTimeout) {
        dlog(
          `[BotEngine][KEEPALIVE] ${name} | timeout diagnostics` +
          ` | lastReceived=${ka.lastReceived ? new Date(ka.lastReceived).toISOString() : 'never'}` +
          ` | lastReplied=${ka.lastReplied ? new Date(ka.lastReplied).toISOString() : 'never'}` +
          ` | avgGap=${ka.gaps.length > 0 ? Math.round(ka.gaps.reduce((a, b) => a + b, 0) / ka.gaps.length) + 'ms' : 'n/a'}` +
          ` | ping=${bot._client ? (bot._client.latency ?? 'n/a') + 'ms' : 'n/a'}` +
          ` | timeoutMs=${ka.timeoutMs}` +
          ` | ts=${ts()}`,
        );
      }
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

    dlog(`[BotEngine][LISTENERS] ${ts()} | ${name} | state=${this._states[bot._minefleetId] || 'UNKNOWN'} | prev=${this._previousStates[bot._minefleetId] || 'NONE'} | counts=${JSON.stringify(counts)}`);
    if (warned) {
      dlog(`[BotEngine][LISTENERS] ⚠️  ${ts()} | ${name} | state=${this._states[bot._minefleetId] || 'UNKNOWN'} | prev=${this._previousStates[bot._minefleetId] || 'NONE'} | Listener count > 1 detected — possible listener leak!`);
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
          ` | expected=1000ms actual=${actual}ms delay=${delay}ms` +
          ` | activeHandles=${process._getActiveHandles ? process._getActiveHandles().length : 'n/a'}` +
          ` | ts=${ts()}`,
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
      let totalOnline = 0;
      let totalOffline = 0;
      let totalReconnecting = 0;

      const ids = new Set([
        ...Object.keys(this._states),
        ...Object.keys(this.bots),
        ...Object.keys(this.reconnectTimers),
      ]);

      for (const id of ids) {
        const bot = this.bots[id] || null;
        const state = this._states[id] || 'UNKNOWN';
        const timerInfo = this.reconnectTimers[id] || null;
        const client = bot ? bot._client : null;
        const clientExists = !!client;
        const clientDestroyed = client ? !!client.destroyed || !!client.ended : true;
        const connected = client ? !client.destroyed && !client.ended : false;
        const reconnecting = state === 'RECONNECTING' || state === 'RECONNECT_STARTED' || !!timerInfo;
        const remainingReconnectDelay = timerInfo ? Math.max(0, timerInfo.delayMs - (Date.now() - timerInfo.scheduledAt)) : 0;
        const listeners = {};

        for (const eventName of ['login', 'spawn', 'end', 'error', 'kicked', 'health', 'physicsTick', 'message']) {
          listeners[eventName] = bot ? bot.listenerCount(eventName) : 0;
        }

        if (state === 'ONLINE') totalOnline++;
        else if (state === 'RECONNECTING' || state === 'RECONNECT_STARTED' || timerInfo) totalReconnecting++;
        else totalOffline++;

        lines.push(
          `  ${bot ? bot.username : id}` +
          ` | state=${state}` +
          ` | connected=${connected}` +
          ` | reconnecting=${reconnecting}` +
          ` | clientExists=${clientExists}` +
          ` | clientDestroyed=${clientDestroyed}` +
          ` | reconnectTimerActive=${!!timerInfo}` +
          ` | remainingReconnectDelay=${remainingReconnectDelay}ms` +
          ` | attempt#=${this._reconnectAttempts[id] || 0}` +
          ` | listeners=${JSON.stringify(listeners)}`,
        );
      }

      lines.push(`  TOTALS: totalBots=${ids.size} | online=${totalOnline} | offline=${totalOffline} | reconnecting=${totalReconnecting}`);
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
