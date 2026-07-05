/**
 * modules/tasks/LookAtTask.js
 *
 * Rotates the bot's head to face a world position and completes immediately.
 * This is a fire-and-forget task — no pathfinding involved.
 *
 * Extends Task — completes during start() so the scheduler advances immediately.
 */

const Task = require('./Task');

class LookAtTask extends Task {
  /**
   * @param {number}          x
   * @param {number}          y
   * @param {number}          z
   * @param {MovementManager} movementManager — the bot's MovementManager instance
   * @param {number}          [priority=0]
   */
  constructor(x, y, z, movementManager, priority = 0) {
    super(`lookAt(${x},${y},${z})`, priority);

    this.x  = x;
    this.y  = y;
    this.z  = z;
    this.mm = movementManager;
    this.interruptible = true;
  }

  /**
   * Calls MovementManager.lookAt() and immediately marks the task complete.
   * No update() cycle is needed.
   */
  start() {
    super.start();
    this.mm.lookAt(this.x, this.y, this.z);
    this.complete();
  }

  /**
   * No-op — task completes within start().
   */
  update() {}
}

module.exports = LookAtTask;
