/**
 * modules/tasks/GotoTask.js
 *
 * Navigates a bot to an absolute world position using MovementManager.
 * The task is COMPLETED when pathfinder fires goal_reached (tracked via
 * MovementManager.isMoving() returning false after movement has started).
 *
 * Extends Task — uses the standard start/update/stop lifecycle.
 */

const Task = require('./Task');

class GotoTask extends Task {
  /**
   * @param {number}          x
   * @param {number}          y
   * @param {number}          z
   * @param {MovementManager} movementManager — the bot's MovementManager instance
   * @param {number}          [priority=0]
   */
  constructor(x, y, z, movementManager, priority = 0) {
    super(`goto(${x},${y},${z})`, priority);

    this.x  = x;
    this.y  = y;
    this.z  = z;
    this.mm = movementManager;

    // Used to detect when movement actually begins so we don't complete early
    this._started = false;
  }

  /**
   * Issues the goto command to MovementManager.
   */
  start() {
    super.start();
    this.mm.goto(this.x, this.y, this.z);
    this._started = true;
  }

  /**
   * Called every scheduler tick while RUNNING.
   * Completes the task once movement has finished (goal reached or no path).
   */
  update() {
    // Give pathfinder one tick to start before checking
    if (this._started && !this.mm.isMoving()) {
      this.complete();
    }
  }

  /**
   * Stops movement when the task is cancelled externally.
   */
  stop() {
    this.mm.stop();
    super.stop();
  }
}

module.exports = GotoTask;
