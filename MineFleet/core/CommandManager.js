/**
 * core/CommandManager.js
 *
 * Handles registration and dispatching of commands. Commands can be
 * triggered in-game by players or externally via the dashboard or CLI.
 * Loads command definitions from the /commands directory.
 */

class CommandManager {
  constructor() {
    // Registry of available commands keyed by command name
    this.commands = {};
  }

  /**
   * Registers built-in commands and loads commands from /commands.
   * Currently a stub — full implementation added in a later phase.
   */
  initialize() {
    console.log('[CommandManager] Initialized');
  }
}

module.exports = CommandManager;
