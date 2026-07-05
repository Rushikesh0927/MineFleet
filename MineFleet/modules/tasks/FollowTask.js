/**
 * modules/tasks/FollowTask.js
 *
 * Continuously follows a Mineflayer entity (usually a player).
 * The task runs indefinitely until explicitly cancelled — it never self-completes
 * because following is an ongoing goal.
 *
 * Use a StopTask or cancelTask() to end this task.
 *
 * Extends Task — uses the standard start/stop lifecycle.
 */

const Task = require('./Task');

class FollowTask extends Task {
  /**
   * @param {object}          entity          — live Mineflayer entity object
   * @param {string}          entityName      — display name for logging
   * @param {MovementManager} movementManager — the bot's MovementManager instance
   * @param {number}          [distance=2]    — follow distance in blocks
   * @param {number}          [priority=0]
   */
  constructor(entity, entityName, movementManager, distance = 2, priority = 0) {
    super(`follow(${entityName})`, priority);

    this.entity     = entity;
    this.entityName = entityName;
    this.mm         = movementManager;
    this.distance   = distance;
  }

  /**
   * Starts following the entity via MovementManager.
   */
  start() {
    super.start();
    this.mm.follow(this.entity, this.distance);
  }

  /**
   * Called every scheduler tick — following is managed by pathfinder so
   * update() is intentionally a no-op. The task stays RUNNING until stopped.
   */
  update() {
    // Pathfinder handles continuous replanning; nothing to do here.
  }

  /**
   * Stops movement when the task is cancelled externally.
   */
  stop() {
    this.mm.stop();
    super.stop();
  }
}

module.exports = FollowTask;
