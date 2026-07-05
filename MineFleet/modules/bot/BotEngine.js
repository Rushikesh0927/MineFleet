/**
 * modules/bot/BotEngine.js
 *
 * Interface layer between the MineFleet platform and the Mineflayer library.
 * Manages the full lifecycle of individual bot instances.
 *
 * Responsibilities:
 *   - Create Mineflayer bots from BotProfiles
 *   - Load mineflayer-pathfinder into every new bot
 *   - Create and own one MovementManager per bot
 *   - Tag each bot with bot._minefleetId for command handlers
 *   - Emit platform events (bot:connecting, bot:reconnecting) via EventManager
 *   - Delegate all Mineflayer event logging to EventManager
 *   - Forward chat commands to CommandManager
 *   - Handle auto-reconnect with duplicate-safe timers
 *   - Provide a clean shutdown that disconnects all bots and clears timers
 */

const mineflayer       = require('mineflayer');
const MovementManager  = require('../movement/MovementManager');

const RECONNECT_DELAY_MS = 5000;

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
  }

  /**
   * Stores manager references for use in createBot().
   *
   * @param {EventManager}   eventManager   — the initialized EventManager
   * @param {CommandManager} commandManager — the initialized CommandManager
   */
  initialize(eventManager, commandManager) {
    this.eventManager   = eventManager;
    this.commandManager = commandManager;
    console.log('[BotEngine] Initialized');
  }

  /**
   * Creates a Mineflayer bot from a BotProfile.
   *
   * - Tags the bot with bot._minefleetId so command handlers can look up its ID
   * - Loads mineflayer-pathfinder and wires a MovementManager
   * - Emits bot:connecting, delegates lifecycle event logging to EventManager
   * - Adds its own "end" listener for reconnect business logic
   * - Forwards !-prefixed chat messages to CommandManager
   *
   * Prevents duplicate instances: if a bot with this ID is already active,
   * the call is ignored.
   *
   * @param {BotProfile} profile — the bot's configuration profile
   */
  createBot(profile) {
    // Guard: skip if a live instance already exists for this ID
    if (this.bots[profile.id]) {
      console.log(`[BotEngine] Bot ${profile.username} already running, skipping.`);
      return;
    }

    console.log(`[BotEngine] Creating Bot: ${profile.username}`);

    // Notify the platform that a connection is being attempted
    this.eventManager.emit('bot:connecting', { id: profile.id, username: profile.username });

    const bot = mineflayer.createBot({
      username: profile.username,
      host:     profile.host,
      port:     profile.port,
      version:  profile.version,
    });

    // Tag the bot with its platform ID so command handlers can resolve it
    bot._minefleetId = profile.id;

    // Load pathfinder and initialize MovementManager for this bot
    const mm = new MovementManager();
    mm.initialize(bot);
    this.movementManagers[profile.id] = mm;

    // Delegate all lifecycle logging to EventManager (also emits platform events)
    this.eventManager.register(bot, profile);

    // --- BotEngine's own end handler (reconnect business logic) -------------
    bot.on('end', () => {
      // Remove stale instances
      delete this.bots[profile.id];
      delete this.movementManagers[profile.id];

      // Clean up EventManager listeners to prevent memory leaks
      this.eventManager.unregister(bot);

      if (profile.autoReconnect) {
        // Guard: do not schedule a second timer if one is already pending
        if (this.reconnectTimers[profile.id]) return;

        console.log(`[BotEngine] ${profile.username} reconnecting in ${RECONNECT_DELAY_MS / 1000} seconds...`);

        // Notify BotManager so it can update status to RECONNECTING
        this.eventManager.emit('bot:reconnecting', { id: profile.id, username: profile.username });

        this.reconnectTimers[profile.id] = setTimeout(() => {
          delete this.reconnectTimers[profile.id];
          console.log(`[BotEngine] ${profile.username} reconnect attempt...`);
          this.createBot(profile);
        }, RECONNECT_DELAY_MS);
      }
    });

    // --- Forward chat commands to CommandManager ----------------------------
    bot.on('chat', (username, message) => {
      // Ignore the bot's own messages
      if (username === bot.username) return;

      if (message.startsWith('!')) {
        this.commandManager.execute(username, message, bot);
      }
    });

    // Store the live instance
    this.bots[profile.id] = bot;
  }

  /**
   * Returns the MovementManager for the given bot ID, or null.
   *
   * @param {string} id — bot profile ID
   * @returns {MovementManager|null}
   */
  getMovementManager(id) {
    return this.movementManagers[id] || null;
  }

  /**
   * Gracefully shuts down all active bots and cancels pending reconnect timers.
   */
  shutdown() {
    // Cancel all pending reconnect timers first to prevent new connections
    for (const id of Object.keys(this.reconnectTimers)) {
      clearTimeout(this.reconnectTimers[id]);
      delete this.reconnectTimers[id];
    }

    // Disconnect every live bot
    for (const [id, bot] of Object.entries(this.bots)) {
      const name = bot.username || id;
      console.log(`Disconnecting ${name}...`);
      try {
        bot.quit();
      } catch (_) {
        // Bot may already be in a disconnected state — safe to ignore
      }
      delete this.bots[id];
      delete this.movementManagers[id];
    }
  }

  /**
   * Gracefully removes a single bot by ID.
   *
   * @param {string} id — the bot's profile ID
   */
  removeBot(id) {
    // Cancel any pending reconnect timer for this bot
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
   *
   * @param {string} id
   * @returns {object|null}
   */
  getBot(id) {
    return this.bots[id] || null;
  }

  /**
   * Returns an array of all currently active bot IDs.
   *
   * @returns {string[]}
   */
  listBots() {
    return Object.keys(this.bots);
  }
}

module.exports = BotEngine;
