/**
 * plugins/PluginLoader.js
 *
 * Discovers, instantiates, and manages the lifecycle of MineFleet plugins.
 *
 * Discovery convention:
 *   Any file in the plugins/ directory whose name ends with "Plugin.js"
 *   is treated as a plugin. Infrastructure files (PluginBase.js,
 *   PluginContext.js, PluginLoader.js) are intentionally excluded.
 *
 * Lifecycle per plugin: setContext → load → enable
 */

const fs      = require('fs');
const path    = require('path');
const PluginBase = require('./PluginBase');

// Directory to scan — the plugins/ folder itself
const PLUGINS_DIR = path.join(__dirname);

class PluginLoader {
  constructor() {
    // Loaded plugin instances keyed by plugin name
    this.plugins = {};
  }

  /**
   * Scans the plugins/ directory for *Plugin.js files, loads each one,
   * injects the shared context, and runs the full lifecycle.
   *
   * @param {PluginContext} context — shared platform context for all plugins
   * @returns {{ [name: string]: PluginBase }} — map of loaded plugin instances
   */
  loadAll(context) {
    const files = this._discover();

    for (const file of files) {
      this._loadFile(file, context);
    }

    return this.plugins;
  }

  /**
   * Disables and unloads all currently loaded plugins.
   */
  unloadAll() {
    for (const name of Object.keys(this.plugins)) {
      this._unload(name);
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Returns the absolute paths of all *Plugin.js files in the plugins/ dir.
   *
   * @returns {string[]}
   */
  _discover() {
    try {
      return fs.readdirSync(PLUGINS_DIR)
        .filter(f => f.endsWith('Plugin.js'))
        .map(f => path.join(PLUGINS_DIR, f));
    } catch (err) {
      console.error(`[PluginLoader] ERROR: Could not scan plugins directory — ${err.message}`);
      return [];
    }
  }

  /**
   * Requires a plugin file, validates that it extends PluginBase,
   * then runs setContext → load → enable.
   *
   * @param {string}        filePath — absolute path to the plugin file
   * @param {PluginContext} context
   */
  _loadFile(filePath, context) {
    let PluginClass;

    try {
      PluginClass = require(filePath);
    } catch (err) {
      console.error(`[PluginLoader] ERROR: Failed to require ${path.basename(filePath)} — ${err.message}`);
      return;
    }

    // Validate the export extends PluginBase
    const instance = new PluginClass();
    if (!(instance instanceof PluginBase)) {
      console.warn(`[PluginLoader] WARN: ${path.basename(filePath)} does not extend PluginBase — skipped`);
      return;
    }

    try {
      instance.setContext(context);
      instance.load();
      instance.enable();
      this.plugins[instance.name] = instance;
      console.log(`[PluginLoader] Loaded plugin: ${instance.name} v${instance.version}`);
    } catch (err) {
      console.error(`[PluginLoader] ERROR: Failed to load ${instance.name} — ${err.message}`);
    }
  }

  /**
   * Disables and unloads a single plugin by name.
   *
   * @param {string} name
   */
  _unload(name) {
    const plugin = this.plugins[name];
    if (!plugin) return;
    try {
      plugin.disable();
      plugin.unload();
    } catch (err) {
      console.error(`[PluginLoader] ERROR: Failed to unload ${name} — ${err.message}`);
    }
    delete this.plugins[name];
  }
}

module.exports = PluginLoader;
