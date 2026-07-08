/**
 * CuriosityEngine.js (Phase 9)
 * 
 * Injects novelty-based investigation triggers into the Utility Network.
 * Curiosity decays over time and competes with existing goals.
 */

class CuriosityEngine {
  constructor(bot, experienceDb, personality) {
    this.bot = bot;
    this.experienceDb = experienceDb;
    this.personality = personality;
    
    // Active curiosity signals
    this.signals = [];

    this.INTERESTING_BLOCKS = new Set([
      'chest', 'spawner', 'diamond_ore', 'emerald_ore', 'gold_ore',
      'bell', 'campfire', 'obsidian', 'nether_portal', 'end_portal'
    ]);
  }

  /**
   * Called by AttentionManager when it spots something interesting.
   */
  trigger(type, position) {
    // Check if we already have a signal for this
    const exists = this.signals.some(s => s.position.distanceTo(position) < 3);
    if (exists) return;

    // Check novelty against long term memory
    const nearbyMemories = this.experienceDb.getNearbyMemories(position, 5);
    const isNovel = nearbyMemories.length === 0;

    const baseScore = isNovel ? 80 : 30;
    const curTrait = this.personality.get().curiosity;

    this.signals.push({
      id: `curiosity_${Date.now()}`,
      type,
      position,
      magnitude: baseScore * curTrait,
      createdAt: Date.now()
    });
  }

  tick() {
    // Decay signals
    const now = Date.now();
    this.signals = this.signals.filter(s => {
      const ageMs = now - s.createdAt;
      s.magnitude -= 0.1; // Slow decay
      return s.magnitude > 5 && ageMs < 60000; // Drop after 60s or if score too low
    });
  }

  getHighestSignal() {
    if (this.signals.length === 0) return null;
    return this.signals.sort((a, b) => b.magnitude - a.magnitude)[0];
  }

  resolveSignal(id) {
    this.signals = this.signals.filter(s => s.id !== id);
    // When resolved, curiosity goes down slightly (satiated)
    this.personality.drift('curiosity', -0.01);
  }
}

module.exports = CuriosityEngine;
