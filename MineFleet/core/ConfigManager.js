/**
 * core/ConfigManager.js
 *
 * Responsible for loading, validating, and providing access to
 * all configuration values used across the MineFleet platform.
 * This is initialized first so every other manager can read config.
 */

class ConfigManager {
  constructor() {
    // Will hold parsed configuration once initialized
    this.config = {};
  }

  /**
   * Loads and validates configuration from files or environment.
   * Currently a stub — full implementation added in a later phase.
   */
  initialize() {
    console.log('[ConfigManager] Initialized');
  }
}

module.exports = ConfigManager;
