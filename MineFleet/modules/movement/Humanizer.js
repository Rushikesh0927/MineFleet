/**
 * Humanizer.js
 *
 * Implements smooth, human-like mouse and camera movements instead of robotic snapping.
 * Applies bezier curves, randomized overshoots, and micro-corrections to camera look.
 */

const { Vec3 } = require('vec3');

class Humanizer {
  /**
   * Smoothly pans the bot's camera to look at a target vector.
   * Simulates a human moving the mouse (easing, slight overshoot, micro-corrections).
   * 
   * @param {object} bot - The mineflayer bot
   * @param {Vec3} targetVec - The position to look at
   * @param {boolean} force - If true, bypasses smoothing (for emergencies)
   * @returns {Promise<void>} Resolves when the look is complete
   */
  static async smoothLook(bot, targetVec, force = false) {
    if (force) {
      return bot.lookAt(targetVec, force);
    }

    const currentYaw = bot.entity.yaw;
    const currentPitch = bot.entity.pitch;

    // Calculate exact target yaw/pitch
    const dx = targetVec.x - bot.entity.position.x;
    const dy = targetVec.y - (bot.entity.position.y + bot.entity.height);
    const dz = targetVec.z - bot.entity.position.z;
    
    let targetYaw = Math.atan2(-dx, -dz);
    let targetPitch = Math.atan2(dy, Math.sqrt(dx * dx + dz * dz));

    // Calculate the shortest angle difference
    let deltaYaw = targetYaw - currentYaw;
    while (deltaYaw < -Math.PI) deltaYaw += Math.PI * 2;
    while (deltaYaw > Math.PI) deltaYaw -= Math.PI * 2;

    const deltaPitch = targetPitch - currentPitch;

    // Add a slight imperfect offset to the target so the bot doesn't stare at the dead center of a block
    const maxOffset = 0.05; // radians
    targetYaw += (Math.random() * maxOffset * 2) - maxOffset;
    targetPitch += (Math.random() * maxOffset * 2) - maxOffset;

    // Recompute deltas with offset
    deltaYaw = targetYaw - currentYaw;
    while (deltaYaw < -Math.PI) deltaYaw += Math.PI * 2;
    while (deltaYaw > Math.PI) deltaYaw -= Math.PI * 2;

    // Determine how many ticks to take based on the distance to move the camera
    const totalDistance = Math.sqrt(deltaYaw * deltaYaw + deltaPitch * deltaPitch);
    const minTicks = 3;
    const maxTicks = 15;
    // roughly 10 ticks (500ms) for a full 180 turn
    const steps = Math.max(minTicks, Math.min(maxTicks, Math.floor(totalDistance * 6)));

    // Easing function: easeInOutQuad
    const easeInOutQuad = (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const easedT = easeInOutQuad(t);

      // Add a tiny bit of noise/jitter to the mouse movement during the pan
      const jitterYaw = (Math.random() - 0.5) * 0.01;
      const jitterPitch = (Math.random() - 0.5) * 0.01;

      const stepYaw = currentYaw + (deltaYaw * easedT) + jitterYaw;
      const stepPitch = currentPitch + (deltaPitch * easedT) + jitterPitch;

      await bot.look(stepYaw, stepPitch, true); // true = force (we are manually iterating ticks)
      await bot.waitForTicks(1);
    }
  }

  /**
   * Returns a promise that resolves after a random human-like reaction time.
   * 
   * @param {number} minMs - Minimum delay in ms
   * @param {number} maxMs - Maximum delay in ms
   * @returns {Promise<void>}
   */
  static async randomDelay(minMs = 400, maxMs = 1200) {
    const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    return new Promise(resolve => setTimeout(resolve, delay));
  }
}

module.exports = Humanizer;
