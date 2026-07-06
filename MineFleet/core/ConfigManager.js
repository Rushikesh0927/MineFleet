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
  fleetProfiles: path.join(CONFIG_DIR, 'profiles.json'),
  servers:     path.join(CONFIG_DIR, 'servers.json'),
};

class ConfigManager {
  constructor() {
    // Parsed contents of each config file; populated by initialize() / reload()
    this.appConfig     = null;
    this.bots          = null;
    this.permissions   = null;
    this.fleetProfiles = null;
    this.servers       = null;
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
   * Returns the parsed contents of config/profiles.json.
   */
  getFleetProfiles() {
    return this.fleetProfiles?.profiles || [];
  }

  /**
   * Returns the parsed contents of config/servers.json.
   */
  getServers() {
    return this.servers?.servers || [];
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

  /**
   * Persists the in-memory bots array back to config/bots.json.
   * Called by BotManager whenever a bot is added, removed, or renamed so
   * that the change survives a platform restart.
   *
   * @param {object[]} botsArray — array of plain bot-config objects (NOT BotProfile instances)
   * @returns {boolean} true on success, false on failure
   */
  saveBots(botsArray) {
    try {
      const payload = JSON.stringify({ bots: botsArray }, null, 2);
      fs.writeFileSync(CONFIG_FILES.bots, payload, 'utf8');
      // Keep in-memory copy in sync
      this.bots = { bots: botsArray };
      console.log('[ConfigManager] bots.json saved successfully');
      return true;
    } catch (err) {
      console.error(`[ConfigManager] ERROR: Failed to save bots.json — ${err.message}`);
      return false;
    }
  }

  /**
   * Persists the in-memory fleet profiles array back to config/profiles.json.
   *
   * @param {object[]} profilesArray
   * @returns {boolean} true on success, false on failure
   */
  saveFleetProfiles(profilesArray) {
    try {
      const payload = JSON.stringify({ profiles: profilesArray }, null, 2);
      fs.writeFileSync(CONFIG_FILES.fleetProfiles, payload, 'utf8');
      // Keep in-memory copy in sync
      this.fleetProfiles = { profiles: profilesArray };
      console.log('[ConfigManager] profiles.json saved successfully');
      return true;
    } catch (err) {
      console.error(`[ConfigManager] ERROR: Failed to save profiles.json — ${err.message}`);
      return false;
    }
  }

  /**
   * Persists the in-memory servers array back to config/servers.json.
   *
   * @param {object[]} serversArray
   * @returns {boolean} true on success, false on failure
   */
  saveServers(serversArray) {
    try {
      const payload = JSON.stringify({ servers: serversArray }, null, 2);
      fs.writeFileSync(CONFIG_FILES.servers, payload, 'utf8');
      // Keep in-memory copy in sync
      this.servers = { servers: serversArray };
      console.log('[ConfigManager] servers.json saved successfully');
      return true;
    } catch (err) {
      console.error(`[ConfigManager] ERROR: Failed to save servers.json — ${err.message}`);
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Reads and parses every config file listed in CONFIG_FILES.
   * Validates existence before parsing; logs success or error per file.
   */
  _load() {
    this.appConfig     = this._readFile('app',         CONFIG_FILES.app);
    this.bots          = this._readFile('bots',        CONFIG_FILES.bots);
    this.permissions   = this._readFile('permissions', CONFIG_FILES.permissions);
    this.fleetProfiles = this._readFile('profiles',    CONFIG_FILES.fleetProfiles) || { profiles: [] };
    this.servers       = this._readFile('servers',     CONFIG_FILES.servers) || { servers: [{ id: 'default', name: 'Default Server', host: 'localhost', port: 25565, version: '1.20.4' }] };
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
