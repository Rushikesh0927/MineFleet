/**
 * ContinuousLocalPlanner.js (Phase 6)
 * 
 * Takes the winning action from DynamicUtilityNetwork and breaks it into MicroTasks.
 * Re-validates the current micro-task every 200-400ms.
 */

class ContinuousLocalPlanner {
  constructor(bot) {
    this.bot = bot;
    
    /** @type {import('./Types').MicroTask} */
    this.currentTask = null;
  }

  /**
   * Called every tick to check if current task is valid, or generate a new one.
   * @param {string} intent - The winning action from UtilityNetwork (e.g. 'flee', 'gather_resource')
   * @param {import('./Types').UtilityContext} context 
   * @param {import('./Types').PredictionSet} predictions 
   */
  tick(intent, context, predictions) {
    // If the intent changed, abort current task
    if (this.currentTask && !this.currentTask.id.startsWith(intent)) {
      this.currentTask = null;
    }

    // Re-validate current task
    if (this.currentTask) {
      if (!this.currentTask.checkValidity(context, predictions)) {
        this.currentTask = null;
      }
    }

    // Generate new task if needed
    if (!this.currentTask) {
      this.currentTask = this._generateTask(intent, context);
    }
  }

  _generateTask(intent, context) {
    if (intent === 'flee') {
      const threats = context.observation.threats;
      if (threats.length === 0) return null;
      
      const pos = this.bot.entity.position;
      const tPos = threats[0].position;
      const target = pos.offset(pos.x - tPos.x, 0, pos.z - tPos.z); // run away
      
      return {
        id: `flee_${Date.now()}`,
        type: 'move_to',
        target,
        checkValidity: (ctx) => ctx.observation.threats.length > 0
      };
    }

    if (intent === 'gather_resource' && context.tacticalGoal) {
      const isStone = context.tacticalGoal.targetParams === 'gather_stone';
      const blockTypes = isStone ? new Set(['stone', 'cobblestone', 'coal_ore', 'iron_ore']) : new Set(['oak_log', 'spruce_log', 'birch_log']);
      const blocks = this.bot.findBlocks({ matching: b => blockTypes.has(b.name), maxDistance: 32, count: 1 });
      
      if (blocks.length > 0) {
        return {
          id: `gather_resource_${Date.now()}`,
          type: 'interact_block', // abstract intent, movement controller handles walking to it
          target: blocks[0],
          checkValidity: (ctx) => true // valid until broken
        };
      }
    }

    if (intent === 'follow_target') {
      // Find the closest player
      const players = Object.values(this.bot.players).filter(p => p.entity && p.username !== this.bot.username);
      if (players.length > 0) {
        // Sort by distance
        players.sort((a, b) => a.entity.position.distanceTo(this.bot.entity.position) - b.entity.position.distanceTo(this.bot.entity.position));
        return {
          id: `follow_${Date.now()}`,
          type: 'move_to',
          target: players[0].entity.position,
          checkValidity: (ctx) => true // valid until intent changes
        };
      }
    }

    if (intent === 'explore_structure') {
      const pos = this.bot.entity.position;
      const r = 16;
      const target = pos.offset((Math.random() - 0.5) * r, 0, (Math.random() - 0.5) * r);
      return {
        id: `explore_${Date.now()}`,
        type: 'move_to',
        target,
        checkValidity: (ctx) => true
      };
    }

    // Default idle
    return {
      id: `idle_${Date.now()}`,
      type: 'aim_at',
      target: null,
      checkValidity: () => true
    };
  }

  getMicroTask() {
    return this.currentTask;
  }
}

module.exports = ContinuousLocalPlanner;
