/**
 * NeuralMovementController.js
 * 
 * Runs at 20Hz. Takes micro-targets from the LocalPlanner and translates them
 * into continuous mouse (Yaw/Pitch) and keyboard (WASD/Jump/Click) events.
 * 
 * This module acts as the "Behavior Cloning Model" placeholder. 
 * Currently uses procedural heuristics to steer, simulating Neural Net outputs.
 */

const { Vec3 } = require('vec3');
const Humanizer = require('./Humanizer');

class NeuralMovementController {
  constructor(bot, spatialMemory) {
    this.bot = bot;
    this.spatial = spatialMemory;
    
    this.target = null;
    this.intent = 'idle'; // walk, sprint, mine, eat, look_only, idle
    
    this._loopTimer = null;
    this._isDigging = false;
  }

  start() {
    console.log(`[NeuralController] Starting continuous steering loop (20Hz)`);
    this._loopTimer = setInterval(() => this._tick(), 50); // 20 times per second
  }

  stop() {
    if (this._loopTimer) {
      clearInterval(this._loopTimer);
      this._loopTimer = null;
    }
    this._resetControls();
  }

  /**
   * Called continuously by LocalPlanner.
   */
  setTarget(vec3, intent) {
    this.target = vec3;
    this.intent = intent;
  }

  async _tick() {
    try {
      if (!this.target && this.intent !== 'idle' && this.intent !== 'eat') return;

      const pos = this.bot.entity.position;

      // Reset controls every frame, then set them based on intent
      this._resetControls();

      // Handle intents that don't require movement
      if (this.intent === 'idle') {
        // Small random idle looks handled by Humanizer jitter
        return;
      }

      if (this.intent === 'eat') {
        this.bot.setControlState('forward', true); // Walk slowly while eating
        this.bot.setControlState('sneak', true);
        return; // Eat logic is handled async in BehaviorEngine currently, need to migrate here later
      }

      // Calculate desired viewing angle
      const dx = this.target.x - pos.x;
      const dz = this.target.z - pos.z;
      
      let targetYaw = Math.atan2(-dx, -dz);
      let targetPitch = 0;

      // Add human-like offset (so it doesn't aim perfectly at center)
      targetYaw += (Math.random() - 0.5) * 0.05;
      
      // Calculate delta
      let deltaYaw = targetYaw - this.bot.entity.yaw;
      while (deltaYaw < -Math.PI) deltaYaw += Math.PI * 2;
      while (deltaYaw > Math.PI) deltaYaw -= Math.PI * 2;

      // Apply Yaw Velocity (Simulating Mouse X Delta)
      // Cap maximum turn speed to simulate physical mouse drag limit
      const maxTurnSpeed = 0.2; // radians per tick
      const turnStep = Math.max(-maxTurnSpeed, Math.min(maxTurnSpeed, deltaYaw * 0.5));
      
      // Inject micro-jitter (human tremor)
      const jitter = (Math.random() - 0.5) * 0.01;
      
      this.bot.look(this.bot.entity.yaw + turnStep + jitter, this.bot.entity.pitch, true);

      // Handle intents
      if (this.intent === 'look_only') {
        return;
      }

      if (this.intent === 'mine') {
        // Look up/down at the block
        const dy = this.target.y - (pos.y + this.bot.entity.height);
        targetPitch = Math.atan2(dy, Math.sqrt(dx * dx + dz * dz));
        targetPitch += (Math.random() - 0.5) * 0.05; // Imperfect aim
        
        let deltaPitch = targetPitch - this.bot.entity.pitch;
        const pitchStep = Math.max(-maxTurnSpeed, Math.min(maxTurnSpeed, deltaPitch * 0.5));
        this.bot.look(this.bot.entity.yaw, this.bot.entity.pitch + pitchStep + jitter, true);

        // If we are looking close enough at the block, start holding left click
        if (Math.abs(deltaYaw) < 0.2 && Math.abs(deltaPitch) < 0.2) {
          if (!this._isDigging) {
            const block = this.bot.blockAt(this.target);
            if (block && this.bot.canDigBlock(block)) {
              this._isDigging = true;
              this.bot.dig(block).then(() => { this._isDigging = false; }).catch(() => { this._isDigging = false; });
            }
          }
        }
        return;
      }

      // Movement intents (walk, sprint)
      // Only move forward if we are facing roughly the right direction
      if (Math.abs(deltaYaw) < 0.5) {
        this.bot.setControlState('forward', true);
        if (this.intent === 'sprint') {
          this.bot.setControlState('sprint', true);
        }

        // Raycast collision detection for auto-jumping
        // Cast a ray 1 block forward at foot level
        const forwardVec = new Vec3(Math.sin(-this.bot.entity.yaw), 0, Math.cos(-this.bot.entity.yaw));
        const blockAhead = this.bot.blockAt(pos.offset(forwardVec.x, 0, forwardVec.z));
        const blockAboveAhead = this.bot.blockAt(pos.offset(forwardVec.x, 1, forwardVec.z));

        // If block ahead is solid and block above is air -> Jump
        if (blockAhead && blockAhead.name !== 'air' && blockAboveAhead && blockAboveAhead.name === 'air') {
           this.bot.setControlState('jump', true);
        } else {
           this.bot.setControlState('jump', false);
        }

        // Avoid flowers / tall grass (sneak through or path around)
        if (blockAhead && (blockAhead.name.includes('flower') || blockAhead.name.includes('grass'))) {
          // slight strafe to avoid
          this.bot.setControlState('left', true);
        }
      }

    } catch (err) {
      console.error(`[NeuralController] Tick error:`, err);
    }
  }

  _resetControls() {
    this.bot.setControlState('forward', false);
    this.bot.setControlState('back', false);
    this.bot.setControlState('left', false);
    this.bot.setControlState('right', false);
    this.bot.setControlState('sprint', false);
    this.bot.setControlState('sneak', false);
    this.bot.setControlState('jump', false);
  }
}

module.exports = NeuralMovementController;
