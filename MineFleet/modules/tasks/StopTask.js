/**
 * modules/tasks/StopTask.js
 *
 * Halts all bot movement immediately and completes in a single tick.
 * Typically assigned when a player sends !stop.
 *
 * Extends Task — completes during start() so the scheduler advances immediately.
 */

const Task = require('./Task');

class StopTask extends Task {
  /**
   * @param {MovementManager} movementManager — the bot's MovementManager instance
   * @param {number}          [priority=10]   — higher default so it jumps the queue
   */
  constructor(movementManager, priority = 10) {
    super('stop()', priority);
    this.mm            = movementManager;
    this.interruptible = true;
  }

  /**
   * Calls MovementManager.stop() and immediately marks the task complete.
   * No update() cycle is needed.
   */
  start() {
    super.start();
    this.mm.stop();
    this.complete();
  }

  /**
   * No-op — task completes within start().
   */
  update() {}
}

module.exports = StopTask;
