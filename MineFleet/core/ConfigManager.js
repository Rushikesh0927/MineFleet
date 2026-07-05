/**
 * core/ConfigManager.js
 *
 * Responsible for loading, validating, and providing access to all
 * configuration files used across the MineFleet platform.
 *
 * Config files loaded:
 *   - config/app.json         — general platform settings
 *   - config/bots.json        — bot definitions
 *   - config/permissions.json — role-based permission rules
 *
 * Initialized first in the boot sequence so every other manager
 * can safely call getAppConfig(), getBots(), or getPermissions().
 */

const fs   = require('fs');
const path = require('path');

// Resolve the config directory relative to this file
const CONFIG_DIR = path.join(__dirname, '..', 'config');

// Paths for each config file
const CONFIG_FILES = {
  app:         path.join(CONFIG_DIR, 'app.json'),
  bots:        path.join(CONFIG_DIR, 'bots.json'),
  permissions: path.join(CONFIG_DIR, 'permissions.json'),
};

class ConfigManager {
  constructor() {
    // Parsed contents of each config file; populated by initialize() / reload()
    this.appConfig   = null;
    this.bots        = null;
    this.permissions = null;
  }

  /**
   * Loads all configuration files and validates that each one exists.
   * Prints a success message per file, or a clear error if one is missing.
   */
  initialize() {
    this._load();
    console.log('[ConfigManager] Initialized');
  }

  /**
   * Returns the parsed contents of config/app.json.
   */
  getAppConfig() {
    return this.appConfig;
  }

  /**
   * Returns the parsed contents of config/bots.json.
   */
  getBots() {
    return this.bots;
  }

  /**
   * Returns the parsed contents of config/permissions.json.
   */
  getPermissions() {
    return this.permissions;
  }

  /**
   * Reloads all configuration files from disk.
   * Useful for applying changes without restarting the platform.
   */
  reload() {
    console.log('[ConfigManager] Reloading configuration...');
    this._load();
    console.log('[ConfigManager] Configuration reloaded successfully');
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Reads and parses every config file listed in CONFIG_FILES.
   * Validates existence before parsing; logs success or error per file.
   */
  _load() {
    this.appConfig   = this._readFile('app',         CONFIG_FILES.app);
    this.bots        = this._readFile('bots',        CONFIG_FILES.bots);
    this.permissions = this._readFile('permissions', CONFIG_FILES.permissions);
  }

  /**
   * Reads and JSON-parses a single config file.
   * @param {string} label   — human-readable name used in log messages
   * @param {string} filePath — absolute path to the JSON file
   * @returns {object|null}  — parsed object, or null on failure
   */
  _readFile(label, filePath) {
    if (!fs.existsSync(filePath)) {
      console.error(`[ConfigManager] ERROR: Missing config file — ${filePath}`);
      return null;
    }

    try {
      const raw    = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(raw);
      console.log(`[ConfigManager] Loaded ${label}.json`);
      return parsed;
    } catch (err) {
      console.error(`[ConfigManager] ERROR: Failed to parse ${label}.json — ${err.message}`);
      return null;
    }
  }
}

module.exports = ConfigManager;
