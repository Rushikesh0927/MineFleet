/**
 * AttentionSystem.js
 * 
 * Humans do not process everything equally. This model maintains:
 * - Current Focus
 * - Nearby Threats
 * - Interesting Objects
 * - Recent Events
 * 
 * Only important information influences the UtilityDecisionEngine.
 */

class AttentionSystem {
  constructor(bot, spatialMemory) {
    this.bot = bot;
    this.spatial = spatialMemory;

    this.threats = [];
    this.interestingObjects = [];
    this.recentEvents = [];

    // Hostile mobs that demand immediate attention
    this.HOSTILE_MOBS = new Set([
      'zombie', 'skeleton', 'spider', 'creeper', 'enderman', 'witch',
      'phantom', 'drowned', 'husk', 'stray', 'cave_spider', 'slime',
      'pillager', 'vindicator', 'ravager', 'vex', 'evoker',
    ]);

    // Objects that trigger curiosity
    this.CURIOSITY_BLOCKS = new Set([
      'chest', 'spawner', 'diamond_ore', 'emerald_ore', 'gold_ore',
      'bell', 'campfire', 'obsidian', 'nether_portal', 'end_portal'
    ]);
  }

  /**
   * Called every 100ms by the Decision Layer to update observations.
   */
  observe() {
    this._scanThreats();
    this._scanInterestingObjects();
  }

  _scanThreats() {
    this.threats = [];
    const pos = this.bot.entity?.position;
    if (!pos) return;

    for (const entity of Object.values(this.bot.entities)) {
      if (entity === this.bot.entity) continue;
      if (!entity.position || !entity.name) continue;
      
      if (this.HOSTILE_MOBS.has(entity.name)) {
        const dist = pos.distanceTo(entity.position);
        if (dist < 24) { // Only care if within 24 blocks
          this.threats.push({
            entity,
            name: entity.name,
            distance: dist,
            threatLevel: this._calculateThreatLevel(entity.name, dist)
          });
        }
      }
    }

    // Sort by most dangerous
    this.threats.sort((a, b) => b.threatLevel - a.threatLevel);
  }

  _calculateThreatLevel(mobName, distance) {
    let base = 50;
    if (mobName === 'creeper') base = 100;
    if (mobName === 'enderman') base = 80;
    
    // Closer = higher threat
    return Math.max(0, base - (distance * 2));
  }

  _scanInterestingObjects() {
    this.interestingObjects = [];
    const pos = this.bot.entity?.position;
    if (!pos) return;

    // Scan for dropped items (high curiosity)
    for (const entity of Object.values(this.bot.entities)) {
      if (entity.name === 'item' && entity.position) {
        const dist = pos.distanceTo(entity.position);
        if (dist < 16) {
          this.interestingObjects.push({
            type: 'dropped_item',
            position: entity.position,
            distance: dist,
            curiosityScore: Math.max(0, 80 - (dist * 3))
          });
        }
      }
    }

    // Rely on SpatialMemory for blocks so we don't lag the 100ms loop with block scans
    // SpatialMemory scans surroundings asynchronously
    const nearbyPOIs = this.spatial.getPOIs();
    for (const poi of nearbyPOIs) {
      if (this.CURIOSITY_BLOCKS.has(poi.type)) {
        const dx = poi.x - pos.x;
        const dz = poi.z - pos.z;
        const dist = Math.sqrt(dx*dx + dz*dz);
        if (dist < 32) {
          this.interestingObjects.push({
            type: 'rare_block',
            name: poi.type,
            position: { x: poi.x, y: poi.y, z: poi.z },
            distance: dist,
            curiosityScore: Math.max(0, 90 - (dist * 2))
          });
        }
      }
    }

    this.interestingObjects.sort((a, b) => b.curiosityScore - a.curiosityScore);
  }

  getHighestThreat() {
    return this.threats.length > 0 ? this.threats[0] : null;
  }

  getHighestCuriosity() {
    return this.interestingObjects.length > 0 ? this.interestingObjects[0] : null;
  }
}

module.exports = AttentionSystem;
