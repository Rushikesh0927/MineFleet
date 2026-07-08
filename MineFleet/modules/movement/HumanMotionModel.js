/**
 * HumanMotionModel.js (Phase 7)
 * 
 * Takes raw optimal MovementCommands and applies noise, jitter, smoothing,
 * and reaction delays before sending to Mineflayer.
 */

class HumanMotionModel {
  constructor(bot, personality) {
    this.bot = bot;
    this.personality = personality;
    this.isDigging = false;
  }

  /**
   * Applies the command to the bot with human traits.
   * @param {import('../ai/Types').MovementCommand} rawCmd 
   */
  apply(rawCmd) {
    // 1. Camera Smoothing & Jitter
    const maxTurnSpeed = 0.2; // radians per tick
    
    // Imperfect aim based on confidence trait (lower confidence = higher error)
    const conf = this.personality ? this.personality.get().confidence : 0.5;
    const aimError = (1.0 - conf) * 0.05 * (Math.random() - 0.5);
    const handJitter = (Math.random() - 0.5) * 0.01;

    let targetYaw = rawCmd.mouseXDelta + aimError;
    let turnStep = Math.max(-maxTurnSpeed, Math.min(maxTurnSpeed, targetYaw * 0.5));
    
    let targetPitch = rawCmd.mouseYDelta + aimError;
    let pitchStep = Math.max(-maxTurnSpeed, Math.min(maxTurnSpeed, targetPitch * 0.5));

    if (Math.abs(turnStep) > 0.01 || Math.abs(pitchStep) > 0.01) {
      this.bot.look(this.bot.entity.yaw + turnStep + handJitter, this.bot.entity.pitch + pitchStep + handJitter, true);
    }

    // 2. Keyboard Mapping
    this.bot.setControlState('forward', rawCmd.forward);
    this.bot.setControlState('back', rawCmd.backward);
    this.bot.setControlState('left', rawCmd.left);
    this.bot.setControlState('right', rawCmd.right);
    this.bot.setControlState('sprint', rawCmd.sprint);
    this.bot.setControlState('jump', rawCmd.jump);
    this.bot.setControlState('sneak', rawCmd.sneak);

    // 3. Interactions (Reaction Delays could be implemented via setTimeout here)
    if (rawCmd.attack && !this.isDigging) {
      // Don't swing if aiming wildly
      if (Math.abs(turnStep) < 0.1 && Math.abs(pitchStep) < 0.1) {
        // Just left click what we look at
        const block = this.bot.blockAtCursor(4);
        if (block) {
          this.isDigging = true;
          this.bot.dig(block)
            .then(() => { this.isDigging = false; })
            .catch(() => { this.isDigging = false; });
        } else {
           // Maybe attack entity
           const ent = this.bot.entityAtCursor(4);
           if (ent) this.bot.attack(ent);
        }
      }
    }
  }
}

module.exports = HumanMotionModel;
