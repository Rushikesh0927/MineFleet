/**
 * LearnedMovementController.js (Phase 7)
 * 
 * Replaces NeuralMovementController.
 * This is currently a heuristic placeholder, but implements the exact signature
 * of a future ML model (Observation -> MovementCommand).
 */

const { Vec3 } = require('vec3');

class LearnedMovementController {
  constructor(bot) {
    this.bot = bot;
  }

  /**
   * @param {import('../ai/Types').MicroTask} task 
   * @param {import('../ai/Types').WorldObservation} observation 
   * @returns {import('../ai/Types').MovementCommand}
   */
  computeMovementCommand(task, observation) {
    const cmd = {
      mouseXDelta: 0, mouseYDelta: 0,
      forward: false, backward: false, left: false, right: false,
      sprint: false, jump: false, sneak: false, attack: false, use: false, hotbarSlot: 0
    };

    if (!task || task.type === 'idle' || !task.target) {
      if (this.bot.movementManager && this.bot.movementManager.isMoving()) {
        this.bot.movementManager.stop();
      }
      return cmd; // Stand still
    }

    const pos = this.bot.entity.position;

    if (task.type === 'move_to' || task.type === 'interact_block') {
       if (this.bot.movementManager) {
          const tx = Math.floor(task.target.x);
          const ty = Math.floor(task.target.y);
          const tz = Math.floor(task.target.z);
          
          if (!this.lastTarget || this.lastTarget.x !== tx || this.lastTarget.y !== ty || this.lastTarget.z !== tz) {
             if (task.type === 'interact_block') {
                 this.bot.movementManager.gotoNear(tx, ty, tz, 2);
             } else {
                 this.bot.movementManager.goto(tx, ty, tz);
             }
             this.lastTarget = { x: tx, y: ty, z: tz };
          }
       }
    }

    // Only attack if we are close enough and NOT currently pathfinding (arrived)
    if (task.type === 'interact_block') {
      const dist = Math.sqrt(Math.pow(task.target.x - pos.x, 2) + Math.pow(task.target.z - pos.z, 2) + Math.pow(task.target.y - pos.y, 2));
      const isMoving = this.bot.movementManager ? this.bot.movementManager.isMoving() : false;
      
      if (dist < 4.5 && !isMoving) {
         const dx = task.target.x - pos.x;
         const dz = task.target.z - pos.z;
         const targetYaw = Math.atan2(-dx, -dz);
         let deltaYaw = targetYaw - this.bot.entity.yaw;
         while (deltaYaw < -Math.PI) deltaYaw += Math.PI * 2;
         while (deltaYaw > Math.PI) deltaYaw -= Math.PI * 2;
         
         cmd.mouseXDelta = deltaYaw;
         
         if (Math.abs(deltaYaw) < 0.2) {
             cmd.attack = true;
         }
      }
    }

    // Log the data for future ML training
    this._logTrainingData(observation, cmd);

    return cmd;
  }

  _logTrainingData(obs, cmd) {
    // In a real system, write this to a CSV or JSON lines file.
    // console.log(`[BehaviorCloning] Logged observation -> command`);
  }
}

module.exports = LearnedMovementController;
