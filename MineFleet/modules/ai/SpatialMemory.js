/**
 * SpatialMemory.js
 *
 * Grid-based world map that the bot builds as it explores.
 * Tracks points of interest, player structures, explored areas,
 * and home position. Persists to disk across restarts.
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const SPATIAL_FILE = path.join(DATA_DIR, 'spatial_memory.json');
const CHUNK_SIZE = 16; // Minecraft chunk size
const AUTO_SAVE_MS = 120_000; // Save every 2 minutes
const MAX_POI = 200;

// Blocks that are NEVER natural — if we see clusters of these, it's a player structure
const STRUCTURE_BLOCKS = new Set([
  'oak_planks', 'spruce_planks', 'birch_planks', 'jungle_planks', 'acacia_planks', 'dark_oak_planks',
  'oak_stairs', 'spruce_stairs', 'birch_stairs', 'cobblestone_stairs', 'stone_brick_stairs',
  'oak_fence', 'spruce_fence', 'glass', 'glass_pane', 'oak_door', 'spruce_door', 'iron_door',
  'chest', 'furnace', 'crafting_table', 'bed', 'torch', 'wall_torch', 'lantern',
  'bookshelf', 'ladder', 'sign', 'oak_sign', 'spruce_sign',
  'cobblestone_wall', 'stone_bricks', 'bricks', 'polished_andesite',
  'smooth_stone', 'chiseled_stone_bricks', 'mossy_stone_bricks',
  'hay_block', 'composter', 'barrel', 'smoker', 'blast_furnace',
  'anvil', 'enchanting_table', 'brewing_stand', 'cauldron',
]);

// Blocks worth remembering as points of interest
const INTERESTING_BLOCKS = new Set([
  'oak_log', 'spruce_log', 'birch_log', 'jungle_log', 'acacia_log', 'dark_oak_log',
  'coal_ore', 'iron_ore', 'gold_ore', 'diamond_ore', 'lapis_ore', 'redstone_ore', 'emerald_ore',
  'deepslate_coal_ore', 'deepslate_iron_ore', 'deepslate_gold_ore', 'deepslate_diamond_ore',
  'crafting_table', 'furnace', 'chest',
  'sugar_cane', 'wheat', 'carrots', 'potatoes', 'melon', 'pumpkin',
]);

class SpatialMemory {
  constructor(botName) {
    this.botName = botName;
    this._dirty = false;
    this._saveTimer = null;

    this.data = {
      botName,
      homePosition: null,        // { x, y, z } — spawn/first join location
      exploredChunks: {},        // "cx,cz" -> timestamp
      pointsOfInterest: [],      // [{ type, x, y, z, blockName, discoveredAt }]
      protectedZones: [],        // [{ cx, cz, radius, reason }] — player structures, don't touch
      areaKnowledge: {},         // "cx,cz" -> { biome, hasWater, hasTrees, hasCave }
    };

    this._load();
    this._saveTimer = setInterval(() => this.save(), AUTO_SAVE_MS);
    console.log(`[SpatialMemory][${botName}] Initialized (${Object.keys(this.data.exploredChunks).length} chunks explored, ${this.data.pointsOfInterest.length} POIs)`);
  }

  // ─── Persistence ──────────────────────────────────────────────────────────

  _load() {
    try {
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
      if (fs.existsSync(SPATIAL_FILE)) {
        const raw = fs.readFileSync(SPATIAL_FILE, 'utf-8');
        const loaded = JSON.parse(raw);
        this.data = { ...this.data, ...loaded };
        console.log(`[SpatialMemory][${this.botName}] Loaded: home=${this.data.homePosition ? 'yes' : 'no'}, ${Object.keys(this.data.exploredChunks).length} chunks, ${this.data.pointsOfInterest.length} POIs`);
      }
    } catch (err) {
      console.error(`[SpatialMemory][${this.botName}] Load failed: ${err.message}`);
    }
  }

  save() {
    if (!this._dirty) return;
    try {
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(SPATIAL_FILE, JSON.stringify(this.data, null, 2), 'utf-8');
      this._dirty = false;
    } catch (err) {
      console.error(`[SpatialMemory][${this.botName}] Save failed: ${err.message}`);
    }
  }

  shutdown() {
    if (this._saveTimer) { clearInterval(this._saveTimer); this._saveTimer = null; }
    this._dirty = true;
    this.save();
    console.log(`[SpatialMemory][${this.botName}] Saved and shut down.`);
  }

  // ─── Home Position ────────────────────────────────────────────────────────

  setHome(x, y, z) {
    if (!this.data.homePosition) {
      this.data.homePosition = { x: Math.floor(x), y: Math.floor(y), z: Math.floor(z) };
      this._dirty = true;
      console.log(`[SpatialMemory] Home set to ${this.data.homePosition.x}, ${this.data.homePosition.y}, ${this.data.homePosition.z}`);
    }
  }

  getHome() { return this.data.homePosition; }

  distanceToHome(x, z) {
    if (!this.data.homePosition) return 0;
    const dx = x - this.data.homePosition.x;
    const dz = z - this.data.homePosition.z;
    return Math.sqrt(dx * dx + dz * dz);
  }

  // ─── Chunk Exploration ────────────────────────────────────────────────────

  _chunkKey(x, z) {
    return `${Math.floor(x / CHUNK_SIZE)},${Math.floor(z / CHUNK_SIZE)}`;
  }

  markExplored(x, z) {
    const key = this._chunkKey(x, z);
    if (!this.data.exploredChunks[key]) {
      this.data.exploredChunks[key] = Date.now();
      this._dirty = true;
    }
  }

  isExplored(x, z) {
    return !!this.data.exploredChunks[this._chunkKey(x, z)];
  }

  /**
   * Pick an unexplored direction to explore from the current position.
   * Returns { x, z } target coordinates or null if everything nearby is explored.
   */
  getExploreTarget(currentX, currentZ, range = 50) {
    const candidates = [];
    const step = CHUNK_SIZE;

    // Check 8 cardinal + diagonal directions
    const directions = [
      { dx: 1, dz: 0 }, { dx: -1, dz: 0 }, { dx: 0, dz: 1 }, { dx: 0, dz: -1 },
      { dx: 1, dz: 1 }, { dx: 1, dz: -1 }, { dx: -1, dz: 1 }, { dx: -1, dz: -1 },
    ];

    for (const dir of directions) {
      for (let dist = step; dist <= range; dist += step) {
        const tx = Math.floor(currentX + dir.dx * dist);
        const tz = Math.floor(currentZ + dir.dz * dist);
        if (!this.isExplored(tx, tz)) {
          candidates.push({ x: tx, z: tz, dist });
          break; // Take the closest unexplored chunk in this direction
        }
      }
    }

    if (candidates.length === 0) {
      // Everything nearby is explored — go further out in a random direction
      const dir = directions[Math.floor(Math.random() * directions.length)];
      return { x: Math.floor(currentX + dir.dx * range), z: Math.floor(currentZ + dir.dz * range) };
    }

    // Prefer closer unexplored chunks
    candidates.sort((a, b) => a.dist - b.dist);
    // Pick randomly from the closest 3
    const pick = candidates[Math.floor(Math.random() * Math.min(3, candidates.length))];
    return { x: pick.x, z: pick.z };
  }

  // ─── Points of Interest ───────────────────────────────────────────────────

  addPOI(type, x, y, z, blockName = '') {
    // Dedup: don't add if there's already a POI within 3 blocks
    const exists = this.data.pointsOfInterest.some(p =>
      p.type === type && Math.abs(p.x - x) < 3 && Math.abs(p.z - z) < 3
    );
    if (exists) return;

    this.data.pointsOfInterest.push({
      type, x: Math.floor(x), y: Math.floor(y), z: Math.floor(z),
      blockName, discoveredAt: Date.now(),
    });

    // Trim old POIs
    if (this.data.pointsOfInterest.length > MAX_POI) {
      this.data.pointsOfInterest = this.data.pointsOfInterest.slice(-MAX_POI);
    }
    this._dirty = true;
  }

  /**
   * Find nearest POI of a given type from position.
   */
  findNearestPOI(type, x, z) {
    return this.data.pointsOfInterest
      .filter(p => p.type === type)
      .map(p => ({ ...p, dist: Math.sqrt((p.x - x) ** 2 + (p.z - z) ** 2) }))
      .sort((a, b) => a.dist - b.dist)[0] || null;
  }

  removePOI(x, y, z) {
    this.data.pointsOfInterest = this.data.pointsOfInterest.filter(p =>
      !(Math.abs(p.x - x) < 2 && Math.abs(p.y - y) < 2 && Math.abs(p.z - z) < 2)
    );
    this._dirty = true;
  }

  // ─── Structure Detection ──────────────────────────────────────────────────

  /**
   * Scan area around bot and detect player-built structures.
   * If we find a cluster of non-natural blocks, mark that zone as protected.
   */
  scanForStructures(bot) {
    const pos = bot.entity?.position;
    if (!pos) return;

    const structureCount = {};
    const checkRadius = 8;

    for (let dx = -checkRadius; dx <= checkRadius; dx += 2) {
      for (let dz = -checkRadius; dz <= checkRadius; dz += 2) {
        for (let dy = -3; dy <= 5; dy++) {
          try {
            const block = bot.blockAt(pos.offset(dx, dy, dz));
            if (block && STRUCTURE_BLOCKS.has(block.name)) {
              const key = this._chunkKey(pos.x + dx, pos.z + dz);
              structureCount[key] = (structureCount[key] || 0) + 1;
            }
          } catch (_) {}
        }
      }
    }

    // If 5+ structure blocks in a chunk area, mark as protected
    for (const [key, count] of Object.entries(structureCount)) {
      if (count >= 5) {
        const existing = this.data.protectedZones.some(z => `${z.cx},${z.cz}` === key);
        if (!existing) {
          const [cx, cz] = key.split(',').map(Number);
          this.data.protectedZones.push({
            cx, cz, radius: CHUNK_SIZE,
            reason: 'player_structure', detectedAt: Date.now()
          });
          this._dirty = true;
          console.log(`[SpatialMemory] Protected zone detected at chunk ${key}`);
        }
      }
    }
  }

  /**
   * Check if a block position is in a protected zone (player structure).
   */
  isProtected(x, z) {
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    return this.data.protectedZones.some(z => z.cx === cx && z.cz === cz);
  }

  // ─── World Scan ───────────────────────────────────────────────────────────

  /**
   * Scan the area around the bot and record interesting blocks as POIs.
   * Called by BehaviorEngine every few seconds.
   */
  scanSurroundings(bot) {
    const pos = bot.entity?.position;
    if (!pos) return;

    this.markExplored(pos.x, pos.z);

    const scanRadius = 8;
    for (let dx = -scanRadius; dx <= scanRadius; dx += 2) {
      for (let dz = -scanRadius; dz <= scanRadius; dz += 2) {
        for (let dy = -3; dy <= 8; dy++) {
          try {
            const block = bot.blockAt(pos.offset(dx, dy, dz));
            if (!block) continue;

            if (INTERESTING_BLOCKS.has(block.name)) {
              let poiType = 'resource';
              if (block.name.includes('log')) poiType = 'tree';
              else if (block.name.includes('ore')) poiType = 'ore';
              else if (['crafting_table', 'furnace', 'chest'].includes(block.name)) poiType = 'utility';
              else if (['sugar_cane', 'wheat', 'carrots', 'potatoes', 'melon', 'pumpkin'].includes(block.name)) poiType = 'food';

              this.addPOI(poiType, block.position.x, block.position.y, block.position.z, block.name);
            }
          } catch (_) {}
        }
      }
    }

    // Also scan for structures
    this.scanForStructures(bot);
  }

  // ─── Summary for LLM Prompt ───────────────────────────────────────────────

  getSummaryForPrompt(currentX, currentZ) {
    const parts = [];
    if (this.data.homePosition) {
      const homeDist = this.distanceToHome(currentX, currentZ);
      parts.push(`Home: X:${this.data.homePosition.x} Z:${this.data.homePosition.z} (${Math.round(homeDist)} blocks away)`);
    }
    parts.push(`Explored: ${Object.keys(this.data.exploredChunks).length} chunks`);

    // Nearby POIs
    const nearPOIs = this.data.pointsOfInterest
      .map(p => ({ ...p, dist: Math.sqrt((p.x - currentX) ** 2 + (p.z - currentZ) ** 2) }))
      .filter(p => p.dist < 100)
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 5);

    if (nearPOIs.length > 0) {
      parts.push('Nearby POIs: ' + nearPOIs.map(p => `${p.blockName}@${p.x},${p.y},${p.z}(${Math.round(p.dist)}m)`).join(', '));
    }

    parts.push(`Protected zones: ${this.data.protectedZones.length}`);
    return parts.join(' | ');
  }
}

module.exports = SpatialMemory;
