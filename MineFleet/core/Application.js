/**
 * core/Application.js
 *
 * The root application class for MineFleet. Orchestrates the startup
 * sequence by initializing each core manager in the correct order so
 * that dependencies between modules are always satisfied.
 *
 * Initialization order:
 *   1. ConfigManager           — config must be ready before anything else reads it
 *   2. PermissionManager       — must be ready before CommandManager
 *   3. EventManager            — event bus ready; needed by BotEngine and BotManager
 *   4. CommandManager          — receives configManager + permissionManager
 *   5. BotEngine               — receives eventManager + commandManager
 *   6. BotManager              — receives configManager, botEngine, eventManager
 *   7. TaskScheduler           — receives botManager; drives task execution every second
 *   8. PluginManager           — receives all four managers; loads plugins last
 *   9. MovementCommands        — registers !goto, !follow, !stop, !look
 *  10. DashboardServer         — REST API; started after all managers are ready
 *
 * Shutdown order (cleanest first):
 *   DashboardServer → TaskScheduler → PluginManager → BotEngine → exit
 */

const ConfigManager            = require('./ConfigManager');
const PermissionManager        = require('./PermissionManager');
const PluginManager            = require('./PluginManager');
const EventManager             = require('./EventManager');
const CommandManager           = require('./CommandManager');
const BotManager               = require('./BotManager');
const BotEngine                = require('../modules/bot/BotEngine');
const TaskScheduler            = require('../modules/tasks/TaskScheduler');
const DashboardServer          = require('../dashboard/DashboardServer');
const KeepAlive                = require('./KeepAlive');
const registerMovementCommands = require('../commands/MovementCommands');

class Application {
  constructor() {
    // Instantiate each manager; none performs work until initialize() is called
    this.configManager     = new ConfigManager();
    this.permissionManager = new PermissionManager();
    this.eventManager      = new EventManager();
    this.commandManager    = new CommandManager();
    this.botEngine         = new BotEngine();
    this.botManager        = new BotManager();
    this.taskScheduler     = new TaskScheduler();
    this.pluginManager     = new PluginManager();
    this.dashboardServer   = new DashboardServer(
      this.botManager,
      this.pluginManager,
      this.configManager,
    );
    this.keepAlive = new KeepAlive(this.botManager, this.botEngine);
  }

  /**
   * Starts the platform by initializing every manager in dependency order,
   * threading shared references where needed.
   */
  initialize() {
    this.configManager.initialize();
    this.permissionManager.initialize();
    this.eventManager.initialize();
    this.commandManager.initialize(this.configManager, this.permissionManager);
    this.botEngine.initialize(this.eventManager, this.commandManager);
    this.botManager.initialize(this.configManager, this.botEngine, this.eventManager);
    this.taskScheduler.initialize(this.botManager);
    this.pluginManager.initialize(
      this.eventManager,
      this.commandManager,
      this.botManager,
      this.configManager,
    );
    registerMovementCommands(this.commandManager, this.botManager);
    this.dashboardServer.initialize();

    // Start keep-alive AFTER the HTTP server is listening
    const port = parseInt(process.env.DASHBOARD_PORT, 10) || 3000;
    this.keepAlive.start(port);
  }

  /**
   * Gracefully shuts down the platform in reverse-dependency order.
   */
  shutdown() {
    console.log('MineFleet shutting down...');
    this.keepAlive.stop();
    this.dashboardServer.shutdown();
    this.taskScheduler.stop();
    this.pluginManager.shutdown();
    this.botEngine.shutdown();
    console.log('Shutdown complete.');
    process.exit(0);
  }
}

module.exports = Application;
