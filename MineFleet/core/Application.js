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
 *   5. BotManager     — receives configManager so it can load bot profiles
 *   6. BotEngine      — Mineflayer interface layer, initialized after BotManager
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
    this.botManager     = new BotManager();
    this.botEngine      = new BotEngine();
  }

  /**
   * Starts the platform by initializing every manager in dependency order.
   * ConfigManager is passed to BotManager so it can read bot profiles.
   */
  initialize() {
    this.configManager.initialize();
    this.pluginManager.initialize();
    this.eventManager.initialize();
    this.commandManager.initialize();
    this.botManager.initialize(this.configManager);
    this.botEngine.initialize();
  }
}

module.exports = Application;
