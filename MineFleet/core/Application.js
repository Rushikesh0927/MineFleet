/**
 * core/Application.js
 *
 * The root application class for MineFleet. Orchestrates the startup
 * sequence by initializing each core manager in the correct order so
 * that dependencies between modules are always satisfied.
 *
 * Initialization order:
 *   1. ConfigManager  — config must be ready before anything else reads it
 *   2. PluginManager  — plugins register themselves before the event bus starts
 *   3. EventManager   — event bus ready; needed by BotEngine
 *   4. CommandManager — receives configManager for permissions loading
 *   5. BotEngine      — receives eventManager + commandManager
 *   6. BotManager     — receives configManager + botEngine; starts enabled bots
 *
 * Shutdown order (reverse of startup):
 *   BotEngine.shutdown() → all bots disconnected, timers cleared
 */

const ConfigManager  = require('./ConfigManager');
const PluginManager  = require('./PluginManager');
const EventManager   = require('./EventManager');
const CommandManager = require('./CommandManager');
const BotManager     = require('./BotManager');
const BotEngine      = require('../modules/bot/BotEngine');

class Application {
  constructor() {
    // Instantiate each manager; none performs work until initialize() is called
    this.configManager  = new ConfigManager();
    this.pluginManager  = new PluginManager();
    this.eventManager   = new EventManager();
    this.commandManager = new CommandManager();
    this.botEngine      = new BotEngine();
    this.botManager     = new BotManager();
  }

  /**
   * Starts the platform by initializing every manager in dependency order,
   * threading shared references where needed.
   */
  initialize() {
    this.configManager.initialize();
    this.pluginManager.initialize();
    this.eventManager.initialize();
    this.commandManager.initialize(this.configManager);
    this.botEngine.initialize(this.eventManager, this.commandManager);
    this.botManager.initialize(this.configManager, this.botEngine);
  }

  /**
   * Gracefully shuts down the platform.
   * Disconnects all active bots, clears reconnect timers, then exits.
   */
  shutdown() {
    console.log('MineFleet shutting down...');
    this.botEngine.shutdown();
    console.log('Shutdown complete.');
    process.exit(0);
  }
}

module.exports = Application;
