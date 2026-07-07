/**
 * core/CommandManager.js
 *
 * Parses and dispatches in-game chat commands prefixed with "!".
 *
 * Public API:
 *   register(name, description, handler) — add a command to the registry
 *   unregister(name)                     — remove a command from the registry
 *   execute(sender, message, bot)        — parse and run a command if authorized
 *   getCommands()                        — return an array of registered command names
 *
 * Built-in commands: !help, !ping, !status
 *
 * Authorization is delegated to PermissionManager.
 * Permission hierarchy: Owner → Admin → public commands only (help, ping, status).
 */

const COMMAND_PREFIX = '!';

class CommandManager {
  constructor() {
    // Registry of command objects keyed by command name (without prefix)
    // Shape: { description: string, handler: (sender, args, bot) => void }
    this.commands = {};

    // Set during initialize()
    this.permissionManager = null;
  }

  /**
   * Wires PermissionManager and registers all built-in commands.
   *
   * @param {ConfigManager}     configManager     — kept for API compatibility
   * @param {PermissionManager} permissionManager — handles all authorization
   */
  initialize(configManager, permissionManager) {
    this.permissionManager = permissionManager;
    this._registerBuiltins();
    console.log('[CommandManager] Initialized');
  }

  /**
   * Registers a new command.
   *
   * @param {string}   name        — command name without the "!" prefix
   * @param {string}   description — short description shown in !help
   * @param {Function} handler     — called with (sender, args, bot)
   */
  register(name, description, handler) {
    this.commands[name] = { description, handler };
    console.log(`[CommandManager] Registered command: ${COMMAND_PREFIX}${name}`);
  }

  /**
   * Removes a command from the registry.
   *
   * @param {string} name — command name without the "!" prefix
   */
  unregister(name) {
    if (this.commands[name]) {
      delete this.commands[name];
      console.log(`[CommandManager] Unregistered command: ${COMMAND_PREFIX}${name}`);
    }
  }

  /**
   * Parses a raw chat message, checks authorization, and runs the command.
   *
   * @param {string} sender  — in-game username of the player who sent the message
   * @param {string} message — raw chat message (e.g. "!ping")
   * @param {object} bot     — live Mineflayer bot instance for sending replies
   */
  execute(sender, message, bot) {
    if (!message.startsWith(COMMAND_PREFIX)) return;

    const parts       = message.slice(COMMAND_PREFIX.length).trim().split(/\s+/);
    const commandName = parts[0].toLowerCase();
    const args        = parts.slice(1);

    const command = this.commands[commandName];

    if (!command) {
      console.log(`[CommandManager] Unknown command: ${COMMAND_PREFIX}${commandName} from ${sender}`);
      return;
    }

    if (!this._isAuthorized(sender, commandName)) {
      console.log(`[CommandManager] ${sender} denied: ${COMMAND_PREFIX}${commandName}`);
      bot.chat(`${sender}: You do not have permission to use that command.`);
      return;
    }

    console.log(`[CommandManager] ${sender} executed: ${COMMAND_PREFIX}${commandName}`);
    command.handler(sender, args, bot);
  }

  /**
   * Returns an array of all registered command names.
   *
   * @returns {string[]}
   */
  getCommands() {
    return Object.keys(this.commands);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Delegates authorization to PermissionManager.
   * Falls back to denying everything if PermissionManager is not set.
   *
   * @param {string} sender      — player's in-game username
   * @param {string} commandName — command name without prefix
   * @returns {boolean}
   */
  _isAuthorized(sender, commandName) {
    if (!this.permissionManager) return false;
    return this.permissionManager.hasPermission(sender, commandName);
  }

  /**
   * Registers the built-in commands: !help, !ping, !status.
   */
  _registerBuiltins() {
    this.register('help', 'List available commands', (sender, _args, bot) => {
      const list = this.getCommands().map(c => `${COMMAND_PREFIX}${c}`).join(', ');
      bot.chat(`Available commands: ${list}`);
    });

    this.register('ping', 'Check if the bot is responsive', (_sender, _args, bot) => {
      bot.chat('Pong!');
    });

    this.register('status', 'Show current bot status', (_sender, _args, bot) => {
      const health = bot.health !== undefined ? bot.health.toFixed(1) : 'N/A';
      const food   = bot.food   !== undefined ? bot.food              : 'N/A';
      bot.chat(`Status — Health: ${health} | Food: ${food} | Username: ${bot.username}`);
    });
  }
}

module.exports = CommandManager;
