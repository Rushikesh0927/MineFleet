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
      // Find nearest log
      const logBlocks = new Set(['oak_log', 'spruce_log', 'birch_log']);
      const blocks = this.bot.findBlocks({ matching: b => logBlocks.has(b.name), maxDistance: 32, count: 1 });
      
      if (blocks.length > 0) {
        return {
          id: `gather_resource_${Date.now()}`,
          type: 'interact_block', // abstract intent, movement controller handles walking to it
          target: blocks[0],
          checkValidity: (ctx) => true // valid until broken
        };
      }
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
