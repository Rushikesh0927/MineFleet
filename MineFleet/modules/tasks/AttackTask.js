/**
 * modules/tasks/AttackTask.js
 *
 * Attacks a specific entity by name, or the nearest hostile entity if no name provided.
 * Completes immediately (fire-and-forget).
 */

const Task = require('./Task');

class AttackTask extends Task {
  /**
   * @param {object} bot    — live Mineflayer bot instance
   * @param {string} target — name of player/entity, or "hostile"
   * @param {number} [priority=0]
   */
  constructor(bot, target, priority = 0) {
    super(`attack(${target})`, priority);
    this.bot = bot;
    this.target = target;
    this.interruptible = true;
  }

  start() {
    super.start();

    let entityToAttack = null;

    if (!this.target || this.target.toLowerCase() === 'hostile') {
      // Find nearest hostile mob
      const filter = (entity) => entity.type === 'mob' && entity.kind === 'Hostile mobs';
      entityToAttack = this.bot.nearestEntity(filter);
    } else {
      // Find named player/entity
      entityToAttack = this.bot.players[this.target]?.entity;
      
      if (!entityToAttack) {
        // Fallback to searching all entities by username or name
        for (const id in this.bot.entities) {
          const e = this.bot.entities[id];
          if (e.username === this.target || e.name === this.target) {
            entityToAttack = e;
            break;
          }
        }
      }
    }

    if (entityToAttack) {
      // Simple attack. Advanced combat (like pathfinding to them) is beyond the scope of a basic attack task.
      this.bot.attack(entityToAttack);
      console.log(`[AttackTask] Attacked entity: ${entityToAttack.username || entityToAttack.name || entityToAttack.id}`);
      this.complete();
    } else {
      this.fail(`No target found for '${this.target}'`);
    }
  }

  update() {}
}

module.exports = AttackTask;
