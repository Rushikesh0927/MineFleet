/**
 * modules/bot/BotEngine.js
 *
 * Interface layer between the MineFleet platform and the Mineflayer library.
 * Manages the full lifecycle of individual bot instances.
 *
 * Responsibilities:
 *   - Create Mineflayer bots from BotProfiles
 *   - Delegate all Mineflayer event logging to EventManager
 *   - Forward chat commands to CommandManager
 *   - Handle auto-reconnect with duplicate-safe timers
 *   - Provide a clean shutdown that disconnects all bots and clears timers
 */

const mineflayer = require('mineflayer');

const RECONNECT_DELAY_MS = 5000;

class BotEngine {
  constructor() {
    // Active Mineflayer bot instances keyed by bot ID
    this.bots = {};

    // Active reconnect timers keyed by bot ID (prevents duplicate timers)
    this.reconnectTimers = {};

    // Injected during initialize()
    this.eventManager   = null;
    this.commandManager = null;
  }

  /**
   * Stores manager references for use in createBot().
   * Sets up OS signal handlers for graceful shutdown.
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
   * Delegates all lifecycle event logging to EventManager, then adds its
   * own "end" listener for reconnect business logic and a "chat" listener
   * that forwards prefixed messages to CommandManager.
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

    const bot = mineflayer.createBot({
      username: profile.username,
      host:     profile.host,
      port:     profile.port,
      version:  profile.version,
    });

    // Delegate all lifecycle logging to EventManager
    this.eventManager.register(bot, profile);

    // --- BotEngine's own end handler (business logic, not logging) ----------
    bot.on('end', () => {
      // Remove stale instance
      delete this.bots[profile.id];

      // Clean up EventManager listeners to prevent memory leaks
      this.eventManager.unregister(bot);

      if (profile.autoReconnect) {
        // Guard: do not schedule a second timer if one is already pending
        if (this.reconnectTimers[profile.id]) return;

        console.log(`[BotEngine] ${profile.username} reconnecting in ${RECONNECT_DELAY_MS / 1000} seconds...`);

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
   * Gracefully shuts down all active bots and cancels pending reconnect timers.
   * Logs each bot as it is disconnected.
   */
  shutdown() {
    // Cancel all pending reconnect timers first to prevent new connections
    for (const id of Object.keys(this.reconnectTimers)) {
      clearTimeout(this.reconnectTimers[id]);
      delete this.reconnectTimers[id];
    }

    // Disconnect every live bot
    for (const [id, bot] of Object.entries(this.bots)) {
      // Determine username from bot object; fall back to ID
      const name = bot.username || id;
      console.log(`Disconnecting ${name}...`);
      try {
        bot.quit();
      } catch (_) {
        // Bot may already be in a disconnected state — safe to ignore
      }
      delete this.bots[id];
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
