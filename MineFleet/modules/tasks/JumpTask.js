/**
 * modules/tasks/JumpTask.js
 *
 * Causes the bot to jump once.
 * Completes immediately (fire-and-forget).
 */

const Task = require('./Task');

class JumpTask extends Task {
  /**
   * @param {object} bot — live Mineflayer bot instance
   * @param {number} [priority=0]
   */
  constructor(bot, priority = 0) {
    super('jump', priority);
    this.bot = bot;
    this.interruptible = true;
  }

  start() {
    super.start();
    
    // Trigger jump
    this.bot.setControlState('jump', true);
    
    // Release jump next tick so it doesn't bunny hop forever
    setTimeout(() => {
      if (this.bot) this.bot.setControlState('jump', false);
    }, 250);
    
    this.complete();
  }

  update() {}
}

module.exports = JumpTask;
