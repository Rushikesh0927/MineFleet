/**
 * modules/movement/MovementManager.js
 *
 * Wraps mineflayer-pathfinder to provide high-level movement control for a
 * single bot. One instance is created per bot inside BotEngine and stored
 * alongside that bot's TaskManager.
 *
 * MovementManager is the ONLY layer that calls pathfinder or bot.lookAt
 * directly. Movement Tasks call MovementManager methods; they never touch
 * the Mineflayer bot or pathfinder API themselves.
 *
 * Public API:
 *   initialize(bot)       — load pathfinder plugin and wire state listeners
 *   goto(x, y, z)        — navigate to an absolute block position
 *   follow(entity)       — continuously follow a Mineflayer entity
 *   stop()               — halt all movement immediately
 *   lookAt(x, y, z)      — rotate bot's head to face a world position
 *   isMoving()           — true while pathfinder is actively running a goal
 */

const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const { GoalBlock, GoalFollow, GoalNear } = goals;

class MovementManager {
  constructor() {
    /** @type {object|null} Live Mineflayer bot instance */
    this.bot = null;

    /** @type {boolean} True while pathfinder is actively pursuing a goal */
    this._moving = false;
  }

  /**
   * Loads the pathfinder plugin into the bot and wires internal state listeners.
   * Must be called once, immediately after the Mineflayer bot is created.
   *
   * @param {object} bot — live Mineflayer bot instance
   */
  initialize(bot) {
    this.bot = bot;

    // Load pathfinder only if not already present (guards against double-init)
    if (!bot.pathfinder) {
      bot.loadPlugin(pathfinder);
    }

    // Track movement state through pathfinder's own events
    bot.on('goal_reached', () => {
      this._moving = false;
      console.log(`[MovementManager] ${bot.username} reached goal.`);
    });

    bot.on('path_update', (result) => {
      if (result.status === 'noPath') {
        this._moving = false;
        console.log(`[MovementManager] ${bot.username} no path found.`);
      }
    });

    bot.on('goal_updated', () => {
      // A new goal was set — we are moving again
      this._moving = true;
    });

    console.log(`[MovementManager] Initialized for ${bot.username}`);
  }

  /**
   * Navigates the bot to an absolute block position using A* pathfinding.
   *
   * @param {number} x
   * @param {number} y
   * @param {number} z
   */
  goto(x, y, z) {
    if (!this._assertReady('goto')) return;

    const movements = new Movements(this.bot);
    movements.canDig = false;         // Don't break blocks while pathfinding
    movements.allow1by1towers = false; // Don't build towers
    this.bot.pathfinder.setMovements(movements);
    this.bot.pathfinder.setGoal(new GoalBlock(
      Math.floor(x),
      Math.floor(y),
      Math.floor(z),
    ));

    this._moving = true;
    console.log(`[MovementManager] ${this.bot.username} navigating to (${x}, ${y}, ${z})`);
  }

  /**
   * Navigates to within `range` blocks of a position (doesn't need to stand exactly on it).
   */
  gotoNear(x, y, z, range = 2) {
    if (!this._assertReady('gotoNear')) return;

    const movements = new Movements(this.bot);
    movements.canDig = false;
    movements.allow1by1towers = false;
    movements.allowParkour = true;
    this.bot.pathfinder.setMovements(movements);
    this.bot.pathfinder.setGoal(new GoalNear(
      Math.floor(x),
      Math.floor(y),
      Math.floor(z),
      range,
    ));

    this._moving = true;
    console.log(`[MovementManager] ${this.bot.username} navigating near (${x}, ${y}, ${z}) range=${range}`);
  }

  /**
   * Continuously follows a Mineflayer entity (e.g. a player entity object).
   * The goal is dynamic — pathfinder re-plans as the entity moves.
   *
   * @param {object} entity — Mineflayer entity object (e.g. bot.players[name].entity)
   * @param {number} [distance=2] — how close to get before considering goal reached
   */
  follow(entity, distance = 2) {
    if (!this._assertReady('follow')) return;

    const movements = new Movements(this.bot);
    this.bot.pathfinder.setMovements(movements);
    // dynamic=true means the goal updates as the entity moves
    this.bot.pathfinder.setGoal(new GoalFollow(entity, distance), true);

    this._moving = true;
    console.log(`[MovementManager] ${this.bot.username} following entity`);
  }

  /**
   * Immediately halts all pathfinder movement.
   */
  stop() {
    if (!this._assertReady('stop')) return;

    this.bot.pathfinder.stop();
    this._moving = false;
    console.log(`[MovementManager] ${this.bot.username} movement stopped`);
  }

  /**
   * Rotates the bot's head to face the given world position smoothly like a human.
   *
   * @param {number} x
   * @param {number} y
   * @param {number} z
   */
  async lookAt(x, y, z) {
    if (!this._assertReady('lookAt')) return;

    const Humanizer = require('./Humanizer');
    console.log(`[MovementManager] ${this.bot.username} smoothly looking at (${x}, ${y}, ${z})`);
    await Humanizer.smoothLook(this.bot, { x, y, z });
  }

  /**
   * Returns true while pathfinder is actively pursuing a goal.
   *
   * @returns {boolean}
   */
  isMoving() {
    return this._moving;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Checks that the bot and pathfinder are ready. Logs an error if not.
   *
   * @param {string} callerName — name of the calling method (for error messages)
   * @returns {boolean}
   */
  _assertReady(callerName) {
    if (!this.bot) {
      console.error(`[MovementManager] ${callerName}() called before initialize().`);
      return false;
    }
    if (!this.bot.pathfinder) {
      console.error(`[MovementManager] pathfinder not loaded — call initialize() first.`);
      return false;
    }
    return true;
  }
}

module.exports = MovementManager;
