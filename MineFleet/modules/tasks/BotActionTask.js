/**
 * modules/tasks/BotActionTask.js
 *
 * Handles Mine (dig), Place Block, and Use Item.
 * Completes immediately (fire-and-forget).
 */

const Task = require('./Task');

class BotActionTask extends Task {
  /**
   * @param {object} bot — live Mineflayer bot instance
   * @param {string} action — 'mine', 'place', or 'use'
   * @param {object} [params] — { x, y, z } for mine/place
   * @param {number} [priority=0]
   */
  constructor(bot, action, params = {}, priority = 0) {
    super(`action(${action})`, priority);
    this.bot = bot;
    this.action = action;
    this.params = params;
    this.interruptible = true;
  }

  start() {
    super.start();

    const { x, y, z } = this.params;

    try {
      if (this.action === 'mine') {
        const block = this.bot.blockAt(this.bot.entity.position.offset(x - Math.floor(this.bot.entity.position.x), y - Math.floor(this.bot.entity.position.y), z - Math.floor(this.bot.entity.position.z))); 
        // We actually need the absolute block. Let's just use blockAt directly with absolute coords if provided.
        // Wait, mineflayer blockAt takes a vec3. We can just use mineflayer's vec3 or an object with x,y,z.
        const targetBlock = (x !== undefined && y !== undefined && z !== undefined) 
                            ? this.bot.blockAt({ x, y, z }) 
                            : null;
        
        if (!targetBlock) {
          this.fail('Invalid coordinates or chunk not loaded for mining.');
          return;
        }

        if (this.bot.canDigBlock(targetBlock)) {
          // This is async, but we'll treat it as fire-and-forget for this basic implementation, 
          // or we could await it in a real async task. For now, just fire it.
          this.bot.dig(targetBlock, (err) => {
            if (err) console.error(`[BotActionTask] Dig error:`, err);
          });
          this.complete();
        } else {
          this.fail('Cannot dig block (too far or unbreakable).');
        }

      } else if (this.action === 'place') {
        // Place block requires a reference block and a face vector. 
        // For simplicity in a basic command, we'll try to place it ON the block at x,y,z on its top face (0,1,0).
        const referenceBlock = (x !== undefined && y !== undefined && z !== undefined) 
                            ? this.bot.blockAt({ x, y, z }) 
                            : null;

        if (!referenceBlock) {
          this.fail('Invalid coordinates or chunk not loaded for placing.');
          return;
        }

        // Fire and forget
        this.bot.placeBlock(referenceBlock, { x: 0, y: 1, z: 0 }, (err) => {
          if (err) console.error(`[BotActionTask] Place error:`, err);
        });
        this.complete();

      } else if (this.action === 'use') {
        // Activate currently held item (e.g. eat food, shoot bow, throw potion)
        this.bot.activateItem();
        this.complete();

      } else {
        this.fail(`Unknown action: ${this.action}`);
      }
    } catch (err) {
      this.fail(err.message);
    }
  }

  update() {}
}

module.exports = BotActionTask;
