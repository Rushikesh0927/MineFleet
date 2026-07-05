/**
 * modules/tasks/Task.js
 *
 * Abstract base class for all MineFleet tasks.
 *
 * A Task represents a discrete unit of work to be performed by a bot.
 * Tasks are managed by a per-bot TaskManager and driven by the TaskScheduler.
 *
 * States (in typical lifecycle order):
 *   PENDING   → task created, not yet started
 *   RUNNING   → task is actively executing
 *   PAUSED    → task suspended; will resume from where it left off
 *   COMPLETED → task finished successfully
 *   FAILED    → task encountered an unrecoverable error
 *   CANCELLED → task was explicitly stopped before completion
 *
 * Subclasses override update() with their actual work logic.
 * The TaskScheduler calls update() once per second while state === RUNNING.
 */

const STATES = {
  PENDING:   'PENDING',
  RUNNING:   'RUNNING',
  PAUSED:    'PAUSED',
  COMPLETED: 'COMPLETED',
  FAILED:    'FAILED',
  CANCELLED: 'CANCELLED',
};

let _nextId = 1;

class Task {
  /**
   * @param {string} name     — human-readable task name
   * @param {number} priority — higher value = higher priority (default 0)
   */
  constructor(name, priority = 0) {
    /** @type {string} Unique task ID auto-assigned at construction */
    this.id = `task-${_nextId++}`;

    /** @type {string} */
    this.name = name;

    /** @type {number} */
    this.priority = priority;

    /** @type {string} One of the STATES constants */
    this.state = STATES.PENDING;

    /** @type {Date} */
    this.createdAt = new Date();

    /**
     * When true, this task can be immediately replaced by another interruptible
     * task without waiting for the current task to finish.
     * Set to true in movement task subclasses.
     * @type {boolean}
     */
    this.interruptible = false;
  }

  /**
   * Transitions the task to RUNNING.
   * Override in subclasses to perform one-time setup.
   */
  start() {
    this.state = STATES.RUNNING;
    console.log(`[Task] ${this.name} (${this.id}) started.`);
  }

  /**
   * Called by the TaskScheduler once per second while state === RUNNING.
   * Override in subclasses to implement the task's repeating work logic.
   * Call this.complete() or this.fail() when the task should end.
   */
  update() {}

  /**
   * Suspends the task. The scheduler will stop calling update() until resume().
   */
  pause() {
    if (this.state === STATES.RUNNING) {
      this.state = STATES.PAUSED;
      console.log(`[Task] ${this.name} (${this.id}) paused.`);
    }
  }

  /**
   * Resumes a paused task back to RUNNING.
   */
  resume() {
    if (this.state === STATES.PAUSED) {
      this.state = STATES.RUNNING;
      console.log(`[Task] ${this.name} (${this.id}) resumed.`);
    }
  }

  /**
   * Cancels the task immediately, regardless of current state.
   */
  stop() {
    this.state = STATES.CANCELLED;
    console.log(`[Task] ${this.name} (${this.id}) cancelled.`);
  }

  /**
   * Marks the task as successfully completed.
   * Call this from within update() when the task's goal is achieved.
   */
  complete() {
    this.state = STATES.COMPLETED;
    console.log(`[Task] ${this.name} (${this.id}) completed.`);
  }

  /**
   * Marks the task as failed.
   * @param {string} [reason] — optional description of what went wrong
   */
  fail(reason) {
    this.state = STATES.FAILED;
    console.log(`[Task] ${this.name} (${this.id}) failed.${reason ? ` Reason: ${reason}` : ''}`);
  }

  /**
   * Returns true when the task has reached a terminal state.
   *
   * @returns {boolean}
   */
  isFinished() {
    return (
      this.state === STATES.COMPLETED ||
      this.state === STATES.FAILED    ||
      this.state === STATES.CANCELLED
    );
  }
}

Task.STATES = STATES;

module.exports = Task;
