/**
 * core/EventManager.js
 *
 * Central event system for the MineFleet platform.
 *
 * Responsibilities:
 *   - register(bot, profile)  — bind all supported Mineflayer events on a bot
 *                               and emit standardized log messages for each
 *   - unregister(bot)         — remove all listeners this manager added to a bot
 *   - emit(eventName, ...args)— broadcast a platform-level event to listeners
 *
 * Supported Mineflayer events: login, spawn, chat, message, end,
 *                               kicked, error, death, health
 */

class EventManager {
  constructor() {
    // Platform-level event listeners keyed by event name
    this.listeners = {};

    // Tracks per-bot listener references so we can cleanly remove them later
    // Map<bot, Array<{ event: string, handler: Function }>>
    this._botListeners = new Map();
  }

  /**
   * Activates the EventManager.
   */
  initialize() {
    console.log('[EventManager] Initialized');
  }

  /**
   * Binds all supported Mineflayer lifecycle events on the given bot.
   * Every event logs a standardized message.
   *
   * @param {object}     bot     — live Mineflayer bot instance
   * @param {BotProfile} profile — the profile that owns this bot
   */
  register(bot, profile) {
    const name = profile.username;
    const entries = [];

    const bind = (event, handler) => {
      bot.on(event, handler);
      entries.push({ event, handler });
    };

    bind('login', () => {
      console.log(`[EventManager] ${name} logged in.`);
    });

    bind('spawn', () => {
      console.log(`[EventManager] ${name} spawned.`);
    });

    bind('chat', (username, message) => {
      console.log(`[EventManager] [${name}] <${username}> ${message}`);
    });

    bind('message', (jsonMsg) => {
      console.log(`[EventManager] [${name}] message: ${jsonMsg.toString()}`);
    });

    bind('end', (reason) => {
      console.log(`[EventManager] ${name} disconnected. Reason: ${reason || 'unknown'}`);
    });

    bind('kicked', (reason) => {
      console.log(`[EventManager] ${name} was kicked. Reason: ${reason || 'unknown'}`);
    });

    bind('error', (err) => {
      console.log(`[EventManager] ${name} error: ${err.message || err}`);
    });

    bind('death', () => {
      console.log(`[EventManager] ${name} died.`);
    });

    bind('health', () => {
      console.log(`[EventManager] ${name} health: ${bot.health} | food: ${bot.food}`);
    });

    this._botListeners.set(bot, entries);
  }

  /**
   * Removes all Mineflayer event listeners that were added by register().
   * Call this when a bot disconnects to prevent memory leaks.
   *
   * @param {object} bot — live (or recently disconnected) Mineflayer bot
   */
  unregister(bot) {
    const entries = this._botListeners.get(bot);
    if (!entries) return;

    for (const { event, handler } of entries) {
      bot.removeListener(event, handler);
    }

    this._botListeners.delete(bot);
  }

  /**
   * Broadcasts a platform-level event to all registered listeners.
   *
   * @param {string} eventName
   * @param {...any}  args
   */
  emit(eventName, ...args) {
    const handlers = this.listeners[eventName];
    if (!handlers) return;
    for (const handler of handlers) {
      handler(...args);
    }
  }

  /**
   * Registers a platform-level listener for the given event name.
   *
   * @param {string}   eventName
   * @param {Function} handler
   */
  on(eventName, handler) {
    if (!this.listeners[eventName]) {
      this.listeners[eventName] = [];
    }
    this.listeners[eventName].push(handler);
  }
}

module.exports = EventManager;
