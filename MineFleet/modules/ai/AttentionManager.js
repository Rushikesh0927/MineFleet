/**
 * AttentionManager.js (Phase 5)
 * 
 * Replaces AttentionSystem.js.
 * Ranks incoming stimuli by priority class + urgency and only allows the top-ranked
 * stimulus to trigger full re-evaluation. Lower priority stimuli are queued.
 */

const { Vec3 } = require('vec3');

class AttentionManager {
  constructor(bot, spatialMemory, curiosityEngine) {
    this.bot = bot;
    this.spatial = spatialMemory;
    this.curiosity = curiosityEngine;

    this.currentFocus = null; // { type, priority, data, expireAt }
    this.queuedStimuli = [];

    this.HOSTILE_MOBS = new Set([
      'zombie', 'skeleton', 'spider', 'creeper', 'enderman', 'witch',
      'phantom', 'drowned', 'husk', 'stray', 'cave_spider', 'slime',
      'pillager', 'vindicator', 'ravager', 'vex', 'evoker',
    ]);
  }

  /**
   * Called every 100ms
   */
  tick() {
    // 1. Scan for raw stimuli
    this._scanEnvironment();

    // 2. Process Queue
    this._processQueue();

    // 3. Clear expired focus
    if (this.currentFocus && Date.now() > this.currentFocus.expireAt) {
      this.currentFocus = null;
    }
  }

  _scanEnvironment() {
    const pos = this.bot.entity?.position;
    if (!pos) return;

    // Scan entities (Threats & Items)
    for (const entity of Object.values(this.bot.entities)) {
      if (entity === this.bot.entity || !entity.position) continue;
      
      const dist = pos.distanceTo(entity.position);

      if (this.HOSTILE_MOBS.has(entity.name) && dist < 24) {
        this._addStimulus('threat', 100 - dist, { entity, dist });
      }
      else if (entity.name === 'item' && dist < 16) {
        this._addStimulus('interesting_object', 50 - dist, { entity, dist });
      }
    }

    // Scan blocks via SpatialMemory
    const nearbyPOIs = this.spatial.data.pointsOfInterest;
    for (const poi of nearbyPOIs) {
      if (this.curiosity.INTERESTING_BLOCKS.has(poi.type)) {
        const dx = poi.x - pos.x;
        const dz = poi.z - pos.z;
        const dist = Math.sqrt(dx*dx + dz*dz);
        if (dist < 32) {
          this._addStimulus('interesting_object', 60 - dist, { 
            type: poi.type, 
            position: new Vec3(poi.x, poi.y, poi.z), 
            dist 
          });
        }
      }
    }
  }

  _addStimulus(type, priority, data) {
    // Debounce/Dedup
    const exists = this.queuedStimuli.some(s => s.type === type && s.data.entity?.id === data.entity?.id);
    if (exists) return;

    this.queuedStimuli.push({
      type,
      priority,
      data,
      timestamp: Date.now()
    });
  }

  _processQueue() {
    if (this.queuedStimuli.length === 0) return;

    // Sort by priority desc
    this.queuedStimuli.sort((a, b) => b.priority - a.priority);

    const topStimulus = this.queuedStimuli[0];

    // Does it interrupt current focus?
    if (!this.currentFocus || topStimulus.priority > this.currentFocus.priority + 10) {
      this.currentFocus = {
        ...topStimulus,
        expireAt: Date.now() + 2000 // Holds focus for 2 seconds unless overridden
      };

      // Route to CuriosityEngine if it's an interesting object
      if (topStimulus.type === 'interesting_object') {
        const pos = topStimulus.data.position || topStimulus.data.entity.position;
        this.curiosity.trigger(topStimulus.data.type || 'item', pos);
      }
    }

    // Clear old stimuli
    const now = Date.now();
    this.queuedStimuli = this.queuedStimuli.filter(s => now - s.timestamp < 1000);
  }

  getCurrentFocus() {
    return this.currentFocus;
  }
}

module.exports = AttentionManager;
