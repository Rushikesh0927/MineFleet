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
      return cmd; // Stand still
    }

    const pos = this.bot.entity.position;

    // Calculate desired angles
    const dx = task.target.x - pos.x;
    const dz = task.target.z - pos.z;
    const targetYaw = Math.atan2(-dx, -dz);
    
    let deltaYaw = targetYaw - this.bot.entity.yaw;
    while (deltaYaw < -Math.PI) deltaYaw += Math.PI * 2;
    while (deltaYaw > Math.PI) deltaYaw -= Math.PI * 2;

    cmd.mouseXDelta = deltaYaw;

    // Pitch logic for aiming at blocks
    if (task.type === 'interact_block' || task.type === 'attack_entity') {
      const dy = task.target.y - (pos.y + this.bot.entity.height);
      const targetPitch = Math.atan2(dy, Math.sqrt(dx*dx + dz*dz));
      cmd.mouseYDelta = targetPitch - this.bot.entity.pitch;
    }

    // Forward logic if facing mostly the right way
    if (Math.abs(deltaYaw) < 0.5) {
      cmd.forward = true;
      if (task.id.startsWith('flee')) cmd.sprint = true;

      // Basic jump logic (raycast)
      const forwardVec = new Vec3(Math.sin(-this.bot.entity.yaw), 0, Math.cos(-this.bot.entity.yaw));
      const blockAhead = this.bot.blockAt(pos.offset(forwardVec.x, 0, forwardVec.z));
      const blockAboveAhead = this.bot.blockAt(pos.offset(forwardVec.x, 1, forwardVec.z));
      if (blockAhead && blockAhead.name !== 'air' && blockAboveAhead && blockAboveAhead.name === 'air') {
         cmd.jump = true;
      }
    }

    if (task.type === 'interact_block' && Math.abs(deltaYaw) < 0.2) {
      cmd.attack = true; // left click
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
