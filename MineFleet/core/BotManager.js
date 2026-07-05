/**
 * core/BotManager.js
 *
 * Manages the lifecycle of all Minecraft bots — creation, connection,
 * reconnection, and shutdown. Acts as the central registry for every
 * active bot instance on the platform.
 *
 * During initialization it reads bot definitions from ConfigManager,
 * converts each JSON entry into a BotProfile, and stores them internally.
 * No Mineflayer connections are made here.
 */

const BotProfile = require('../modules/bot/BotProfile');

class BotManager {
  constructor() {
    // Active bot instances keyed by bot ID (populated when bots are started)
    this.bots = {};

    // Loaded BotProfile objects keyed by bot ID
    this.profiles = {};
  }

  /**
   * Reads bot definitions from ConfigManager, converts them to BotProfiles,
   * and stores them internally.
   *
   * @param {ConfigManager} configManager — the already-initialized config manager
   */
  initialize(configManager) {
    this.loadProfiles(configManager);
    console.log('[BotManager] Initialized');
  }

  /**
   * Reads every bot entry from ConfigManager, wraps each in a BotProfile,
   * and stores it in this.profiles. Logs how many profiles were loaded.
   *
   * @param {ConfigManager} configManager
   */
  loadProfiles(configManager) {
    const config = configManager.getBots();

    if (!config || !Array.isArray(config.bots)) {
      console.error('[BotManager] ERROR: No bot definitions found in bots.json');
      return;
    }

    // Reset profiles before (re)loading
    this.profiles = {};

    for (const entry of config.bots) {
      const profile = new BotProfile(entry);
      this.profiles[profile.id] = profile;
    }

    const count = Object.keys(this.profiles).length;
    console.log(`[BotManager] Loaded ${count} Bot Profile${count !== 1 ? 's' : ''}`);
  }

  /**
   * Returns the BotProfile for the given bot ID, or null if not found.
   *
   * @param {string} id
   * @returns {BotProfile|null}
   */
  getProfile(id) {
    return this.profiles[id] || null;
  }

  /**
   * Returns an array of all loaded BotProfile objects.
   *
   * @returns {BotProfile[]}
   */
  getProfiles() {
    return Object.values(this.profiles);
  }
}

module.exports = BotManager;
