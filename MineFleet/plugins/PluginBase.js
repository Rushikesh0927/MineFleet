/**
 * plugins/PluginBase.js
 *
 * Abstract base class for all MineFleet plugins.
 *
 * Every plugin must extend this class and implement the lifecycle methods.
 * The platform calls them in this order:
 *
 *   load()    → plugin is loaded; register commands and event listeners here
 *   enable()  → plugin is activated
 *   disable() → plugin is deactivated but not yet removed
 *   unload()  → plugin is removed; clean up resources here
 *
 * Plugins receive a PluginContext via setContext() before load() is called.
 */

class PluginBase {
  /**
   * @param {string} name        — unique plugin identifier
   * @param {string} version     — semver string
   * @param {string} description — short human-readable description
   */
  constructor(name, version, description) {
    this.name        = name;
    this.version     = version;
    this.description = description;

    // Set by PluginLoader before load() is called
    this.context = null;

    // Tracks whether the plugin is currently active
    this.enabled = false;
  }

  /**
   * Provides the plugin with access to all platform managers.
   * Called by PluginLoader before load().
   *
   * @param {PluginContext} context
   */
  setContext(context) {
    this.context = context;
  }

  /**
   * Called once when the plugin is loaded into the platform.
   * Register commands, bind event listeners, and initialize state here.
   * Override in subclasses.
   */
  load() {}

  /**
   * Called to activate the plugin after it has been loaded.
   * Override in subclasses — always call super.enable() to set the flag.
   */
  enable() {
    this.enabled = true;
  }

  /**
   * Called to deactivate the plugin without removing it.
   * Override in subclasses — always call super.disable() to clear the flag.
   */
  disable() {
    this.enabled = false;
  }

  /**
   * Called when the plugin is permanently removed from the platform.
   * Unregister commands and remove event listeners here.
   * Override in subclasses.
   */
  unload() {}
}

module.exports = PluginBase;
