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
 */

const BotProfile    = require('../modules/bot/BotProfile');
const TaskManager   = require('../modules/tasks/TaskManager');

const DEBUG = process.env.DEBUG_RECONNECT === 'true';

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
    this.botEngine = botEngine;

    this.loadProfiles(configManager);
    this._subscribeToEvents(eventManager);

    // Start every profile that is marked enabled
    for (const profile of this.getProfiles()) {
      if (profile.enabled) {
        this._scheduleInitialStart(profile.id);
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
  // Bot lifecycle
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

    console.log(`[BotManager] Starting ${profile.username}`);
    this._setStatus(id, STATUS.CONNECTING);
    this.botEngine.createBot(profile);
  }

  /**
   * Stops a single bot by profile ID.
   *
   * @param {string} id
   */
  stopBot(id) {
    const profile = this.profiles[id];
    if (!profile) {
      console.error(`[BotManager] ERROR: No profile found for id '${id}'`);
      return;
    }

    if (this.startupTimers[id]) {
      clearTimeout(this.startupTimers[id]);
      delete this.startupTimers[id];
    }

    console.log(`[BotManager] Stopping ${profile.username}`);
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
    this.botEngine.removeBot(id);
    this._setStatus(id, STATUS.OFFLINE);

    // Small delay to allow clean disconnect before reconnecting
    setTimeout(() => this.startBot(id), 1000);
  }

  /**
   * Starts all loaded bot profiles.
   */
  startAll() {
    console.log('[BotManager] Starting all bots...');
    for (const id of Object.keys(this.profiles)) {
      this.startBot(id);
    }
  }

  /**
   * Stops all active bots.
   */
  stopAll() {
    console.log('[BotManager] Stopping all bots...');
    for (const id of Object.keys(this.profiles)) {
      this.stopBot(id);
    }
  }

  /**
   * Restarts all loaded bots.
   */
  restartAll() {
    console.log('[BotManager] Restarting all bots...');
    for (const id of Object.keys(this.profiles)) {
      this.restartBot(id);
    }
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

  // ---------------------------------------------------------------------------
  // Task management
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
   * Schedules the first startup for a bot using a randomized stagger.
   *
   * @param {string} id
   */
  _scheduleInitialStart(id) {
    const profile = this.profiles[id];
    if (!profile || this.startupTimers[id]) return;

    const delayMs = Math.floor(Math.random() * (30_000 - 2_000 + 1)) + 2_000;
    this.startupTimers[id] = setTimeout(() => {
      delete this.startupTimers[id];
      this.startBot(id);
    }, delayMs);

    if (DEBUG) {
      console.log(`[BotManager][DEBUG] ${new Date().toISOString()} | ${profile.username} | initial startup delay=${delayMs}ms`);
    }
  }

  /**
   * Subscribes to platform-level EventManager events to keep runtime
   * status records automatically in sync with Mineflayer lifecycle.
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
      const rt = this.runtimes[id];
      if (rt) {
        rt.status = STATUS.RECONNECTING;
        rt.reconnectCount += 1;
      }
    });
  }
}

module.exports = BotManager;
