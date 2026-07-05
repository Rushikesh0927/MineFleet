/**
 * core/PluginManager.js
 *
 * Responsible for coordinating the plugin lifecycle using PluginLoader.
 * Scans the plugins/ directory for any file matching *Plugin.js, builds a
 * shared PluginContext, and delegates load/enable/disable/unload to PluginLoader.
 *
 * Exposes this.plugins (a map of name → PluginBase instance) for the Dashboard.
 */

const path          = require('path');
const PluginLoader  = require('../plugins/PluginLoader');
const PluginContext = require('../plugins/PluginContext');

class PluginManager {
  constructor() {
    // Loaded plugin instances keyed by plugin name (populated by initialize())
    this.plugins = {};

    // Internal loader — handles file discovery and lifecycle calls
    this._loader = new PluginLoader();
  }

  /**
   * Builds the shared PluginContext, runs PluginLoader to discover and load
   * all *Plugin.js files, and stores the resulting instances in this.plugins.
   *
   * @param {EventManager}   eventManager
   * @param {CommandManager} commandManager
   * @param {BotManager}     botManager
   * @param {ConfigManager}  configManager
   */
  initialize(eventManager, commandManager, botManager, configManager) {
    const context = new PluginContext(eventManager, commandManager, botManager, configManager);

    this.plugins = this._loader.loadAll(context);

    const count = Object.keys(this.plugins).length;
    console.log(`[PluginManager] Initialized — ${count} plugin${count !== 1 ? 's' : ''} loaded`);
  }

  /**
   * Disables and unloads all plugins. Called during platform shutdown.
   */
  shutdown() {
    this._loader.unloadAll();
    this.plugins = {};
    console.log('[PluginManager] All plugins unloaded');
  }
}

module.exports = PluginManager;
