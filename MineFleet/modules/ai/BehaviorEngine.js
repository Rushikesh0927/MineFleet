/**
 * BehaviorEngine.js
 *
 * The "Neural Reflexes" of MineFleetBot5.
 *
 * This is a behavior tree that runs every 1.5 seconds with ZERO API calls.
 * It handles all low-level gameplay autonomously:
 *   - Finding and mining trees
 *   - Exploring the world
 *   - Eating when hungry
 *   - Fleeing from hostile mobs
 *   - Crafting items
 *   - Seeking shelter at night
 *
 * The LLM (AIAgent) sets the high-level behavior mode; this engine executes it.
 */

const { Vec3 } = require('vec3');
const { goals: { GoalNear, GoalBlock, GoalFollow } } = require('mineflayer-pathfinder');
const { Movements } = require('mineflayer-pathfinder');

const TICK_MS = 1500; // Run behavior every 1.5 seconds
const REACH_DISTANCE = 4; // Blocks within reach for mining
const FLEE_DISTANCE = 16; // Run if hostile mob is closer than this
const EXPLORE_DISTANCE = 40; // Blocks to walk per explore trip
const MAX_HOME_DISTANCE = 200; // Don't wander further than this from home

// Hostile mobs to flee from
const HOSTILE_MOBS = new Set([
  'zombie', 'skeleton', 'spider', 'creeper', 'enderman', 'witch',
  'phantom', 'drowned', 'husk', 'stray', 'cave_spider', 'slime',
  'pillager', 'vindicator', 'ravager', 'vex', 'evoker',
]);

// Food items the bot can eat
const FOOD_ITEMS = new Set([
  'bread', 'cooked_beef', 'cooked_porkchop', 'cooked_chicken', 'cooked_mutton',
  'cooked_rabbit', 'cooked_cod', 'cooked_salmon', 'baked_potato',
  'golden_carrot', 'golden_apple', 'apple', 'melon_slice', 'sweet_berries',
  'mushroom_stew', 'rabbit_stew', 'beetroot_soup', 'pumpkin_pie', 'cookie',
  'dried_kelp',
]);

// Tree log types
const LOG_BLOCKS = new Set([
  'oak_log', 'spruce_log', 'birch_log', 'jungle_log', 'acacia_log', 'dark_oak_log',
  'mangrove_log', 'cherry_log',
]);

/**
 * Behavior modes — set by the LLM strategist
 */
const MODES = {
  IDLE: 'idle',
  GATHER_WOOD: 'gather_wood',
  GATHER_STONE: 'gather_stone',
  EXPLORE: 'explore',
  EAT: 'eat',
  FLEE: 'flee',
  CRAFT: 'craft',
  SHELTER: 'shelter',
  FOLLOW: 'follow',
  GOTO: 'goto',
};

class BehaviorEngine {
  constructor(bot, movementManager, spatialMemory, botMemory) {
    this.bot = bot;
    this.mm = movementManager;
    this.spatial = spatialMemory;
    this.memory = botMemory;

    // Current behavior state
    this.mode = MODES.IDLE;
    this.modeData = {};    // Extra data for current mode (e.g. target coords for goto)
    this._tickTimer = null;
    this._isBusy = false;  // Prevent overlapping ticks
    this._lastChatTime = 0; // Throttle chat messages

    // State tracking for behavior continuity
    this._currentTarget = null; // { x, y, z, type } — what we're currently going to
    this._isDigging = false;
    this._isEating = false;
    this._stuckCounter = 0;
    this._lastPosition = null;

    // Event tracking
    this._setupEventHandlers();
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  start() {
    console.log(`[BehaviorEngine] Starting for ${this.bot.username}`);
    // Set home position on first start
    const pos = this.bot.entity?.position;
    if (pos) this.spatial.setHome(pos.x, pos.y, pos.z);

    // Default to exploring
    this.mode = MODES.EXPLORE;

    this._tickTimer = setInterval(() => this._tick(), TICK_MS);
  }

  stop() {
    if (this._tickTimer) {
      clearInterval(this._tickTimer);
      this._tickTimer = null;
    }
    console.log(`[BehaviorEngine] Stopped for ${this.bot.username}`);
  }

  /**
   * Set behavior mode (called by LLM strategist or internally).
   */
  setMode(mode, data = {}) {
    if (this.mode !== mode) {
      console.log(`[BehaviorEngine] Mode: ${this.mode} → ${mode}`);
      this.mode = mode;
      this.modeData = data;
      this._currentTarget = null;
      this._stuckCounter = 0;
    }
  }

  getMode() { return this.mode; }

  // ─── Event Handlers ───────────────────────────────────────────────────────

  _setupEventHandlers() {
    this.bot.on('health', () => {
      // Emergency: eat if health is low
      if (this.bot.health < 10 && this.bot.food < 18 && this.mode !== MODES.FLEE) {
        this._tryEat();
      }
      // Emergency: flee if health is critical
      if (this.bot.health < 6 && this._findNearestHostile()) {
        this.setMode(MODES.FLEE);
      }
    });

    this.bot.on('entityHurt', (entity) => {
      if (entity === this.bot.entity && this._findNearestHostile()) {
        this.setMode(MODES.FLEE);
      }
    });
  }

  // ─── Main Tick ────────────────────────────────────────────────────────────

  async _tick() {
    if (this._isBusy) return;
    this._isBusy = true;

    try {
      const pos = this.bot.entity?.position;
      if (!pos) { this._isBusy = false; return; }

      // Always scan surroundings to build world map
      this.spatial.scanSurroundings(this.bot);

      // Check for stuck detection
      this._checkStuck(pos);

      // Emergency overrides (these take priority over any mode)
      if (this._emergencyChecks()) { this._isBusy = false; return; }

      // Execute current behavior mode
      switch (this.mode) {
        case MODES.GATHER_WOOD:   await this._behaviorGatherWood(); break;
        case MODES.GATHER_STONE:  await this._behaviorGatherStone(); break;
        case MODES.EXPLORE:       await this._behaviorExplore(); break;
        case MODES.EAT:           await this._behaviorEat(); break;
        case MODES.FLEE:          await this._behaviorFlee(); break;
        case MODES.CRAFT:         await this._behaviorCraft(); break;
        case MODES.SHELTER:       await this._behaviorShelter(); break;
        case MODES.FOLLOW:        await this._behaviorFollow(); break;
        case MODES.GOTO:          await this._behaviorGoto(); break;
        case MODES.IDLE:
        default:                  await this._behaviorIdle(); break;
      }
    } catch (err) {
      console.error(`[BehaviorEngine] Tick error: ${err.message}`);
    }

    this._isBusy = false;
  }

  // ─── Emergency Checks ────────────────────────────────────────────────────

  _emergencyChecks() {
    // 1. Hostile mob nearby — flee!
    if (this.mode !== MODES.FLEE) {
      const hostile = this._findNearestHostile();
      if (hostile && hostile.dist < FLEE_DISTANCE && this.bot.health < 14) {
        console.log(`[BehaviorEngine] EMERGENCY: ${hostile.name} spotted ${Math.round(hostile.dist)} blocks away! Fleeing!`);
        this.setMode(MODES.FLEE);
        return true;
      }
    }

    // 2. Starving — eat!
    if (this.bot.food <= 6 && this.mode !== MODES.EAT && this.mode !== MODES.FLEE) {
      const food = this._findFoodInInventory();
      if (food) {
        console.log(`[BehaviorEngine] EMERGENCY: Starving! Eating ${food.name}`);
        this._tryEat();
        return true;
      }
    }

    return false;
  }

  // ─── Behaviors ────────────────────────────────────────────────────────────

  /**
   * GATHER WOOD: Find nearest tree → walk to it → mine all logs → pick up → repeat
   */
  async _behaviorGatherWood() {
    if (this._isDigging || this.mm.isMoving()) return;

    // Look for logs within reach first
    const reachableLog = this._findNearestBlock(LOG_BLOCKS, REACH_DISTANCE);
    if (reachableLog) {
      await this._mineBlock(reachableLog);
      return;
    }

    // Look for logs in scan range
    const nearbyLog = this._findNearestBlock(LOG_BLOCKS, 32);
    if (nearbyLog) {
      // Walk to it
      this._navigateNear(nearbyLog.position.x, nearbyLog.position.y, nearbyLog.position.z, 2);
      return;
    }

    // Check spatial memory for known tree POIs
    const pos = this.bot.entity.position;
    const treePOI = this.spatial.findNearestPOI('tree', pos.x, pos.z);
    if (treePOI && treePOI.dist < 100) {
      this._navigateNear(treePOI.x, treePOI.y, treePOI.z, 2);
      return;
    }

    // No trees found anywhere — switch to exploring
    console.log(`[BehaviorEngine] No trees found, switching to explore mode`);
    this.setMode(MODES.EXPLORE);
  }

  /**
   * GATHER STONE: Find nearest stone → walk to it → mine → repeat
   */
  async _behaviorGatherStone() {
    if (this._isDigging || this.mm.isMoving()) return;

    const stoneTypes = new Set(['stone', 'cobblestone', 'andesite', 'diorite', 'granite']);
    
    // Check if we have a pickaxe
    const pickaxe = this.bot.inventory.items().find(i => i.name.includes('pickaxe'));
    if (!pickaxe) {
      console.log(`[BehaviorEngine] Need a pickaxe to mine stone. Switching to craft mode.`);
      this.setMode(MODES.CRAFT, { item: 'wooden_pickaxe' });
      return;
    }

    // Equip pickaxe
    try { await this.bot.equip(pickaxe, 'hand'); } catch (_) {}

    const reachableStone = this._findNearestBlock(stoneTypes, REACH_DISTANCE);
    if (reachableStone) {
      await this._mineBlock(reachableStone);
      return;
    }

    const nearbyStone = this._findNearestBlock(stoneTypes, 16);
    if (nearbyStone) {
      this._navigateNear(nearbyStone.position.x, nearbyStone.position.y, nearbyStone.position.z, 2);
      return;
    }

    // Try digging down
    const below = this.bot.blockAt(this.bot.entity.position.offset(0, -1, 0));
    if (below && stoneTypes.has(below.name)) {
      await this._mineBlock(below);
      return;
    }

    this.setMode(MODES.EXPLORE);
  }

  /**
   * EXPLORE: Pick unexplored direction → walk there → scan → repeat
   */
  async _behaviorExplore() {
    if (this.mm.isMoving()) return;

    const pos = this.bot.entity.position;

    // Check if we're too far from home
    const homeDist = this.spatial.distanceToHome(pos.x, pos.z);
    if (homeDist > MAX_HOME_DISTANCE) {
      console.log(`[BehaviorEngine] Too far from home (${Math.round(homeDist)} blocks). Heading back.`);
      const home = this.spatial.getHome();
      if (home) {
        this._navigateNear(home.x, home.y, home.z, 10);
        return;
      }
    }

    // Pick an unexplored direction
    const target = this.spatial.getExploreTarget(pos.x, pos.z, EXPLORE_DISTANCE);
    if (target) {
      // Find a safe Y level (surface)
      const targetY = this._getSurfaceY(target.x, target.z) || Math.floor(pos.y);
      this._navigateNear(target.x, targetY, target.z, 5);
    }
  }

  /**
   * EAT: Find food in inventory → eat it
   */
  async _behaviorEat() {
    if (this._isEating) return;
    if (this.bot.food >= 18) {
      // We're full, go back to what we were doing
      this.setMode(MODES.GATHER_WOOD);
      return;
    }

    await this._tryEat();
  }

  /**
   * FLEE: Run away from nearest hostile mob
   */
  async _behaviorFlee() {
    const hostile = this._findNearestHostile();
    if (!hostile) {
      // Danger passed — resume previous activity
      console.log(`[BehaviorEngine] Threat gone. Resuming.`);
      this.setMode(MODES.GATHER_WOOD);
      return;
    }

    if (hostile.dist > FLEE_DISTANCE * 1.5) {
      // Far enough, safe now
      this.setMode(MODES.GATHER_WOOD);
      return;
    }

    // Sprint away from the hostile
    const pos = this.bot.entity.position;
    const dx = pos.x - hostile.entity.position.x;
    const dz = pos.z - hostile.entity.position.z;
    const len = Math.sqrt(dx * dx + dz * dz) || 1;

    const fleeX = pos.x + (dx / len) * 20;
    const fleeZ = pos.z + (dz / len) * 20;
    const fleeY = this._getSurfaceY(fleeX, fleeZ) || Math.floor(pos.y);

    this.bot.setControlState('sprint', true);
    this._navigateNear(fleeX, fleeY, fleeZ, 3);
    setTimeout(() => this.bot.setControlState('sprint', false), 5000);
  }

  /**
   * CRAFT: Craft a specific item
   */
  async _behaviorCraft() {
    if (this.mm.isMoving()) return;

    const itemName = this.modeData.item || 'wooden_pickaxe';

    try {
      // Check if we need a crafting table
      const recipe = this.bot.recipesFor(this.bot.registry.itemsByName[itemName]?.id, null, 1, null);
      
      if (recipe.length > 0) {
        await this.bot.craft(recipe[0], 1, null);
        console.log(`[BehaviorEngine] Crafted ${itemName}!`);
        this.memory.addExperience(`crafted ${itemName}`, 'success', true);
        this.memory.trackSkill('crafting', true);
        this.setMode(MODES.GATHER_WOOD);
        return;
      }

      // Try with crafting table
      const craftingTable = this._findNearestBlock(new Set(['crafting_table']), REACH_DISTANCE);
      if (craftingTable) {
        const recipe2 = this.bot.recipesFor(this.bot.registry.itemsByName[itemName]?.id, null, 1, craftingTable);
        if (recipe2.length > 0) {
          await this.bot.craft(recipe2[0], 1, craftingTable);
          console.log(`[BehaviorEngine] Crafted ${itemName} using crafting table!`);
          this.memory.addExperience(`crafted ${itemName}`, 'success', true);
          this.setMode(MODES.GATHER_WOOD);
          return;
        }
      }

      // Need a crafting table nearby — look for one or craft one
      const nearbyCT = this._findNearestBlock(new Set(['crafting_table']), 32);
      if (nearbyCT) {
        this._navigateNear(nearbyCT.position.x, nearbyCT.position.y, nearbyCT.position.z, 2);
        return;
      }

      // No crafting table — try to craft one from planks
      const planks = this.bot.inventory.items().find(i => i.name.includes('planks'));
      if (planks && planks.count >= 4) {
        const ctId = this.bot.registry.itemsByName['crafting_table']?.id;
        const ctRecipe = this.bot.recipesFor(ctId, null, 1, null);
        if (ctRecipe.length > 0) {
          await this.bot.craft(ctRecipe[0], 1, null);
          console.log(`[BehaviorEngine] Crafted crafting_table!`);
          // Place it
          const refBlock = this.bot.blockAt(this.bot.entity.position.offset(1, -1, 0));
          if (refBlock) {
            const ctItem = this.bot.inventory.items().find(i => i.name === 'crafting_table');
            if (ctItem) {
              await this.bot.equip(ctItem, 'hand');
              await this.bot.placeBlock(refBlock, new Vec3(0, 1, 0));
              console.log(`[BehaviorEngine] Placed crafting table!`);
            }
          }
          return;
        }
      }

      // Need planks — craft from logs
      const logs = this.bot.inventory.items().find(i => i.name.includes('log'));
      if (logs) {
        const plankId = this.bot.registry.itemsByName['oak_planks']?.id;
        const plankRecipe = this.bot.recipesFor(plankId, null, 1, null);
        if (plankRecipe.length > 0) {
          await this.bot.craft(plankRecipe[0], 1, null);
          console.log(`[BehaviorEngine] Crafted planks from logs!`);
          return;
        }
      }

      // No logs either — go gather wood first
      console.log(`[BehaviorEngine] Need wood to craft. Switching to gather_wood.`);
      this.setMode(MODES.GATHER_WOOD);
    } catch (err) {
      console.error(`[BehaviorEngine] Craft error: ${err.message}`);
      this.memory.addExperience(`craft ${itemName}`, `failed: ${err.message}`, false);
      this.setMode(MODES.GATHER_WOOD);
    }
  }

  /**
   * SHELTER: At night, find or build a simple shelter
   */
  async _behaviorShelter() {
    if (this.mm.isMoving()) return;

    // If it's daytime now, stop sheltering
    const timeOfDay = this.bot.time?.timeOfDay ?? 0;
    if (timeOfDay < 13000) {
      console.log(`[BehaviorEngine] Daytime! Resuming activities.`);
      this.setMode(MODES.GATHER_WOOD);
      return;
    }

    // Simple shelter: dig 1-block hole and place block above
    const pos = this.bot.entity.position;
    const blockBelow = this.bot.blockAt(pos.offset(0, -1, 0));

    // Just stay still at night for now — don't wander in the dark
    // The emergency flee system will handle mobs
    this.bot.setControlState('sprint', false);
  }

  /**
   * FOLLOW: Follow a specific player
   */
  async _behaviorFollow() {
    const targetName = this.modeData.target;
    if (!targetName) { this.setMode(MODES.IDLE); return; }

    const player = this.bot.players[targetName];
    if (player && player.entity) {
      const dist = this.bot.entity.position.distanceTo(player.entity.position);
      if (dist > 3) {
        if (!this.mm.isMoving()) {
          this.mm.follow(player.entity, 2);
        }
      }
    }
  }

  /**
   * GOTO: Walk to specific coordinates
   */
  async _behaviorGoto() {
    if (this.mm.isMoving()) return;

    const { x, y, z } = this.modeData;
    if (x === undefined) { this.setMode(MODES.IDLE); return; }

    const pos = this.bot.entity.position;
    const dist = pos.distanceTo(new Vec3(x, y || pos.y, z));

    if (dist < 3) {
      console.log(`[BehaviorEngine] Reached destination.`);
      this.setMode(MODES.GATHER_WOOD);
      return;
    }

    this._navigateNear(x, y || pos.y, z, 2);
  }

  /**
   * IDLE: Small random movements, look around
   */
  async _behaviorIdle() {
    if (this.mm.isMoving()) return;

    // Don't just stand still — do small idle movements
    const pos = this.bot.entity.position;
    const dx = (Math.random() - 0.5) * 6;
    const dz = (Math.random() - 0.5) * 6;

    // Look at a random nearby point
    try {
      this.bot.lookAt(new Vec3(pos.x + dx * 3, pos.y + 1, pos.z + dz * 3));
    } catch (_) {}

    // Auto-transition to explore after a few idle ticks
    this._stuckCounter++;
    if (this._stuckCounter > 3) {
      this.setMode(MODES.EXPLORE);
    }
  }

  // ─── Helper: Mining ───────────────────────────────────────────────────────

  async _mineBlock(block) {
    if (this._isDigging || !block) return;

    // Don't mine blocks in protected zones
    if (this.spatial.isProtected(block.position.x, block.position.z)) {
      console.log(`[BehaviorEngine] Skipping protected block at ${block.position}`);
      return;
    }

    this._isDigging = true;
    try {
      if (this.bot.canDigBlock(block)) {
        console.log(`[BehaviorEngine] Mining ${block.name} at ${block.position.x},${block.position.y},${block.position.z}`);
        await this.bot.dig(block);
        this.memory.addExperience(`mined ${block.name}`, `at ${block.position.x},${block.position.y},${block.position.z}`, true);
        this.memory.trackSkill('woodChopping', true);

        // Remove this POI since we mined it
        this.spatial.removePOI(block.position.x, block.position.y, block.position.z);

        // Collect drops by moving slightly
        await this.bot.waitForTicks(5);
      }
    } catch (err) {
      console.error(`[BehaviorEngine] Mine error: ${err.message}`);
      this.memory.addExperience(`mine ${block.name}`, `failed: ${err.message}`, false);
    }
    this._isDigging = false;
  }

  // ─── Helper: Navigation ───────────────────────────────────────────────────

  _navigateNear(x, y, z, range = 2) {
    if (!this.mm || !this.bot.pathfinder) return;

    try {
      const movements = new Movements(this.bot);
      movements.allowSprinting = true;
      // Don't break blocks while pathfinding (critical for not breaking buildings)
      movements.canDig = false;
      movements.allow1by1towers = false;
      movements.allowParkour = true;

      this.bot.pathfinder.setMovements(movements);
      this.bot.pathfinder.setGoal(new GoalNear(Math.floor(x), Math.floor(y), Math.floor(z), range));
      console.log(`[BehaviorEngine] Navigating to ${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`);
    } catch (err) {
      console.error(`[BehaviorEngine] Navigation error: ${err.message}`);
    }
  }

  // ─── Helper: Block Finding ────────────────────────────────────────────────

  _findNearestBlock(blockNames, maxDistance = 32) {
    const pos = this.bot.entity?.position;
    if (!pos) return null;

    let nearest = null;
    let nearestDist = maxDistance + 1;

    // Use bot.findBlock for efficiency when searching large areas
    try {
      const blocks = this.bot.findBlocks({
        matching: (block) => blockNames.has(block.name),
        maxDistance,
        count: 10,
      });

      for (const bpos of blocks) {
        const block = this.bot.blockAt(bpos);
        if (!block) continue;

        // Skip protected zones
        if (this.spatial.isProtected(bpos.x, bpos.z)) continue;

        const dist = pos.distanceTo(bpos);
        if (dist < nearestDist) {
          nearest = block;
          nearestDist = dist;
        }
      }
    } catch (_) {
      // Fallback: manual scan
      for (let dx = -maxDistance; dx <= maxDistance; dx += 2) {
        for (let dz = -maxDistance; dz <= maxDistance; dz += 2) {
          for (let dy = -3; dy <= 5; dy++) {
            try {
              const block = this.bot.blockAt(pos.offset(dx, dy, dz));
              if (block && blockNames.has(block.name)) {
                const dist = pos.distanceTo(block.position);
                if (dist < nearestDist) {
                  nearest = block;
                  nearestDist = dist;
                }
              }
            } catch (_) {}
          }
        }
      }
    }

    return nearest;
  }

  // ─── Helper: Hostile Detection ────────────────────────────────────────────

  _findNearestHostile() {
    const pos = this.bot.entity?.position;
    if (!pos) return null;

    let nearest = null;
    let nearestDist = Infinity;

    for (const entity of Object.values(this.bot.entities)) {
      if (entity === this.bot.entity) continue;
      if (!entity.position || !entity.name) continue;
      if (!HOSTILE_MOBS.has(entity.name)) continue;

      const dist = pos.distanceTo(entity.position);
      if (dist < nearestDist) {
        nearest = { entity, name: entity.name, dist };
        nearestDist = dist;
      }
    }

    return nearest;
  }

  // ─── Helper: Food ─────────────────────────────────────────────────────────

  _findFoodInInventory() {
    return this.bot.inventory.items().find(i => FOOD_ITEMS.has(i.name)) || null;
  }

  async _tryEat() {
    if (this._isEating) return;
    const food = this._findFoodInInventory();
    if (!food) return;

    this._isEating = true;
    try {
      await this.bot.equip(food, 'hand');
      await this.bot.consume();
      console.log(`[BehaviorEngine] Ate ${food.name}`);
      this.memory.addExperience('ate food', food.name, true);
    } catch (err) {
      console.error(`[BehaviorEngine] Eat error: ${err.message}`);
    }
    this._isEating = false;
  }

  // ─── Helper: Surface Y ───────────────────────────────────────────────────

  _getSurfaceY(x, z) {
    try {
      for (let y = 100; y > 50; y--) {
        const block = this.bot.blockAt(new Vec3(Math.floor(x), y, Math.floor(z)));
        if (block && block.name !== 'air' && block.name !== 'cave_air') {
          return y + 1;
        }
      }
    } catch (_) {}
    return null;
  }

  // ─── Helper: Stuck Detection ──────────────────────────────────────────────

  _checkStuck(pos) {
    if (this._lastPosition) {
      const dist = pos.distanceTo(this._lastPosition);
      if (dist < 0.5 && this.mm.isMoving()) {
        this._stuckCounter++;
        if (this._stuckCounter > 5) {
          console.log(`[BehaviorEngine] Stuck detected! Resetting navigation.`);
          this.mm.stop();
          this._stuckCounter = 0;
          this._currentTarget = null;

          // Jump to try to unstick
          this.bot.setControlState('jump', true);
          setTimeout(() => this.bot.setControlState('jump', false), 500);
        }
      } else {
        this._stuckCounter = 0;
      }
    }
    this._lastPosition = pos.clone();
  }

  // ─── Chat Helper (throttled) ──────────────────────────────────────────────

  say(message) {
    const now = Date.now();
    if (now - this._lastChatTime < 10000) return; // Don't spam chat
    this._lastChatTime = now;
    this.bot.chat(message.slice(0, 200));
  }
}

// Export modes too so AIAgent can reference them
BehaviorEngine.MODES = MODES;
module.exports = BehaviorEngine;
