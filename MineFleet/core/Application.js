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
 *   3. EventManager   — event bus ready for managers that emit on startup
 *   4. CommandManager — commands can now listen for events
 *   5. BotEngine      — Mineflayer layer initialized before BotManager needs it
 *   6. BotManager     — receives configManager + botEngine; starts enabled bots
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
   * Starts the platform by initializing every manager in dependency order.
   * BotEngine is initialized before BotManager so it is ready to receive
   * createBot() calls during BotManager's startup sequence.
   */
  initialize() {
    this.configManager.initialize();
    this.pluginManager.initialize();
    this.eventManager.initialize();
    this.commandManager.initialize();
    this.botEngine.initialize();
    this.botManager.initialize(this.configManager, this.botEngine);
  }
}

module.exports = Application;
