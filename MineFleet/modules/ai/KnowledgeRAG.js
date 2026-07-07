/**
 * KnowledgeRAG.js
 *
 * Lightweight Retrieval-Augmented Generation for Minecraft knowledge.
 * Chunks the full knowledge base into topic-tagged sections and retrieves
 * only the relevant chunks based on keyword matching.
 *
 * No external dependencies — pure keyword matching on topic tags.
 */

const CHUNKS = [
  {
    topic: 'crafting_basics',
    keywords: ['craft', 'crafting', 'table', 'recipe', 'make', 'create', 'build', '2x2', '3x3', 'shaped', 'shapeless'],
    content: `CRAFTING BASICS:
• 2x2 grid (inventory): sticks, planks, crafting table, torches
• 3x3 grid (crafting table): everything else
• Shaped = items must be in correct pattern
• Shapeless = items can be placed anywhere
• Stonecutter = stone-type blocks, no waste
• Smithing Table = Netherite upgrades (diamond + netherite ingot + upgrade template)
• Grindstone = removes enchantments (returns some XP)`
  },
  {
    topic: 'tools_weapons',
    keywords: ['pickaxe', 'axe', 'shovel', 'hoe', 'sword', 'tool', 'weapon', 'durability', 'fishing', 'shears', 'flint', 'steel'],
    content: `TOOLS & WEAPONS RECIPES (3x3 Crafting Table):
Pickaxe: [MMM]/[_S_]/[_S_] (3 material + 2 sticks)
Axe: [MM_]/[MS_]/[_S_] (3 material + 2 sticks)
Shovel: [_M_]/[_S_]/[_S_] (1 material + 2 sticks)
Hoe: [MM_]/[_S_]/[_S_] (2 material + 2 sticks)
Sword: [_M_]/[_M_]/[_S_] (2 material + 1 stick)
Materials tiers: Wood → Stone → Iron → Gold → Diamond → Netherite
Durability: Wood~59 | Stone~131 | Iron~250 | Gold~32 | Diamond~1561 | Netherite~2031
Fishing Rod: 3 sticks + 2 string | Shears: 2 iron ingots | Flint&Steel: 1 flint + 1 iron`
  },
  {
    topic: 'armor',
    keywords: ['armor', 'helmet', 'chestplate', 'leggings', 'boots', 'protection', 'shield', 'turtle', 'elytra'],
    content: `ARMOR RECIPES (3x3 Crafting Table):
Helmet: [MMM]/[M_M] = 5 material
Chestplate: [M_M]/[MMM]/[MMM] = 8 material
Leggings: [MMM]/[M_M]/[M_M] = 7 material
Boots: [M_M]/[M_M] = 4 material
Materials: Leather | Gold | Iron | Diamond (upgrade to Netherite via Smithing Table)
Shield: 6 planks + 1 iron ingot (Y-shape)
Turtle Shell Helmet: 5 Scutes (from baby turtles growing up)
Elytra: End City ship chests only, NOT craftable`
  },
  {
    topic: 'building_blocks',
    keywords: ['furnace', 'chest', 'door', 'bed', 'torch', 'ladder', 'fence', 'gate', 'slab', 'stair', 'wall', 'glass', 'brick', 'concrete', 'wool'],
    content: `BUILDING & UTILITY BLOCKS:
Crafting Table: 4 planks (2x2) | Furnace: 8 cobblestone (hollow square)
Blast Furnace: 5 iron + 1 furnace + 3 smooth stone | Smoker: 4 logs + 1 furnace
Chest: 8 planks (hollow square) | Barrel: 6 planks + 2 slabs
Anvil: 3 iron blocks + 4 iron ingots | Enchanting Table: 4 obsidian + 2 diamonds + 1 book
Bookshelf: 6 planks + 3 books | Brewing Stand: 3 cobblestone + 1 blaze rod
Torch: 1 coal + 1 stick = 4 torches | Ladder: 7 sticks (H-shape) = 3 ladders
Bed: 3 wool + 3 planks | Door: 6 planks or 6 iron ingots
Fence: 4 planks + 2 sticks | Fence Gate: 2 planks + 4 sticks
Slab: 3 of material in row = 6 slabs | Stairs: 6 of material in stair shape = 4 stairs`
  },
  {
    topic: 'food_cooking',
    keywords: ['food', 'eat', 'cook', 'hunger', 'bread', 'steak', 'porkchop', 'chicken', 'mutton', 'fish', 'cake', 'pie', 'golden', 'apple', 'carrot', 'saturation', 'stew', 'suspicious'],
    content: `FOOD & COOKING:
Best foods by saturation: Golden Carrot (14.4) > Steak/Cooked Pork (12.8) > Cooked Mutton (9.6) > Bread (6)
Cooking: Raw meat in Furnace/Smoker + fuel = cooked version (smoker is 2x faster)
Bread: 3 wheat in a row | Cake: 3 milk + 2 sugar + 1 egg + 3 wheat
Pumpkin Pie: pumpkin + sugar + egg | Cookie: 2 wheat + 1 cocoa bean = 8 cookies
Golden Apple: 1 apple + 8 gold INGOTS (gives Absorption + Regen)
Enchanted Golden Apple: found in dungeon/temple chests only, NOT craftable
Golden Carrot: 1 carrot + 8 gold NUGGETS (best saturation food)
Suspicious Stew: mushroom + bowl + flower (effect depends on flower type)
Animal drops: Cow→raw beef | Pig→raw porkchop | Chicken→raw chicken | Sheep→raw mutton`
  },
  {
    topic: 'mining_ores',
    keywords: ['mine', 'mining', 'ore', 'diamond', 'iron', 'gold', 'coal', 'copper', 'lapis', 'redstone', 'emerald', 'ancient', 'debris', 'netherite', 'depth', 'level', 'strip', 'branch', 'cave'],
    content: `MINING & ORE DEPTHS (Y-levels, Java 1.18+):
Coal: Y:0 to Y:320, best at Y:96
Copper: Y:-16 to Y:112, best at Y:48
Iron: Y:-24 to Y:56, best at Y:16 (also Y:232 in mountains)
Gold: Y:-64 to Y:32, best at Y:-16 (also Nether at any Y in Nether Wastes)
Lapis Lazuli: Y:-64 to Y:64, best at Y:0
Redstone: Y:-64 to Y:16, best at Y:-59
Diamond: Y:-64 to Y:16, best at Y:-59
Emerald: Y:-16 to Y:320, ONLY in Mountains biome
Ancient Debris: Y:8 to Y:119 in Nether, best at Y:15 (blast with TNT/beds)
Mining tool requirements: Wood pick→coal,stone | Stone pick→iron,lapis,copper | Iron pick→diamond,gold,emerald,redstone | Diamond pick→obsidian,ancient debris
Strip mining: dig at Y:-59 for diamonds, branch every 2 blocks`
  },
  {
    topic: 'smelting',
    keywords: ['smelt', 'furnace', 'fuel', 'ingot', 'charcoal', 'glass', 'brick', 'smooth', 'burn'],
    content: `SMELTING (Furnace/Blast Furnace):
Fuel burn times: Lava bucket=100 items | Coal/Charcoal=8 | Plank=1.5 | Stick=0.5 | Blaze rod=12
Iron Ore → Iron Ingot | Gold Ore → Gold Ingot | Copper Ore → Copper Ingot
Raw Iron → Iron Ingot | Raw Gold → Gold Ingot | Raw Copper → Copper Ingot
Sand → Glass | Cobblestone → Stone | Stone → Smooth Stone
Clay Ball → Brick | Netherrack → Nether Brick
Cactus → Green Dye | Kelp → Dried Kelp | Log → Charcoal
Blast Furnace: 2x faster for ores/metals only | Smoker: 2x faster for food only`
  },
  {
    topic: 'enchanting',
    keywords: ['enchant', 'enchanting', 'enchantment', 'experience', 'xp', 'lapis', 'bookshelf', 'anvil', 'mending', 'unbreaking', 'sharpness', 'efficiency', 'fortune', 'silk', 'protection', 'looting'],
    content: `ENCHANTING:
Enchanting Table: 4 obsidian + 2 diamonds + 1 book
15 bookshelves around table (1 block gap) for max level 30 enchantments
Each enchant costs XP levels + 1-3 lapis lazuli
Top enchants: Mending (repairs with XP), Unbreaking III, Efficiency V, Fortune III, Silk Touch
Sword: Sharpness V, Looting III, Fire Aspect II, Sweeping Edge III
Armor: Protection IV, Feather Falling IV, Thorns III, Depth Strider III
Bow: Power V, Infinity (or Mending), Flame
Trident: Riptide III OR Loyalty III + Channeling
Silk Touch vs Fortune: mutually exclusive. Silk=get block itself, Fortune=more drops`
  },
  {
    topic: 'brewing_potions',
    keywords: ['brew', 'potion', 'brewing', 'nether', 'wart', 'blaze', 'powder', 'splash', 'lingering', 'strength', 'speed', 'healing', 'invisibility', 'night', 'vision', 'fire', 'resistance', 'water', 'breathing'],
    content: `BREWING:
Brewing Stand: 3 cobblestone + 1 blaze rod (fuel: blaze powder)
Base: Water Bottle → add Nether Wart = Awkward Potion (base for most potions)
Key potions from Awkward Potion:
+ Sugar = Speed | + Rabbit Foot = Leaping | + Glistering Melon = Healing
+ Spider Eye = Poison | + Ghast Tear = Regeneration | + Blaze Powder = Strength
+ Magma Cream = Fire Resistance | + Golden Carrot = Night Vision | + Pufferfish = Water Breathing
+ Phantom Membrane = Slow Falling | + Turtle Shell = Turtle Master
Modifiers: Redstone = extend duration | Glowstone = increase potency | Gunpowder = splash | Dragon's Breath = lingering`
  },
  {
    topic: 'nether',
    keywords: ['nether', 'portal', 'obsidian', 'blaze', 'ghast', 'piglin', 'bastion', 'fortress', 'wither', 'soul', 'netherite', 'quartz', 'glowstone', 'magma', 'lava'],
    content: `THE NETHER:
Portal: 4x5 obsidian frame (minimum 10 blocks), light with flint&steel
Nether coords = Overworld coords / 8 (travel 1 block in Nether = 8 in Overworld)
Biomes: Nether Wastes, Crimson Forest, Warped Forest (no hostiles), Soul Sand Valley, Basalt Deltas
Key structures: Nether Fortress (blaze spawners, wither skeletons, nether wart) | Bastion Remnant (piglins, gold, loot)
Key mobs: Blaze (drops blaze rods, essential for brewing + end), Ghast (fireball shooters), Wither Skeleton (drops skulls for Wither boss)
Netherite: Mine Ancient Debris (Y:15 best) → smelt → 4 scraps + 4 gold = 1 Netherite Ingot
Piglin bartering: give gold ingots → random loot (iron, gravel, pearls, potions)`
  },
  {
    topic: 'the_end',
    keywords: ['end', 'ender', 'dragon', 'enderman', 'pearl', 'portal', 'stronghold', 'eye', 'elytra', 'shulker', 'chorus'],
    content: `THE END:
Find stronghold: throw Eye of Ender (blaze powder + ender pearl) → follow direction
End Portal: fill 12 End Portal Frames with Eyes of Ender
Ender Dragon: destroy End Crystals on obsidian towers → then attack dragon
Dragon drops: 12,000 XP + dragon egg (trophy) + exit portal + end gateway
End Cities: found via end gateway → Shulker mobs (drop shells for shulker boxes) + Elytra in ship
Elytra: equip in chestplate slot, use firework rockets to fly
Eye of Ender: 1 blaze powder + 1 ender pearl`
  },
  {
    topic: 'mobs_hostile',
    keywords: ['mob', 'monster', 'hostile', 'zombie', 'skeleton', 'creeper', 'spider', 'enderman', 'witch', 'phantom', 'slime', 'guardian', 'raid', 'pillager', 'warden'],
    content: `HOSTILE MOBS & COMBAT:
Zombie: burns in daylight, drops rotten flesh. Baby zombie = fast & dangerous
Skeleton: ranged (bow), burns in sun, drops bones + arrows
Creeper: explodes near player! Shield blocks it. Drops gunpowder. Charged creeper = lightning hit
Spider: neutral in day, hostile at night. Climbs walls. Drops string + spider eye
Enderman: neutral unless you look at eyes. Teleports. Drops ender pearl. Weak to water
Witch: throws harmful splash potions. Drops potions + redstone + glowstone
Phantom: spawns if you don't sleep for 3+ days. Drops phantom membrane
Slime: spawns in swamps or deep underground. Drops slimeballs
Warden: Deep Dark biome. AVOID — 2 hits kill full netherite. Summoned by sculk sensors
Tips: Sleep every 3 days (no phantoms), carry shield, light up areas (no spawns at light 7+)`
  },
  {
    topic: 'mobs_passive',
    keywords: ['cow', 'pig', 'sheep', 'chicken', 'horse', 'wolf', 'cat', 'ocelot', 'llama', 'villager', 'tame', 'breed', 'animal', 'pet', 'dog'],
    content: `PASSIVE MOBS & BREEDING:
Cow: breed with wheat → drops leather + raw beef | milk with bucket
Pig: breed with carrot/potato/beetroot → drops raw porkchop
Sheep: breed with wheat → drops wool + raw mutton | shear for 1-3 wool
Chicken: breed with seeds → drops feathers + raw chicken + eggs
Horse: breed with golden apple/carrot → ride with saddle
Wolf/Dog: tame with bone → breed with any meat → follows + attacks for you
Cat: tame with raw cod/salmon → scares creepers away
Villager: breed by giving food + beds → trade emeralds for items
Iron Golem: 4 iron blocks + 1 pumpkin → protects village
Snow Golem: 2 snow blocks + 1 pumpkin → throws snowballs`
  },
  {
    topic: 'farming',
    keywords: ['farm', 'wheat', 'carrot', 'potato', 'beetroot', 'melon', 'pumpkin', 'sugar', 'cane', 'bamboo', 'cactus', 'cocoa', 'crop', 'seed', 'grow', 'harvest', 'bone', 'meal', 'compost'],
    content: `FARMING:
Wheat: break grass → seeds → plant on tilled soil (hoe) near water → 8 stages → harvest
Carrot/Potato: found in villages or zombie drops → plant directly → harvest when fully grown
Beetroot: from village chests → plant seeds → harvest
Melon/Pumpkin: seeds from dungeon chests → grow on vine → harvest fruit (stem stays)
Sugar Cane: grows next to water, up to 3 tall. Used for paper + sugar
Bamboo: jungle biome, grows very tall, fuel or scaffolding
Bone Meal: 1 bone = 3 bone meal → instant-grow crops and saplings
Auto-farm: Observer watches crop → piston breaks → hopper collects
Tree farming: plant sapling + bone meal → instant tree → chop → replant`
  },
  {
    topic: 'redstone',
    keywords: ['redstone', 'piston', 'repeater', 'comparator', 'hopper', 'dispenser', 'dropper', 'observer', 'lever', 'button', 'pressure', 'plate', 'circuit', 'auto'],
    content: `REDSTONE:
Piston: 3 planks + 4 cobblestone + 1 iron + 1 redstone
Sticky Piston: 1 piston + 1 slimeball
Repeater: 3 stone + 2 redstone torches + 1 redstone
Comparator: 3 stone + 3 redstone torches + 1 nether quartz
Observer: 6 cobblestone + 2 redstone + 1 quartz (detects block changes)
Hopper: 5 iron + 1 chest (collects items, feeds into containers)
Dispenser: 7 cobblestone + 1 bow + 1 redstone
Common circuits: NOT gate (torch behind block), clock (repeater loop), T flip-flop
Auto-farm: observer + piston + hopper = fully automated harvesting`
  },
  {
    topic: 'survival_tips',
    keywords: ['survive', 'survival', 'tip', 'trick', 'start', 'first', 'night', 'beginner', 'new', 'help', 'advice', 'strategy', 'what', 'should', 'do'],
    content: `SURVIVAL TIPS:
First day priority: punch tree → craft planks → crafting table → wooden pickaxe → mine stone → stone tools → find coal → torches → shelter before night
Always carry: food, torches, pickaxe, water bucket, wood
Never dig straight down: lava, caves, falling gravel
Water bucket: cancels fall damage (place water right before landing)
Light level 7+ prevents mob spawns — place torches every 7 blocks
Bed = set spawn point. Sleep to skip night (avoid phantoms)
Lava bucket = best early fuel (smelts 100 items!)
Shield blocks creeper explosions and skeleton arrows
Press F3 for coordinates, biome, light level info
Milk bucket removes ALL potion effects (good and bad)
Curing zombie villager: Splash Weakness + Golden Apple = best trade prices`
  },
  {
    topic: 'biomes_exploration',
    keywords: ['biome', 'plains', 'forest', 'desert', 'jungle', 'mountain', 'ocean', 'swamp', 'taiga', 'savanna', 'badlands', 'mushroom', 'deep', 'dark', 'lush', 'dripstone', 'explore', 'village', 'temple', 'dungeon', 'structure', 'monument', 'mansion'],
    content: `BIOMES & STRUCTURES:
Plains: flat, villages, horses | Forest: trees, wolves, flowers
Desert: sand, temples, husks, villages | Jungle: tall trees, parrots, temples, bamboo, cocoa
Mountains: emeralds, goats, high terrain | Ocean: monuments, shipwrecks, buried treasure
Swamp: slimes, witch huts | Taiga: foxes, sweet berries, villages
Key structures: Village (trades, loot) | Desert/Jungle Temple (traps + treasure)
Mineshaft (rails, spider spawners, chests) | Stronghold (End portal)
Ocean Monument (guardians, sponges, gold) | Woodland Mansion (totems of undying)
Ancient City (deep dark, warden, unique loot) | Trail Ruins (archaeology)`
  }
];

class KnowledgeRAG {
  constructor() {
    this.chunks = CHUNKS;
  }

  /**
   * Retrieve the most relevant knowledge chunks for a query.
   * Uses keyword matching — no vector DB needed.
   *
   * @param {string} query — the user's question or game situation description
   * @param {number} topK — how many chunks to return (default 2)
   * @returns {string} — concatenated relevant knowledge text
   */
  retrieve(query, topK = 2) {
    if (!query) return '';

    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/);

    // Score each chunk by keyword matches
    const scored = this.chunks.map(chunk => {
      let score = 0;
      for (const keyword of chunk.keywords) {
        // Exact word match gets 3 points
        if (queryWords.includes(keyword)) {
          score += 3;
        }
        // Partial/substring match gets 1 point
        else if (queryLower.includes(keyword)) {
          score += 1;
        }
      }
      return { chunk, score };
    });

    // Sort by score descending, take top K
    scored.sort((a, b) => b.score - a.score);
    const topChunks = scored.slice(0, topK).filter(s => s.score > 0);

    if (topChunks.length === 0) {
      // Return survival tips as default fallback
      return this.chunks.find(c => c.topic === 'survival_tips')?.content || '';
    }

    return topChunks.map(s => s.content).join('\n\n');
  }

  /**
   * Get knowledge for autonomous gameplay based on game state.
   */
  retrieveForGameState(state) {
    const parts = [];

    // If health is low, get food/survival info
    if (state.health < 10) parts.push('food', 'survive');
    // If inventory is empty, get tools info
    if (state.invSummary === 'empty' || state.invSummary.length < 5) parts.push('tools', 'craft', 'survive');
    // If underground, get mining info
    if (state.posStr && parseInt(state.posStr.split('Y:')[1]) < 50) parts.push('mining', 'ore');
    // General gameplay
    parts.push('survive', 'craft');

    return this.retrieve(parts.join(' '), 2);
  }

  /**
   * List all available knowledge topics.
   */
  getTopics() {
    return this.chunks.map(c => c.topic);
  }
}

module.exports = KnowledgeRAG;
