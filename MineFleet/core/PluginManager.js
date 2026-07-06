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
const ConsoleBuffer = require('./ConsoleBuffer');

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

    this._context = context;

    this.plugins = this._loader.loadAll(context);

    const count = Object.keys(this.plugins).length;
    console.log(`[PluginManager] Initialized — ${count} plugin${count !== 1 ? 's' : ''} loaded`);
    ConsoleBuffer.pushEvent('System', 'Plugins', `Initialized — ${count} plugin${count !== 1 ? 's' : ''} loaded`, 'info');
  }

  enablePlugin(name) {
    const plugin = this.plugins[name];
    if (!plugin) throw new Error(`Plugin not found: ${name}`);
    if (plugin.enabled) return false;
    plugin.enable();
    ConsoleBuffer.pushEvent('System', 'Plugins', `Enabled plugin: ${name}`, 'info');
    return true;
  }

  disablePlugin(name) {
    const plugin = this.plugins[name];
    if (!plugin) throw new Error(`Plugin not found: ${name}`);
    if (!plugin.enabled) return false;
    plugin.disable();
    ConsoleBuffer.pushEvent('System', 'Plugins', `Disabled plugin: ${name}`, 'info');
    return true;
  }

  reloadPlugin(name) {
    if (!this.plugins[name]) throw new Error(`Plugin not found: ${name}`);
    if (!this._context) throw new Error(`Cannot reload: context not initialized`);
    
    const newPlugin = this._loader.reload(name, this._context);
    this.plugins[name] = newPlugin;
    ConsoleBuffer.pushEvent('System', 'Plugins', `Reloaded plugin: ${name}`, 'info');
    return true;
  }

  /**
   * Disables and unloads all plugins. Called during platform shutdown.
   */
  shutdown() {
    this._loader.unloadAll();
    this.plugins = {};
    console.log('[PluginManager] All plugins unloaded');
    ConsoleBuffer.pushEvent('System', 'Plugins', 'All plugins unloaded', 'info');
  }
}

module.exports = PluginManager;
