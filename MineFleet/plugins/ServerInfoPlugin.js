/**
 * plugins/ServerInfoPlugin.js
 *
 * Example MineFleet plugin.
 *
 * Registers the !server command which responds with:
 *   - Server Name (from app.json)
 *   - Number of ONLINE bots
 *   - Platform version
 */

const PluginBase = require('./PluginBase');

class ServerInfoPlugin extends PluginBase {
  constructor() {
    super(
      'ServerInfoPlugin',
      '1.0.0',
      'Provides server information via the !server command'
    );
  }

  /**
   * Registers the !server command with CommandManager.
   * Access to managers is via this.context (PluginContext).
   */
  load() {
    const { commandManager, botManager, configManager } = this.context;

    commandManager.register('server', 'Show server name, online bots, and version', (_sender, _args, bot) => {
      const appConfig  = configManager.getAppConfig();
      const statuses   = botManager.getStatuses();
      const onlineCount = statuses.filter(s => s.status === 'ONLINE').length;

      bot.chat(`Server: ${appConfig.name} | Online Bots: ${onlineCount} | Version: ${appConfig.version}`);
    });
  }

  /**
   * Activates the plugin.
   */
  enable() {
    super.enable();
    console.log('[ServerInfoPlugin] Enabled');
  }

  /**
   * Deactivates the plugin.
   */
  disable() {
    super.disable();
    console.log('[ServerInfoPlugin] Disabled');
  }

  /**
   * Unregisters the !server command on removal.
   */
  unload() {
    if (this.context) {
      this.context.commandManager.unregister('server');
    }
  }
}

module.exports = ServerInfoPlugin;
