/**
 * modules/tasks/SneakTask.js
 *
 * Toggles the bot's sneak state.
 * Completes immediately (fire-and-forget).
 */

const Task = require('./Task');

class SneakTask extends Task {
  /**
   * @param {object}  bot     — live Mineflayer bot instance
   * @param {boolean} enabled — true to sneak, false to unsneak
   * @param {number}  [priority=0]
   */
  constructor(bot, enabled, priority = 0) {
    super(`sneak(${enabled})`, priority);
    this.bot = bot;
    this.enabled = enabled;
    this.interruptible = true;
  }

  start() {
    super.start();
    this.bot.setControlState('sneak', this.enabled);
    this.complete();
  }

  update() {}
}

module.exports = SneakTask;
