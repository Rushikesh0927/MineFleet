/**
 * modules/tasks/WanderTask.js
 *
 * Makes the bot wander randomly to a nearby block (within 4 blocks) to prevent AFK kicks.
 * This task completes once the movement starts, so it doesn't block the queue indefinitely.
 */

const Task = require('./Task');

class WanderTask extends Task {
  /**
   * @param {object} bot — live Mineflayer bot instance
   * @param {object} mm  — MovementManager
   * @param {number} [priority=-10] — Low priority so it doesn't preempt real tasks
   */
  constructor(bot, mm, priority = -10) {
    super('wander', priority);
    this.bot = bot;
    this.mm = mm;
    this.interruptible = true;
  }

  start() {
    super.start();
    
    if (!this.bot || !this.bot.entity || !this.bot.entity.position) {
      this.complete();
      return;
    }

    const pos = this.bot.entity.position;
    // Random offset between -4 and +4
    const dx = (Math.random() * 8) - 4;
    const dz = (Math.random() * 8) - 4;
    
    this.mm.goto(pos.x + dx, pos.y, pos.z + dz);
    
    // Complete immediately so the queue can advance.
    // The MovementManager will continue moving the bot in the background until it reaches the goal.
    // If a new movement task is queued, it will safely overwrite this goal.
    this.complete();
  }

  update() {}
}

module.exports = WanderTask;
