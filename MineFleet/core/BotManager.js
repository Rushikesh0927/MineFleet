/**
 * core/BotManager.js
 *
 * Manages the lifecycle of all Minecraft bots — creation, connection,
 * reconnection, and shutdown. Acts as the central registry for every
 * active bot profile on the platform.
 *
 * During initialization it:
 *   1. Reads bot definitions from ConfigManager and converts them to BotProfiles.
 *   2. For every enabled profile, delegates to BotEngine to create the connection.
 */

const BotProfile = require('../modules/bot/BotProfile');

class BotManager {
  constructor() {
    // Loaded BotProfile objects keyed by bot ID
    this.profiles = {};
  }

  /**
   * Loads profiles from config then starts every enabled bot via BotEngine.
   *
   * @param {ConfigManager} configManager — the already-initialized config manager
   * @param {BotEngine}     botEngine     — the already-initialized bot engine
   */
  initialize(configManager, botEngine) {
    this.loadProfiles(configManager);

    // Start every profile that is marked enabled
    for (const profile of this.getProfiles()) {
      if (profile.enabled) {
        botEngine.createBot(profile);
      }
    }

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
