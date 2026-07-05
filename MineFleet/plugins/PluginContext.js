/**
 * plugins/PluginContext.js
 *
 * Passed to every plugin during load. Provides read access to the four
 * core platform managers so plugins can register commands, listen to
 * events, inspect bot status, and read configuration — all without
 * importing core modules directly.
 */

class PluginContext {
  /**
   * @param {EventManager}   eventManager
   * @param {CommandManager} commandManager
   * @param {BotManager}     botManager
   * @param {ConfigManager}  configManager
   */
  constructor(eventManager, commandManager, botManager, configManager) {
    /** @type {EventManager} */
    this.eventManager = eventManager;

    /** @type {CommandManager} */
    this.commandManager = commandManager;

    /** @type {BotManager} */
    this.botManager = botManager;

    /** @type {ConfigManager} */
    this.configManager = configManager;
  }
}

module.exports = PluginContext;
