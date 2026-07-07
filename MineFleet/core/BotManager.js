/**
 * core/BotManager.js
 *
 * Manages the lifecycle, runtime state, and task queues of all Minecraft bots.
 *
 * Responsibilities:
 *   - Load BotProfiles from ConfigManager
 *   - Start/stop/restart individual bots and all bots at once
 *   - Maintain a runtime record per bot (status, lastSeen, ping, uptime, reconnectCount)
 *   - Subscribe to EventManager platform events to keep runtime status current
 *   - Own one TaskManager per bot and expose task assignment / query methods
 *
 * Bot statuses:
 *   OFFLINE | CONNECTING | ONLINE | DISCONNECTED | RECONNECTING | ERROR
 *
 * Phase 2.1 additions (Fleet Management):
 *   - addBot()           — runtime + persist new bot to bots.json
 *   - removeBot()        — stop + deregister + persist removal
 *   - renameBot()        — safe rename with uniqueness check + persist
 *   - setAutoReconnect() — per-bot toggle; suppresses timer via profile flag
 *   - stopBot() extended — optional intentional=true flag suppresses autoReconnect
 *   - staggered bulk     — startAll/stopAll/restartAll stagger with BULK_STAGGER_MS
 *   - getDetailedStatus()— full bot details panel data (health, food, pos, inventory…)
 */

const BotProfile  = require('../modules/bot/BotProfile');
const TaskManager = require('../modules/tasks/TaskManager');
const { fleetLog } = require('../modules/FleetLogger');

const DEBUG = process.env.DEBUG_RECONNECT === 'true';

// ms between each bot action during a bulk operation (avoids thundering herd)
const BULK_STAGGER_MS = 500;

const STATUS = {
  OFFLINE:      'OFFLINE',
  CONNECTING:   'CONNECTING',
  ONLINE:       'ONLINE',
  DISCONNECTED: 'DISCONNECTED',
  RECONNECTING: 'RECONNECTING',
  ERROR:        'ERROR',
};

class BotManager {
  constructor() {
    // BotProfile objects keyed by bot ID
    this.profiles = {};

    // Runtime records keyed by bot ID — kept separate from profile data
    // Shape: { status, lastSeen, connectedAt, ping, reconnectCount }
    this.runtimes = {};

    // Per-bot TaskManager instances keyed by bot ID
    this.taskManagers = {};

    // Pending startup timers keyed by bot ID
    this.startupTimers = {};

    // Stored during initialize() for use in startBot() / restartBot()
    this.botEngine = null;

    // Phase 2.1: stored ConfigManager reference for saveBots()
    this._configManager = null;

    // Phase 2.1: per-bot intentional-offline flag
    // When true for a bot ID, the 'end' event should NOT trigger autoReconnect.
    // Implemented by setting profile.autoReconnect = false before calling
    // botEngine.removeBot(). The original value is saved here and restored
    // when startBot() is explicitly called again — NOT immediately after stop,
    // because bot.quit() fires the 'end' event asynchronously and a premature
    // restore would cause BotEngine to schedule a reconnect.
    this._intentionalStop = {};

    // Saves the original autoReconnect value during an intentional stop so
    // startBot() can restore it correctly when the user restarts the bot.
    this._savedAutoReconnect = {};
  }

  /**
   * Loads profiles, wires EventManager status listeners, and starts all
   * enabled bots.
   *
   * @param {ConfigManager}  configManager
   * @param {BotEngine}      botEngine
   * @param {EventManager}   eventManager
   */
  initialize(configManager, botEngine, eventManager) {
    this.botEngine      = botEngine;
    this._configManager = configManager;

    this.loadProfiles(configManager);
    this._subscribeToEvents(eventManager);

    // Start every profile that is marked enabled, staggered by 5 seconds
    let index = 0;
    for (const profile of this.getProfiles()) {
      if (profile.enabled) {
        this._scheduleInitialStart(profile.id, index);
        index++;
      }
    }

    console.log('[BotManager] Initialized');
  }

  // ---------------------------------------------------------------------------
  // Profile management
  // ---------------------------------------------------------------------------

  /**
   * Reads every bot entry from ConfigManager, wraps each in a BotProfile,
   * initializes a runtime record and TaskManager, and stores them internally.
   *
   * @param {ConfigManager} configManager
   */
  loadProfiles(configManager) {
    const config = configManager.getBots();

    if (!config || !Array.isArray(config.bots)) {
      console.error('[BotManager] ERROR: No bot definitions found in bots.json');
      return;
    }

    this.profiles     = {};
    this.runtimes     = {};
    this.taskManagers = {};

    for (const entry of config.bots) {
      const profile = new BotProfile(entry);
      this.profiles[profile.id]     = profile;
      this.runtimes[profile.id]     = this._freshRuntime();
      this.taskManagers[profile.id] = new TaskManager(profile.id);
    }

    const count = Object.keys(this.profiles).length;
    console.log(`[BotManager] Loaded ${count} Bot Profile${count !== 1 ? 's' : ''}`);
  }

  /**
   * Returns the BotProfile for the given ID, or null.
   *
   * @param {string} id
   * @returns {BotProfile|null}
   */
  getProfile(id) {
    return this.profiles[id] || null;
  }

  /**
   * Returns an array of all loaded BotProfile objects.
   *
   * @returns {BotProfile[]}
   */
  getProfiles() {
    return Object.values(this.profiles);
  }

  // ---------------------------------------------------------------------------
  // Bot lifecycle — Phase 1 (unchanged signatures)
  // ---------------------------------------------------------------------------

  /**
   * Starts a single bot by profile ID.
   * Sets its status to CONNECTING, then delegates to BotEngine.
   *
   * @param {string} id
   */
  startBot(id) {
    const profile = this.profiles[id];
    if (!profile) {
      console.error(`[BotManager] ERROR: No profile found for id '${id}'`);
      return;
    }

    if (this.startupTimers[id]) {
      if (DEBUG) {
        console.log(`[BotManager][DEBUG] Skipping immediate start for ${profile.username}; startup already scheduled.`);
      }
      return;
    }

    // Clear any intentional-stop flag so the reconnect system works normally
    delete this._intentionalStop[id];

    // Restore autoReconnect that was suppressed during an intentional stop
    if (this._savedAutoReconnect[id] !== undefined) {
      profile.autoReconnect = this._savedAutoReconnect[id];
      delete this._savedAutoReconnect[id];
    }

    console.log(`[BotManager] Starting ${profile.username}`);
    this._setStatus(id, STATUS.CONNECTING);
    this.botEngine.createBot(profile);
  }

  /**
   * Stops a single bot by profile ID.
   *
   * Phase 2.1 extension: when intentional=true, temporarily clears
   * profile.autoReconnect so BotEngine's 'end' handler does NOT schedule
   * a reconnect. The flag is restored after the stop completes. This avoids
   * any modification to BotEngine internals.
   *
   * @param {string}  id
   * @param {boolean} [intentional=false] — true = dashboard-driven stop; suppress reconnect
   */
  stopBot(id, intentional = false) {
    const profile = this.profiles[id];
    if (!profile) {
      console.error(`[BotManager] ERROR: No profile found for id '${id}'`);
      return;
    }

    // Cancel any pending startup timer
    if (this.startupTimers[id]) {
      clearTimeout(this.startupTimers[id]);
      delete this.startupTimers[id];
    }

    if (intentional) {
      // Mark intentional so the event subscriber can skip reconnect status
      this._intentionalStop[id] = true;

      // Save the original value so startBot() can restore it later.
      // IMPORTANT: do NOT restore here — bot.quit() fires the 'end' event
      // asynchronously, so BotEngine's 'end' handler runs AFTER this function
      // returns. If we restore profile.autoReconnect = true immediately,
      // BotEngine would see true and schedule a reconnect. The flag must
      // stay false until the user explicitly calls startBot().
      if (this._savedAutoReconnect[id] === undefined) {
        this._savedAutoReconnect[id] = profile.autoReconnect;
      }
      profile.autoReconnect = false;

      console.log(`[BotManager] ${profile.username} intentionally stopping — autoReconnect suppressed`);
      fleetLog('STOP', id, profile.username, 'ok', { intentional: true, autoReconnectSuppressed: true });
    } else {
      console.log(`[BotManager] Stopping ${profile.username}`);
    }

    this.botEngine.removeBot(id);
    this._setStatus(id, STATUS.OFFLINE);

    console.log(`[BotManager] ${profile.username} Offline`);
  }

  /**
   * Restarts a single bot by profile ID.
   *
   * @param {string} id
   */
  restartBot(id) {
    const profile = this.profiles[id];
    if (!profile) {
      console.error(`[BotManager] ERROR: No profile found for id '${id}'`);
      return;
    }

    if (this.startupTimers[id]) {
      clearTimeout(this.startupTimers[id]);
      delete this.startupTimers[id];
    }

    console.log(`[BotManager] Restarting ${profile.username}`);
    fleetLog('RESTART', id, profile.username, 'ok', { phase: 'stop' });

    // Stop WITHOUT intentional flag so autoReconnect setting is untouched
    this.botEngine.removeBot(id);
    this._setStatus(id, STATUS.OFFLINE);

    // Small delay to allow clean disconnect before reconnecting
    setTimeout(() => {
      fleetLog('RESTART', id, profile.username, 'ok', { phase: 'start' });
      this.startBot(id);
    }, 1000);
  }

  /**
   * Starts all loaded bot profiles (staggered by BULK_STAGGER_MS), optionally filtered by serverId.
   */
  startAll(serverId = null) {
    console.log(`[BotManager] Starting all bots (staggered)${serverId ? ` for server ${serverId}` : ''}...`);
    let ids = Object.keys(this.profiles);
    if (serverId) ids = ids.filter(id => this.profiles[id].serverId === serverId);

    ids.forEach((id, i) => {
      setTimeout(() => {
        fleetLog('BULK_START', id, this.profiles[id]?.username || id, 'ok', { index: i });
        this.startBot(id);
      }, i * BULK_STAGGER_MS);
    });
  }

  /**
   * Stops all active bots (staggered by BULK_STAGGER_MS), optionally filtered by serverId.
   */
  stopAll(serverId = null) {
    console.log(`[BotManager] Stopping all bots (staggered)${serverId ? ` for server ${serverId}` : ''}...`);
    let ids = Object.keys(this.profiles);
    if (serverId) ids = ids.filter(id => this.profiles[id].serverId === serverId);

    ids.forEach((id, i) => {
      setTimeout(() => {
        fleetLog('BULK_STOP', id, this.profiles[id]?.username || id, 'ok', { index: i, intentional: true });
        this.stopBot(id, true);
      }, i * BULK_STAGGER_MS);
    });
  }

  /**
   * Restarts all loaded bots (staggered by BULK_STAGGER_MS), optionally filtered by serverId.
   */
  restartAll(serverId = null) {
    console.log(`[BotManager] Restarting all bots (staggered)${serverId ? ` for server ${serverId}` : ''}...`);
    let ids = Object.keys(this.profiles);
    if (serverId) ids = ids.filter(id => this.profiles[id].serverId === serverId);

    ids.forEach((id, i) => {
      setTimeout(() => {
        fleetLog('BULK_RESTART', id, this.profiles[id]?.username || id, 'ok', { index: i });
        this.restartBot(id);
      }, i * BULK_STAGGER_MS);
    });
  }

  // ---------------------------------------------------------------------------
  // Fleet Management — Phase 2.1 additions
  // ---------------------------------------------------------------------------

  /**
   * Adds a new bot to the registry, wires a runtime record and TaskManager,
   * and persists the change to bots.json.
   *
   * The new bot is scheduled via the standard staggered startup path.
   *
   * @param {object} config — raw bot config: { id, username, host, port, version, enabled, autoReconnect }
   * @returns {{ ok: boolean, error?: string }}
   */
  addBot(config) {
    // Validate required fields
    if (!config.id || !config.username || !config.host || !config.port || !config.version) {
      return { ok: false, error: 'Missing required fields: id, username, host, port, version' };
    }

    // Check for duplicate ID
    if (this.profiles[config.id]) {
      return { ok: false, error: `Bot id '${config.id}' already exists` };
    }

    const serverId = config.serverId || 'default';

    // Check for duplicate username ON THE SAME SERVER
    const duplicate = Object.values(this.profiles).find(
      p => p.username === config.username && p.serverId === serverId
    );
    if (duplicate) {
      return { ok: false, error: `Username '${config.username}' is already in use by bot '${duplicate.id}' on server '${serverId}'` };
    }

    const entry = {
      id:            config.id,
      username:      config.username,
      serverId:      serverId,
      host:          config.host,
      port:          Number(config.port),
      version:       config.version,
      enabled:       config.enabled  !== undefined ? !!config.enabled  : true,
      autoReconnect: config.autoReconnect !== undefined ? !!config.autoReconnect : true,
    };

    const profile = new BotProfile(entry);
    this.profiles[profile.id]     = profile;
    this.runtimes[profile.id]     = this._freshRuntime();
    this.taskManagers[profile.id] = new TaskManager(profile.id);

    // Persist to disk
    this._persistBots();

    console.log(`[BotManager] Added new bot: ${profile.username} (${profile.id})`);
    fleetLog('ADD_BOT', profile.id, profile.username, 'ok', { host: profile.host, port: profile.port });

    // Start it using the same staggered path as initial startup
    if (profile.enabled) {
      this._scheduleInitialStart(profile.id);
    }

    return { ok: true };
  }

  /**
   * Fully removes a bot from the registry.
   * The bot is first stopped intentionally (no reconnect), then deregistered,
   * and the change is persisted to bots.json.
   *
   * @param {string} id
   * @returns {{ ok: boolean, error?: string }}
   */
  removeBot(id) {
    const profile = this.profiles[id];
    if (!profile) {
      return { ok: false, error: `Bot '${id}' not found` };
    }

    const username = profile.username;

    // Stop intentionally (suppresses autoReconnect) and cancel any startup timer
    this.stopBot(id, true);

    // Deregister from all internal maps
    delete this.profiles[id];
    delete this.runtimes[id];
    delete this.taskManagers[id];
    delete this._intentionalStop[id];

    // Persist removal
    this._persistBots();

    console.log(`[BotManager] Removed bot: ${username} (${id})`);
    fleetLog('REMOVE_BOT', id, username, 'ok');

    return { ok: true };
  }

  /**
   * Renames a bot's display username.
   *
   * Safety guarantees:
   *   - Uniqueness check prevents duplicate usernames.
   *   - The profile object is mutated in-place (same object reference BotEngine holds),
   *     so any reconnect timer that fires after rename will use the new username.
   *   - The bot's registry key (id) is NOT changed, so all keyed lookups still work.
   *   - If a reconnect is in progress, the rename is still safe: BotEngine keys by id,
   *     not username.
   *
   * @param {string} id
   * @param {string} newUsername
   * @returns {{ ok: boolean, error?: string }}
   */
  renameBot(id, newUsername) {
    const profile = this.profiles[id];
    if (!profile) {
      return { ok: false, error: `Bot '${id}' not found` };
    }

    if (!newUsername || typeof newUsername !== 'string' || !newUsername.trim()) {
      return { ok: false, error: 'newUsername must be a non-empty string' };
    }

    newUsername = newUsername.trim();

    // Uniqueness check (exclude self, but check same server)
    const conflict = Object.values(this.profiles).find(
      p => p.username === newUsername && p.serverId === profile.serverId && p.id !== id
    );
    if (conflict) {
      return { ok: false, error: `Username '${newUsername}' is already in use by bot '${conflict.id}' on this server` };
    }

    const oldUsername = profile.username;

    // Detect mid-reconnect scenario and log a warning (safe to proceed)
    const hasTimer = !!(this.botEngine && this.botEngine.reconnectTimers && this.botEngine.reconnectTimers[id]);
    if (hasTimer) {
      console.warn(
        `[BotManager] WARNING: Renaming ${oldUsername} → ${newUsername} while a reconnect timer is active.` +
        ` The reconnect will use the new username. This is safe.`
      );
    }

    profile.username = newUsername;

    // Persist change
    this._persistBots();

    console.log(`[BotManager] Renamed bot ${id}: '${oldUsername}' → '${newUsername}'`);
    fleetLog('RENAME_BOT', id, newUsername, 'ok', { oldUsername, newUsername, midReconnect: hasTimer });

    return { ok: true, oldUsername, newUsername };
  }

  /**
   * Enables or disables autoReconnect for a single bot.
   *
   * When disabled:
   *   - Sets profile.autoReconnect = false so the BotEngine 'end' handler
   *     skips reconnect scheduling for future disconnects.
   *   - If a reconnect timer is already pending, it is cancelled immediately.
   *
   * When re-enabled:
   *   - Sets profile.autoReconnect = true; the next disconnect will trigger
   *     reconnect normally.
   *
   * @param {string}  id
   * @param {boolean} enabled
   * @returns {{ ok: boolean, error?: string }}
   */
  setAutoReconnect(id, enabled) {
    const profile = this.profiles[id];
    if (!profile) {
      return { ok: false, error: `Bot '${id}' not found` };
    }

    profile.autoReconnect = !!enabled;

    if (!enabled && this.botEngine) {
      // Cancel any pending reconnect timer so we don't reconnect even from the queue
      const timerInfo = this.botEngine.reconnectTimers && this.botEngine.reconnectTimers[id];
      if (timerInfo) {
        const handle = timerInfo.handle || timerInfo;
        clearTimeout(handle);
        delete this.botEngine.reconnectTimers[id];
        console.log(`[BotManager] Cancelled pending reconnect timer for ${profile.username} (autoReconnect disabled)`);
        fleetLog('AUTORECONNECT_DISABLE', id, profile.username, 'ok', { timerCancelled: true });
      } else {
        fleetLog('AUTORECONNECT_DISABLE', id, profile.username, 'ok', { timerCancelled: false });
        console.log(`[BotManager] AutoReconnect DISABLED for ${profile.username} — no pending timer to cancel`);
      }
    } else if (enabled) {
      console.log(`[BotManager] AutoReconnect ENABLED for ${profile.username}`);
      fleetLog('AUTORECONNECT_ENABLE', id, profile.username, 'ok');
    }

    return { ok: true, autoReconnect: !!enabled };
  }

  // ---------------------------------------------------------------------------
  // Status & runtime
  // ---------------------------------------------------------------------------

  /**
   * Returns the runtime status object for a single bot, or null if not found.
   * Uptime is calculated on the fly from connectedAt.
   * Ping is read from the live bot instance if available.
   * Active task name is included if a task is running.
   *
   * @param {string} id
   * @returns {object|null}
   */
  getStatus(id) {
    const rt      = this.runtimes[id];
    const profile = this.profiles[id];
    if (!rt || !profile) return null;

    const uptimeSeconds = rt.connectedAt
      ? Math.floor((Date.now() - rt.connectedAt) / 1000)
      : null;

    // Try to read live ping from Mineflayer's internal client
    const liveBot = this.botEngine ? this.botEngine.getBot(id) : null;
    const ping    = liveBot && liveBot._client
      ? (liveBot._client.latency ?? rt.ping)
      : rt.ping;

    // Include active task info if one is running
    const tm         = this.taskManagers[id];
    const activeTask = tm ? tm.getActive() : null;

    return {
      id,
      username:       profile.username,
      host:           profile.host,
      port:           profile.port,
      status:         rt.status,
      lastSeen:       rt.lastSeen,
      ping,
      uptime:         uptimeSeconds,
      reconnectCount: rt.reconnectCount,
      activeTask:     activeTask
        ? { id: activeTask.id, name: activeTask.name, state: activeTask.state }
        : null,
      queueLength:    tm ? tm.getQueue().length : 0,
    };
  }

  /**
   * Returns an array of runtime status objects for every loaded profile.
   *
   * @returns {object[]}
   */
  getStatuses() {
    return Object.keys(this.profiles).map(id => this.getStatus(id));
  }

  /**
   * Phase 2.1 — Returns a full details panel record for a single bot.
   *
   * Extends getStatus() with live Mineflayer data:
   *   health, food, dimension, position, heldItem, nearbyPlayers, inventory summary.
   *
   * Fields that require a live bot instance are null when the bot is offline.
   *
   * @param {string} id
   * @returns {object|null}
   */
  getDetailedStatus(id) {
    const base = this.getStatus(id);
    if (!base) return null;

    const profile = this.profiles[id];
    const liveBot = this.botEngine ? this.botEngine.getBot(id) : null;

    // ── Live fields (only available when bot is ONLINE) ────────────────────
    let health        = null;
    let food          = null;
    let dimension     = null;
    let position      = null;
    let heldItem      = null;
    let nearbyPlayers = [];
    let inventory     = null;

    if (liveBot) {
      try { health    = liveBot.health ?? null; }          catch (_) {}
      try { food      = liveBot.food   ?? null; }          catch (_) {}
      try { dimension = liveBot.game?.dimension ?? null; } catch (_) {}

      try {
        const pos = liveBot.entity?.position;
        if (pos) {
          position = {
            x: Math.floor(pos.x),
            y: Math.floor(pos.y),
            z: Math.floor(pos.z),
          };
        }
      } catch (_) {}

      try {
        const held = liveBot.heldItem;
        heldItem = held ? { name: held.name, count: held.count, displayName: held.displayName } : null;
      } catch (_) {}

      try {
        // Nearby players — names of all players in the tab list whose entity exists
        // and is within 64 blocks of this bot
        const botPos = liveBot.entity?.position;
        nearbyPlayers = Object.values(liveBot.players || {})
          .filter(p => {
            if (p.username === liveBot.username) return false;
            if (!p.entity || !botPos) return true; // in tab list but no known pos
            const dx = p.entity.position.x - botPos.x;
            const dy = p.entity.position.y - botPos.y;
            const dz = p.entity.position.z - botPos.z;
            return Math.sqrt(dx * dx + dy * dy + dz * dz) <= 64;
          })
          .map(p => p.username);
      } catch (_) {}

      try {
        const items = liveBot.inventory.items();
        inventory = {
          totalItems: items.length,
          slots: items.slice(0, 9).map(item => ({
            slot:        item.slot,
            name:        item.name,
            displayName: item.displayName,
            count:       item.count,
          })),
        };
      } catch (_) {}
    }

    return {
      ...base,
      // Phase 2.1 additions
      autoReconnect:  profile.autoReconnect,
      health,
      food,
      dimension,
      position,
      heldItem,
      nearbyPlayers,
      inventory,
    };
  }

  /**
   * Returns an array of detailed status objects for every loaded profile.
   *
   * @returns {object[]}
   */
  getDetailedStatuses() {
    return Object.keys(this.profiles).map(id => this.getDetailedStatus(id));
  }

  // ---------------------------------------------------------------------------
  // Task management (Phase 1 — unchanged)
  // ---------------------------------------------------------------------------

  /**
   * Returns (or lazily creates) the TaskManager for the given bot ID.
   *
   * @param {string} id — bot profile ID
   * @returns {TaskManager}
   */
  getTaskManager(id) {
    if (!this.taskManagers[id]) {
      this.taskManagers[id] = new TaskManager(id);
    }
    return this.taskManagers[id];
  }

  /**
   * Assigns a Task to a specific bot.
   * If the bot has no active task it starts immediately; otherwise it is queued.
   *
   * @param {string} botId
   * @param {Task}   task
   */
  assignTask(botId, task) {
    if (!this.profiles[botId]) {
      console.error(`[BotManager] assignTask: unknown bot id '${botId}'`);
      return;
    }
    console.log(`[BotManager] Assigning task "${task.name}" to bot '${botId}'`);
    this.getTaskManager(botId).assign(task);
  }

  /**
   * Cancels the active task for a bot and clears its queue.
   *
   * @param {string} botId
   */
  cancelTask(botId) {
    if (!this.profiles[botId]) {
      console.error(`[BotManager] cancelTask: unknown bot id '${botId}'`);
      return;
    }
    console.log(`[BotManager] Cancelling task for bot '${botId}'`);
    this.getTaskManager(botId).cancel();
  }

  /**
   * Returns the currently active Task for the given bot, or null.
   *
   * @param {string} botId
   * @returns {Task|null}
   */
  getCurrentTask(botId) {
    return this.getTaskManager(botId).getActive();
  }

  /**
   * Returns the pending task queue for the given bot.
   *
   * @param {string} botId
   * @returns {Task[]}
   */
  getTaskQueue(botId) {
    return this.getTaskManager(botId).getQueue();
  }

  /**
   * Returns the MovementManager for the given bot ID via BotEngine, or null.
   * Used by command handlers and movement tasks.
   *
   * @param {string} id — bot profile ID
   * @returns {MovementManager|null}
   */
  getMovementManager(id) {
    return this.botEngine ? this.botEngine.getMovementManager(id) : null;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Creates a blank runtime record for a newly loaded profile.
   *
   * @returns {object}
   */
  _freshRuntime() {
    return {
      status:         STATUS.OFFLINE,
      lastSeen:       null,
      connectedAt:    null,
      ping:           null,
      reconnectCount: 0,
    };
  }

  /**
   * Updates the status field of a bot's runtime record.
   *
   * @param {string} id
   * @param {string} status — one of the STATUS constants
   */
  _setStatus(id, status) {
    const rt = this.runtimes[id];
    if (!rt) return;
    rt.status = status;
  }

  /**
   * Schedules the first startup for a bot using a sequential 5-second stagger.
   *
   * @param {string} id
   * @param {number} index
   */
  _scheduleInitialStart(id, index = 0) {
    const profile = this.profiles[id];
    if (!profile || this.startupTimers[id]) return;

    // Start the first bot immediately, then 5s between each
    const delayMs = index * 5000;
    
    console.log(`[BotManager] Queuing ${profile.username} to start in ${delayMs / 1000}s...`);

    this.startupTimers[id] = setTimeout(() => {
      delete this.startupTimers[id];
      this.startBot(id);
    }, delayMs);
  }

  /**
   * Subscribes to platform-level EventManager events to keep runtime
   * status records automatically in sync with Mineflayer lifecycle.
   *
   * Phase 2.1: When the bot disconnects after an intentional stop, skip
   * the RECONNECTING status update (the reconnect system won't fire either
   * because profile.autoReconnect was temporarily false during stopBot()).
   *
   * @param {EventManager} eventManager
   */
  _subscribeToEvents(eventManager) {
    eventManager.on('bot:connecting', ({ id }) => {
      this._setStatus(id, STATUS.CONNECTING);
    });

    eventManager.on('bot:login', ({ id, username }) => {
      const rt = this.runtimes[id];
      if (rt) {
        rt.status      = STATUS.ONLINE;
        rt.connectedAt = Date.now();
      }
      console.log(`[BotManager] ${username} Online`);
    });

    eventManager.on('bot:end', ({ id, username }) => {
      const rt = this.runtimes[id];
      if (rt) {
        rt.status      = STATUS.DISCONNECTED;
        rt.lastSeen    = new Date().toISOString();
        rt.connectedAt = null;
      }
      console.log(`[BotManager] ${username} Offline`);
    });

    eventManager.on('bot:kicked', ({ id }) => {
      this._setStatus(id, STATUS.DISCONNECTED);
    });

    eventManager.on('bot:error', ({ id }) => {
      this._setStatus(id, STATUS.ERROR);
    });

    eventManager.on('bot:reconnecting', ({ id }) => {
      // Skip if this disconnect was intentional (we suppressed autoReconnect,
      // so BotEngine shouldn't emit this — but guard defensively)
      if (this._intentionalStop[id]) {
        delete this._intentionalStop[id];
        return;
      }

      const rt = this.runtimes[id];
      if (rt) {
        rt.status = STATUS.RECONNECTING;
        rt.reconnectCount += 1;
      }
    });
  }

  /**
   * Phase 2.1 — Serializes all current profiles to bots.json via ConfigManager.
   * Called after any add/remove/rename operation.
   */
  _persistBots() {
    if (!this._configManager) return;

    const botsArray = Object.values(this.profiles).map(p => ({
      id:            p.id,
      username:      p.username,
      serverId:      p.serverId,
      host:          p.host,
      port:          p.port,
      version:       p.version,
      enabled:       p.enabled,
      autoReconnect: p.autoReconnect,
    }));

    this._configManager.saveBots(botsArray);
  }
}

module.exports = BotManager;
