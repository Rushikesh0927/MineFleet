/**
 * modules/tasks/TaskManager.js
 *
 * Per-bot task queue. Each bot in BotManager owns exactly one TaskManager.
 *
 * Rules:
 *   - Only one task may be RUNNING at a time (the "active" slot).
 *   - Additional tasks are pushed into a FIFO queue.
 *   - When the active task reaches a terminal state, the TaskScheduler calls
 *     advance() to dequeue and start the next pending task automatically.
 *   - Tasks in the queue are sorted by priority (higher first) on insertion.
 */

const Task = require('./Task');

class TaskManager {
  /**
   * @param {string} botId — the ID of the bot this manager belongs to
   */
  constructor(botId) {
    /** @type {string} */
    this.botId = botId;

    /** @type {Task|null} The currently executing task */
    this.activeTask = null;

    /** @type {Task[]} Pending tasks sorted by descending priority */
    this.queue = [];
  }

  /**
   * Assigns a task to this bot.
   *
   * If no task is active the new task is started immediately.
   * Otherwise it is inserted into the queue in priority order
   * (higher priority tasks run first; equal-priority tasks are FIFO).
   *
   * @param {Task} task
   */
  assign(task) {
    if (!(task instanceof Task)) {
      console.error(`[TaskManager:${this.botId}] assign() received a non-Task object.`);
      return;
    }

    if (!this.activeTask) {
      this._activate(task);
    } else {
      // Insert at the correct position to maintain priority order
      const insertAt = this.queue.findIndex(t => t.priority < task.priority);
      if (insertAt === -1) {
        this.queue.push(task);
      } else {
        this.queue.splice(insertAt, 0, task);
      }
      console.log(`[TaskManager:${this.botId}] Queued task "${task.name}" (priority ${task.priority}). Queue length: ${this.queue.length}`);
    }
  }

  /**
   * Cancels the active task and clears the queue.
   * Does nothing if there is no active task.
   */
  cancel() {
    if (this.activeTask) {
      this.activeTask.stop();
      this.activeTask = null;
    }
    this.queue = [];
    console.log(`[TaskManager:${this.botId}] Active task and queue cleared.`);
  }

  /**
   * Dequeues the next pending task and starts it.
   * Called by TaskScheduler when the active task reaches a terminal state.
   */
  advance() {
    this.activeTask = null;

    if (this.queue.length === 0) return;

    const next = this.queue.shift();
    this._activate(next);
  }

  /**
   * Returns the currently active Task, or null.
   *
   * @returns {Task|null}
   */
  getActive() {
    return this.activeTask;
  }

  /**
   * Returns a shallow copy of the pending task queue.
   *
   * @returns {Task[]}
   */
  getQueue() {
    return [...this.queue];
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Starts a task and sets it as the active task.
   *
   * @param {Task} task
   */
  _activate(task) {
    this.activeTask = task;
    console.log(`[TaskManager:${this.botId}] Starting task "${task.name}" (${task.id})`);
    try {
      task.start();
    } catch (err) {
      task.fail(`Error during start: ${err.message}`);
    }
  }
}

module.exports = TaskManager;
