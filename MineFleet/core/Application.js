/**
 * core/Application.js
 *
 * The root application class for MineFleet. Orchestrates the startup
 * sequence by initializing each core manager in the correct order so
 * that dependencies between modules are always satisfied.
 *
 * Initialization order:
 *   1. ConfigManager           — config must be ready before anything else reads it
 *   2. EventManager            — event bus ready; needed by BotEngine and BotManager
 *   3. CommandManager          — receives configManager for permissions loading
 *   4. BotEngine               — receives eventManager + commandManager
 *   5. BotManager              — receives configManager, botEngine, eventManager
 *   6. TaskScheduler           — receives botManager; drives task execution every second
 *   7. PluginManager           — receives all four managers; loads plugins last
 *   8. MovementCommands        — registers !goto, !follow, !stop, !look
 *   9. DashboardServer         — REST API; started after all managers are ready
 *
 * Shutdown order (cleanest first):
 *   DashboardServer → TaskScheduler → PluginManager → BotEngine → exit
 */

const ConfigManager          = require('./ConfigManager');
const PluginManager          = require('./PluginManager');
const EventManager           = require('./EventManager');
const CommandManager         = require('./CommandManager');
const BotManager             = require('./BotManager');
const BotEngine              = require('../modules/bot/BotEngine');
const TaskScheduler          = require('../modules/tasks/TaskScheduler');
const DashboardServer        = require('../dashboard/DashboardServer');
const registerMovementCommands = require('../commands/MovementCommands');

class Application {
  constructor() {
    // Instantiate each manager; none performs work until initialize() is called
    this.configManager   = new ConfigManager();
    this.eventManager    = new EventManager();
    this.commandManager  = new CommandManager();
    this.botEngine       = new BotEngine();
    this.botManager      = new BotManager();
    this.taskScheduler   = new TaskScheduler();
    this.pluginManager   = new PluginManager();
    this.dashboardServer = new DashboardServer(
      this.botManager,
      this.pluginManager,
      this.configManager,
    );
  }

  /**
   * Starts the platform by initializing every manager in dependency order,
   * threading shared references where needed.
   */
  initialize() {
    this.configManager.initialize();
    this.eventManager.initialize();
    this.commandManager.initialize(this.configManager);
    this.botEngine.initialize(this.eventManager, this.commandManager);
    this.botManager.initialize(this.configManager, this.botEngine, this.eventManager);
    this.taskScheduler.initialize(this.botManager);
    this.pluginManager.initialize(
      this.eventManager,
      this.commandManager,
      this.botManager,
      this.configManager,
    );
    // Register movement commands after all managers are ready
    registerMovementCommands(this.commandManager, this.botManager);
    this.dashboardServer.initialize();
  }

  /**
   * Gracefully shuts down the platform in reverse-dependency order.
   */
  shutdown() {
    console.log('MineFleet shutting down...');
    this.dashboardServer.shutdown();
    this.taskScheduler.stop();
    this.pluginManager.shutdown();
    this.botEngine.shutdown();
    console.log('Shutdown complete.');
    process.exit(0);
  }
}

module.exports = Application;
