/**
 * modules/tasks/TaskScheduler.js
 *
 * Drives task execution across all bots at a fixed 1-second interval.
 *
 * Each tick the scheduler:
 *   1. Iterates every bot profile registered in BotManager.
 *   2. Retrieves that bot's TaskManager.
 *   3. If there is an active RUNNING task, calls task.update().
 *   4. If the active task reaches a terminal state (COMPLETED / FAILED /
 *      CANCELLED), calls TaskManager.advance() to start the next queued task.
 *   5. If there is no active task and the queue is non-empty, calls advance()
 *      so the next task begins automatically.
 *
 * Lifecycle:
 *   initialize(botManager) → start() → [pause() / resume()] → stop()
 */

const Task = require('./Task');
const WanderTask = require('./WanderTask');

const TICK_INTERVAL_MS = 1000;

const { RUNNING, PAUSED } = Task.STATES;

class TaskScheduler {
  constructor() {
    /** @type {import('../core/BotManager')|null} */
    this.botManager = null;

    /** @type {NodeJS.Timeout|null} */
    this.timer = null;

    /** @type {boolean} */
    this.running = false;

    /** @type {boolean} Whether ticks are temporarily suspended */
    this.paused = false;
  }

  /**
   * Stores the BotManager reference and starts the scheduler.
   *
   * @param {object} botManager — the initialized BotManager instance
   */
  initialize(botManager) {
    this.botManager = botManager;
    this.start();
    console.log('[TaskScheduler] Initialized');
  }

  /**
   * Starts the 1-second tick interval.
   * Has no effect if the scheduler is already running.
   */
  start() {
    if (this.running) return;

    this.running = true;
    this.timer   = setInterval(() => this._tick(), TICK_INTERVAL_MS);
    console.log('[TaskScheduler] Started');
  }

  /**
   * Stops the tick interval entirely.
   * Call resume() / start() to restart it.
   */
  stop() {
    if (!this.running) return;

    clearInterval(this.timer);
    this.timer   = null;
    this.running = false;
    console.log('[TaskScheduler] Stopped');
  }

  /**
   * Temporarily suspends ticks without clearing the interval.
   * In-progress updates finish their current tick; future ticks are skipped.
   */
  pause() {
    this.paused = true;
    console.log('[TaskScheduler] Paused');
  }

  /**
   * Resumes ticks after a pause().
   */
  resume() {
    this.paused = false;
    console.log('[TaskScheduler] Resumed');
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Executed once per second. Drives task lifecycle for every bot.
   */
  _tick() {
    if (this.paused || !this.botManager) return;

    for (const profile of this.botManager.getProfiles()) {
      const tm     = this.botManager.getTaskManager(profile.id);
      const active = tm.getActive();

      if (active) {
        // Drive a running task
        if (active.state === RUNNING) {
          try {
            active.update();
          } catch (err) {
            active.fail(`Unhandled error in update(): ${err.message}`);
          }
        }

        // Advance when the task reaches a terminal state
        if (active.isFinished()) {
          tm.advance();
        }
      } else if (tm.getQueue().length > 0) {
        // No active task but queue has work — start next immediately
        tm.advance();
      } else {
        // Queue is empty. We no longer wander.
      }
    }
  }
}

module.exports = TaskScheduler;
