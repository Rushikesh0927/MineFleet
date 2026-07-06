/**
 * core/EventManager.js
 *
 * Central event system for the MineFleet platform.
 *
 * Responsibilities:
 *   - register(bot, profile)   — bind all supported Mineflayer events on a bot,
 *                                log each one, and emit a platform-level event
 *                                so other managers (e.g. BotManager) can react
 *   - unregister(bot)          — remove all listeners this manager added to a bot
 *   - on(eventName, handler)   — subscribe to platform-level events
 *   - emit(eventName, ...args) — broadcast a platform-level event
 *
 * Supported Mineflayer events: login, spawn, chat, message, end,
 *                               kicked, error, death, health
 *
 * Platform events emitted (payload always includes { id, username }):
 *   bot:connecting   bot:login   bot:spawn   bot:end
 *   bot:kicked       bot:error   bot:death   bot:reconnecting
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
   * Each event logs a standardized message AND emits a platform-level event
   * so subscribers (e.g. BotManager) can react without coupling to Mineflayer.
   *
   * @param {object}     bot     — live Mineflayer bot instance
   * @param {BotProfile} profile — the profile that owns this bot
   */
  register(bot, profile) {
    const id   = profile.id;
    const name = profile.username;
    const entries = [];

    const bind = (event, handler) => {
      bot.on(event, handler);
      entries.push({ event, handler });
    };

    bind('login', () => {
      console.log(`[EventManager] ${name} logged in.`);
      this.emit('bot:login', { id, username: name });
    });

    bind('spawn', () => {
      console.log(`[EventManager] ${name} spawned.`);
      this.emit('bot:spawn', { id, username: name });
    });

    bind('chat', (username, message) => {
      console.log(`[EventManager] [${name}] <${username}> ${message}`);
      this.emit('bot:chat', { id, username: name, sender: username, message });
    });

    bind('message', (jsonMsg) => {
      console.log(`[EventManager] [${name}] message: ${jsonMsg.toString()}`);
      this.emit('bot:message', { id, username: name, text: jsonMsg.toString() });
    });

    bind('end', (reason) => {
      console.log(`[EventManager] ${name} disconnected. Reason: ${reason || 'unknown'}`);
      this.emit('bot:end', { id, username: name, reason: reason || 'unknown' });
    });

    bind('kicked', (reason) => {
      const reasonText = _readableReason(reason);
      console.log(`[EventManager] ${name} was kicked. Reason: ${reasonText}`);
      this.emit('bot:kicked', { id, username: name, reason: reasonText, rawReason: reason });
    });

    bind('error', (err) => {
      console.log(`[EventManager] ${name} error: ${err.message || err}`);
      this.emit('bot:error', { id, username: name, error: err, errorMessage: err.message || String(err) });
    });

    bind('death', () => {
      console.log(`[EventManager] ${name} died.`);
      this.emit('bot:death', { id, username: name });
    });

    bind('health', () => {
      console.log(`[EventManager] ${name} health: ${bot.health} | food: ${bot.food}`);
      this.emit('bot:health', { id, username: name, health: bot.health, food: bot.food });
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
}

/**
 * Converts a Mineflayer kick reason (which may be a prismarine-chat ChatMessage
 * object, a plain string, or null/undefined) into a human-readable string.
 *
 * Priority:
 *   1. Falsy            → 'unknown'
 *   2. Already a string → returned as-is
 *   3. toString()       → used if it returns something other than '[object Object]'
 *   4. .text property   → used as fallback for raw ChatComponent objects
 *   5. JSON.stringify   → last resort
 *
 * @param {*} reason
 * @returns {string}
 */
function _readableReason(reason) {
  if (!reason) return 'unknown';
  if (typeof reason === 'string') return reason;
  if (typeof reason.toString === 'function') {
    const s = reason.toString();
    if (s !== '[object Object]') return s;
  }
  if (reason.text !== undefined) return String(reason.text);
  return JSON.stringify(reason);
}

module.exports = EventManager;
