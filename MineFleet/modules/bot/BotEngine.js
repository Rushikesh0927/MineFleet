/**
 * modules/bot/BotEngine.js
 *
 * Interface layer between the MineFleet platform and the Mineflayer library.
 * Manages the full lifecycle of individual bot instances — creation, event
 * binding, removal, and lookup.
 *
 * This file is the only place in the codebase that calls mineflayer.createBot().
 */

const mineflayer = require('mineflayer');

class BotEngine {
  constructor() {
    // Active Mineflayer bot instances keyed by bot ID
    this.bots = {};
  }

  /**
   * Prepares the BotEngine for use.
   */
  initialize() {
    console.log('[BotEngine] Initialized');
  }

  /**
   * Creates a Mineflayer bot from a BotProfile, registers lifecycle events,
   * and stores the instance internally.
   *
   * @param {BotProfile} profile — the bot's configuration profile
   */
  createBot(profile) {
    console.log(`[BotEngine] Creating Bot: ${profile.username}`);

    const bot = mineflayer.createBot({
      username: profile.username,
      host:     profile.host,
      port:     profile.port,
      version:  profile.version,
    });

    // --- Lifecycle events ---------------------------------------------------

    bot.once('login', () => {
      console.log(`[BotEngine] ${profile.username} logged in.`);
    });

    bot.once('spawn', () => {
      console.log(`[BotEngine] ${profile.username} spawned.`);
    });

    bot.on('end', (reason) => {
      console.log(`[BotEngine] ${profile.username} disconnected. Reason: ${reason || 'unknown'}`);
      // Remove the stale instance so it can be recreated on reconnect
      delete this.bots[profile.id];
    });

    bot.on('kicked', (reason) => {
      console.log(`[BotEngine] ${profile.username} kicked. Reason: ${reason || 'unknown'}`);
    });

    bot.on('error', (err) => {
      console.log(`[BotEngine] ${profile.username} error. ${err.message || err}`);
    });

    // Store the live instance
    this.bots[profile.id] = bot;
  }

  /**
   * Gracefully removes a bot instance by ID, ending its connection.
   *
   * @param {string} id — the bot's profile ID
   */
  removeBot(id) {
    const bot = this.bots[id];
    if (bot) {
      bot.quit();
      delete this.bots[id];
    }
    console.log(`[BotEngine] Removing Bot: ${id}`);
  }

  /**
   * Returns the live Mineflayer bot instance for the given ID, or null.
   *
   * @param {string} id
   * @returns {object|null}
   */
  getBot(id) {
    return this.bots[id] || null;
  }

  /**
   * Returns an array of all currently active bot IDs.
   *
   * @returns {string[]}
   */
  listBots() {
    return Object.keys(this.bots);
  }
}

module.exports = BotEngine;
