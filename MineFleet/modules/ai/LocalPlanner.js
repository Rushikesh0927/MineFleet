/**
 * LocalPlanner.js
 * 
 * Breaks down Macro Actions (from UtilityDecisionEngine) into Micro Sequences.
 * 
 * Example:
 * Goal: gather_wood
 * Sequence: [find_tree, look_at_trunk, walk_to_trunk, mine_block]
 */

const NeuralMovementController = require('../movement/NeuralMovementController');

class LocalPlanner {
  constructor(bot, spatialMemory) {
    this.bot = bot;
    this.spatial = spatialMemory;
    this.controller = new NeuralMovementController(bot, spatialMemory);

    this.macroAction = null;
    this.context = null;
    
    // State machine for current macro sequence
    this.step = 0;
    this.targetBlock = null;
  }

  start() {
    this.controller.start();
  }

  stop() {
    this.controller.stop();
  }

  setMacroAction(action, context) {
    this.macroAction = action;
    this.context = context;
    this.step = 0;
    this.targetBlock = null;

    // Reset the movement controller when switching tasks
    this.controller.setTarget(null, 'idle');
  }

  // Evaluated frequently by UtilityEngine
  // Checks if the current micro-action is complete, and sets the next one on the controller
  tick() {
    if (!this.macroAction) return;

    try {
      switch (this.macroAction) {
        case 'flee': this._planFlee(); break;
        case 'investigate': this._planInvestigate(); break;
        case 'eat': this._planEat(); break;
        case 'execute_brain_goal': this._planBrainGoal(); break;
        case 'idle': this.controller.setTarget(null, 'idle'); break;
      }
    } catch (err) {
      console.error(`[LocalPlanner] Tick error:`, err);
    }
  }

  _planFlee() {
    const threat = this.context.threat;
    if (!threat || !threat.entity.position) {
      this.setMacroAction('idle', {});
      return;
    }

    // Move in opposite direction
    const pos = this.bot.entity.position;
    const dx = pos.x - threat.entity.position.x;
    const dz = pos.z - threat.entity.position.z;
    
    const target = pos.offset(dx, 0, dz); // Vector pointing away from threat
    this.controller.setTarget(target, 'sprint');
  }

  _planInvestigate() {
    const obj = this.context.target;
    if (!obj) {
      this.setMacroAction('idle', {});
      return;
    }

    const pos = this.bot.entity.position;
    const dist = pos.distanceTo(obj.position);

    if (dist < 3) {
      // Reached it, stare at it for a moment, then done
      this.controller.setTarget(obj.position, 'look_only');
      // In a real system, we'd fire an event to clear this from curiosity
      return;
    }

    this.controller.setTarget(obj.position, 'walk');
  }

  _planEat() {
    // Neural controller handles looking down and walking slowly while eating
    this.controller.setTarget(null, 'eat');
  }

  _planBrainGoal() {
    const goal = this.context.goal;
    
    // Map Nemotron's goal string to micro-logic
    if (goal === 'gather_wood') {
      this._planGatherWood();
    } else if (goal === 'explore') {
      this._planExplore();
    } else {
      // Fallback
      this.controller.setTarget(null, 'idle');
    }
  }

  _planGatherWood() {
    if (this.step === 0) {
      // Find tree
      const logBlocks = new Set(['oak_log', 'spruce_log', 'birch_log', 'jungle_log', 'acacia_log', 'dark_oak_log']);
      const blocks = this.bot.findBlocks({ matching: b => logBlocks.has(b.name), maxDistance: 32, count: 1 });
      
      if (blocks.length > 0) {
        this.targetBlock = this.bot.blockAt(blocks[0]);
        this.step = 1;
      } else {
        // No trees, explore
        this._planExplore();
      }
    } else if (this.step === 1) {
      // Walk to tree
      const dist = this.bot.entity.position.distanceTo(this.targetBlock.position);
      if (dist < 3) {
        this.step = 2; // Close enough, start mining
      } else {
        this.controller.setTarget(this.targetBlock.position, 'walk');
      }
    } else if (this.step === 2) {
      // Mine block
      // The controller takes 'mine' intent and handles the smooth looking and clicking
      this.controller.setTarget(this.targetBlock.position, 'mine');
      
      // If block becomes air, go back to step 0
      const currentBlock = this.bot.blockAt(this.targetBlock.position);
      if (!currentBlock || currentBlock.name === 'air') {
        this.step = 0;
      }
    }
  }

  _planExplore() {
    // Pick a random spot 20 blocks away and walk to it
    if (this.step === 0) {
      const pos = this.bot.entity.position;
      const angle = Math.random() * Math.PI * 2;
      this.targetBlock = pos.offset(Math.cos(angle) * 20, 0, Math.sin(angle) * 20);
      this.step = 1;
    } else if (this.step === 1) {
      const dist = this.bot.entity.position.distanceTo(this.targetBlock);
      if (dist < 3) {
        this.step = 0;
      } else {
        this.controller.setTarget(this.targetBlock, 'walk');
      }
    }
  }
}

module.exports = LocalPlanner;
