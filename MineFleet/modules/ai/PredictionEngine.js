/**
 * PredictionEngine.js (Phase 2)
 * 
 * Projects world state forward a few seconds and feeds adjustments 
 * into the Dynamic Utility Network.
 */

class PredictionEngine {
  constructor(bot) {
    this.bot = bot;
  }

  /**
   * Runs every tick to project future states.
   * @returns {import('./Types').PredictionSet}
   */
  predict() {
    const signals = [];

    const mobSignal = this._predictMobSpawns();
    if (mobSignal) signals.push(mobSignal);

    const toolSignal = this._predictToolBreakage();
    if (toolSignal) signals.push(toolSignal);

    const explosionSignal = this._predictExplosion();
    if (explosionSignal) signals.push(explosionSignal);

    return { signals };
  }

  _predictMobSpawns() {
    // If it's getting dark, predict hostile spawns
    const timeOfDay = this.bot.time.timeOfDay;
    // Sunset starts around 12000, fully dark by 13000
    if (timeOfDay > 12500 && timeOfDay < 23000) {
      const urgency = Math.min(1.0, (timeOfDay - 12500) / 1000);
      return {
        type: 'mob_spawn',
        confidence: 0.9,
        urgency,
        suggestedActionAdjustments: {
          return_home: 20 + (urgency * 30),
          explore: -20,
          gather_resource: -10
        }
      };
    }
    return null;
  }

  _predictToolBreakage() {
    const heldItem = this.bot.inventory.slots[this.bot.quickBarSlot + 36];
    if (heldItem && heldItem.name.includes('pickaxe')) {
      const maxDurability = heldItem.maxDurability || 1;
      const durability = maxDurability - heldItem.durabilityUsed;
      
      if (durability < 15) {
        return {
          type: 'tool_breakage',
          confidence: 1.0,
          urgency: 1.0 - (durability / 15),
          suggestedActionAdjustments: {
            craft: 50,
            gather_resource: -50
          }
        };
      }
    }
    return null;
  }

  _predictExplosion() {
    const pos = this.bot.entity?.position;
    if (!pos) return null;

    for (const entity of Object.values(this.bot.entities)) {
      if (entity.name === 'creeper') {
        const dist = pos.distanceTo(entity.position);
        if (dist < 5) {
          return {
            type: 'explosion_radius',
            confidence: 1.0,
            urgency: 1.0 - (dist / 5), // Very urgent if close
            suggestedActionAdjustments: {
              flee: 100,
              gather_resource: -100,
              fight: -50
            }
          };
        }
      }
    }
    return null;
  }
}

module.exports = PredictionEngine;
