/**
 * modules/bot/BotProfile.js
 *
 * A plain data class representing a single bot's configuration profile.
 * Profiles are loaded from config/bots.json by BotManager during startup.
 * No Mineflayer logic lives here — this is purely a data model.
 */

class BotProfile {
  /**
   * @param {object} data — raw bot entry from bots.json
   */
  constructor(data) {
    // Unique identifier for this bot within the platform
    this.id = data.id;

    // The Minecraft username the bot will log in with
    this.username = data.username;

    // Server hostname or IP address to connect to
    this.host = data.host;

    // Server port (default Minecraft port is 25565)
    this.port = data.port;

    // Minecraft protocol version string (e.g. "1.20.1")
    this.version = data.version;

    // Whether this bot should be started automatically on platform boot
    this.enabled = data.enabled !== undefined ? data.enabled : false;

    // Whether the bot should attempt to reconnect after losing connection
    this.autoReconnect = data.autoReconnect !== undefined ? data.autoReconnect : false;
  }
}

module.exports = BotProfile;
