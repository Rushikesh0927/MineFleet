/**
 * MinecraftKnowledge.js
 *
 * Comprehensive Minecraft Java Edition knowledge base for AIAgent.
 * Sourced from minecraft.wiki — covering crafting, smelting, brewing,
 * resources, biomes, mobs, builds, enchanting, and survival strategies.
 *
 * Format: exported as a single string so it can be injected into the
 * AI system prompt without any network calls at runtime.
 */

const MINECRAFT_KNOWLEDGE = `
=== MINECRAFT JAVA EDITION — COMPLETE KNOWLEDGE BASE ===
Source: minecraft.wiki (latest Java Edition)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CRAFTING BASICS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• 2x2 grid (inventory): sticks, planks, crafting table, torches, bowls
• 3x3 grid (crafting table): everything else
• Shaped = items must be in correct pattern (can mirror horizontally)
• Shapeless = items can be placed anywhere in grid
• Stonecutter = stone-type blocks only, no material waste
• Smithing Table = Netherite upgrades (diamond + netherite ingot + upgrade template)
• Grindstone = removes enchantments (returns some XP)
• Loom = banner patterns (wool + stick + string + optional dye)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TOOLS & WEAPONS — CRAFTING RECIPES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TOOL PATTERNS (use Crafting Table, 3x3):
- Pickaxe:   [M M M] / [_ S _] / [_ S _]   (M=material, S=stick)
- Axe:       [M M _] / [M S _] / [_ S _]
- Shovel:    [_ M _] / [_ S _] / [_ S _]
- Hoe:       [M M _] / [_ S _] / [_ S _]
- Sword:     [_ M _] / [_ M _] / [_ S _]

MATERIALS (tiers): Wooden Plank → Stone (cobblestone) → Iron Ingot → Gold Ingot → Diamond → Netherite
Netherite tools = diamond tool + Netherite Ingot + Netherite Upgrade Smithing Template (in Smithing Table)

DURABILITY (hits before breaking):
Wood: ~59 | Stone: ~131 | Iron: ~250 | Gold: ~32 | Diamond: ~1561 | Netherite: ~2031

SPECIAL TOOLS:
- Fishing Rod:  [_ _ S] / [_ S F] / [S F _]   (F=string/thread) → 2 sticks + 2 string
- Flint & Steel: [F _ _] / [_ I _] / [_ _ _]  (F=Flint, I=Iron Ingot) → 1 each
- Shears: [_ I _] / [I _ _]  (2x2 diagonal) → 2 Iron Ingots
- Compass: [_ I _] / [I R I] / [_ I _]  (R=Redstone Dust) → 4 Iron Ingots + 1 Redstone
- Clock: same pattern as Compass but Gold Ingot + Redstone
- Spyglass: [_ A _] / [_ C _]  (A=Amethyst Shard, C=Copper Ingot) → 1 Amethyst Shard + 1 Copper Ingot
- Carrot on a Stick: Fishing Rod + Carrot (shapeless)
- Warped Fungus on a Stick: Fishing Rod + Warped Fungus (shapeless)
- Bundle: 6 Rabbit Hide + 2 String (U-shape)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ARMOR — CRAFTING RECIPES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
All armor uses 3x3 table:
- Helmet:     [M M M] / [M _ M]   → 5 material
- Chestplate: [M _ M] / [M M M] / [M M M]  → 8 material
- Leggings:   [M M M] / [M _ M] / [M _ M]  → 7 material
- Boots:      [M _ M] / [M _ M]   → 4 material

MATERIALS: Leather | Gold Ingot | Iron Ingot | Diamond (upgrade to Netherite via Smithing Table)
Turtle Shell Helmet: 5 Scutes (dropped when baby turtle grows up)
Elytra: found in End City ship chests only, not craftable

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BUILDING & UTILITY BLOCKS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Crafting Table: 4 Planks (2x2)
- Furnace: 8 Cobblestone (hollow square)
- Blast Furnace: 5 Iron Ingot + 1 Furnace + 3 Smooth Stone
- Smoker: 4 Logs (any) + 1 Furnace
- Chest: 8 Planks (hollow square) → 1 Chest
- Trapped Chest: 1 Chest + 1 Tripwire Hook
- Ender Chest: 8 Obsidian + 1 Eye of Ender
- Shulker Box: 2 Shulker Shells + 1 Chest
- Barrel: 6 Planks + 2 Slabs (any) — hold like chest
- Anvil: 3 Iron Blocks + 4 Iron Ingots
- Enchanting Table: 4 Obsidian + 2 Diamonds + 1 Book
- Bookshelf: 6 Planks + 3 Books
- Brewing Stand: 3 Cobblestone + 1 Blaze Rod
- Beacon: 5 Glass + 3 Obsidian + 1 Nether Star (kills Wither boss)
- Conduit: 8 Nautilus Shell + 1 Heart of the Sea (found in buried treasure)
- Hopper: 5 Iron Ingots (U-shape) + 1 Chest
- Dropper: 7 Cobblestone + 1 Redstone Dust (hollow bottom row)
- Dispenser: 7 Cobblestone + 1 Bow + 1 Redstone Dust
- Piston: 3 Planks + 4 Cobblestone + 1 Iron Ingot + 1 Redstone
- Sticky Piston: 1 Piston + 1 Slimeball
- Observer: 6 Cobblestone + 2 Redstone + 1 Nether Quartz
- Note Block: 8 Planks + 1 Redstone
- Jukebox: 8 Planks + 1 Diamond
- Lectern: 4 Wooden Slabs + 1 Bookshelf
- Grindstone: 2 Sticks + 1 Stone Slab + 2 Planks
- Smithing Table: 4 Planks + 2 Iron Ingots
- Loom: 2 String + 2 Planks
- Stonecutter: 3 Stone + 1 Iron Ingot
- Cartography Table: 2 Paper + 4 Planks
- Fletching Table: 2 Flint + 4 Planks
- Composter: 7 Wooden Slabs (U-shape)
- Bell: found in villages only, not craftable
- Cauldron: 7 Iron Ingots (U-shape)
- TNT: 4 Sand + 5 Gunpowder (checkerboard)
- Crafter (1.21+): 7 Iron Ingots + 1 Crafting Table + 1 Redstone Dust

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DECORATION BLOCKS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Torch: 1 Coal/Charcoal + 1 Stick → 4 Torches
- Lantern: 1 Torch + 8 Iron Nuggets → 1 Lantern
- Soul Lantern: 1 Soul Torch + 8 Iron Nuggets
- Soul Torch: 1 Coal/Charcoal + 1 Stick + 1 Soul Sand/Soil
- Campfire: 3 Sticks + 1 Coal/Charcoal + 3 Logs
- Soul Campfire: 3 Sticks + 1 Soul Sand/Soil + 3 Logs
- Glowstone: found in Nether ceiling — gives more light than torches
- Sea Lantern: 5 Prismarine Crystals + 4 Prismarine Shards
- Shroomlight: found in Nether (Crimson/Warped Forests) under huge fungi
- Froglight: dropped by magma cubes eaten by frogs
- Slab: any 3 matching material in a row → 6 slabs
- Stairs: 3+2+1 pattern of same material → 4 stairs
- Wall: 6 stone-type blocks in 2 rows → 6 walls
- Fence: 4 Planks + 2 Sticks → 3 fences
- Nether Brick Fence: 4 Nether Bricks + 2 Nether Brick items
- Gate: 2 Sticks + 4 Planks (alternating) → 1 gate
- Door (wood): 6 Planks (2 columns) → 3 doors
- Door (iron): 6 Iron Ingots → 3 iron doors
- Trapdoor (wood): 6 Planks (2 rows) → 2 trapdoors
- Trapdoor (iron): 4 Iron Ingots → 1 iron trapdoor
- Carpet: 2 Wool (shapeless) → 3 Carpet
- Banner: 6 Wool (same color) + 1 Stick → 1 Banner
- Item Frame: 8 Sticks + 1 Leather
- Glow Item Frame: 1 Item Frame + 1 Glow Ink Sac
- Painting: 8 Sticks + 1 Wool
- Armor Stand: 5 Sticks + 1 Stone Slab
- Flower Pot: 3 Bricks
- Scaffolding: 6 Bamboo + 1 String → 6 Scaffolding
- Candle: 1 String + 1 Honeycomb
- Chain: 1 Iron Ingot + 2 Iron Nuggets

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TRANSPORTATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Minecart: 5 Iron Ingots (U-shape)
- Chest Minecart: 1 Minecart + 1 Chest
- Hopper Minecart: 1 Minecart + 1 Hopper
- TNT Minecart: 1 Minecart + 1 TNT
- Rails: 6 Iron Ingots + 1 Stick → 16 Rails
- Powered Rail: 6 Gold Ingots + 1 Stick + 1 Redstone → 6 Powered Rails
- Detector Rail: 6 Iron Ingots + 1 Stone Pressure Plate + 1 Redstone → 6 Detector Rails
- Activator Rail: 6 Iron Ingots + 2 Sticks + 1 Redstone Torch → 6 Activator Rails
- Boat: 5 Planks (U-shape, any wood type) → 1 Boat
- Boat with Chest: 1 Boat + 1 Chest
- Saddle: found in dungeons, villages, temples — NOT craftable
- Horse Armor: found in loot chests — NOT craftable

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FOOD — CRAFTING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Bread: 3 Wheat in a row → 1 Bread
- Cookie: 2 Wheat + 1 Cocoa Beans (shapeless) → 8 Cookies
- Cake: 3 Milk Buckets + 2 Sugar + 1 Egg + 3 Wheat → 1 Cake
- Pumpkin Pie: 1 Pumpkin + 1 Sugar + 1 Egg (shapeless) → 1 Pie
- Mushroom Stew: 1 Brown Mushroom + 1 Red Mushroom + 1 Bowl (shapeless)
- Rabbit Stew: 1 Baked Potato + 1 Cooked Rabbit + 1 Carrot + 1 Mushroom + 1 Bowl
- Suspicious Stew: 1 Brown+Red Mushroom + 1 Flower + 1 Bowl → effect depends on flower
- Golden Apple: 8 Gold Ingots + 1 Apple → gives Absorption + Regeneration
- Enchanted Golden Apple: 8 Gold Blocks + 1 Apple (notch apple) → powerful buffs — very rare
- Honey Bottle: use Glass Bottle on Beehive/Bee Nest (needs smoke)
- Glistering Melon Slice: 8 Gold Nuggets + 1 Melon Slice → for potions
- Golden Carrot: 8 Gold Nuggets + 1 Carrot → night vision potion base + best saturation food
- Sugar: 1 Sugar Cane → 1 Sugar

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
COMBAT ITEMS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Bow: 3 Sticks + 3 String (diagonal pattern)
- Arrow: 1 Flint + 1 Stick + 1 Feather → 4 Arrows
- Tipped Arrow: 8 Arrows + 1 Potion (shapeless) → 8 Tipped Arrows
- Spectral Arrow: 8 Arrows + 4 Glowstone Dust → 2 Spectral Arrows
- Crossbow: 3 Sticks + 2 String + 1 Iron Ingot + 1 Tripwire Hook
- Shield: 6 Planks + 1 Iron Ingot (Y-shape)
- Trident: found only as rare drop from Drowned — NOT craftable
- End Crystal: 7 Glass + 1 Eye of Ender + 1 Ghast Tear

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REDSTONE COMPONENTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Redstone Torch: 1 Redstone Dust + 1 Stick
- Lever: 1 Stick + 1 Cobblestone
- Button: 1 Stone or 1 Plank (shapeless) → 1 Button
- Pressure Plate: 2 matching material in a row (stone/wood/gold/iron/weighted)
- Tripwire Hook: 1 Iron Ingot + 1 Stick + 1 Plank
- Repeater: 3 Stone + 2 Redstone Torches + 1 Redstone Dust
- Comparator: 3 Stone + 3 Redstone Torches + 1 Nether Quartz
- Daylight Sensor: 3 Glass + 3 Quartz + 3 Wooden Slabs
- Target Block: 4 Redstone Dust + 1 Hay Bale (shapeless)
- Redstone Lamp: 4 Redstone Dust + 1 Glowstone Block
- Powered Minecart (Furnace Minecart): 1 Minecart + 1 Furnace

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MATERIALS & MISCELLANEOUS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Plank: 1 Log → 4 Planks (any wood type)
- Stick: 2 Planks (vertical) → 4 Sticks
- Book: 3 Paper + 1 Leather
- Paper: 3 Sugar Cane in a row → 3 Paper
- Map: 8 Paper + 1 Compass
- Filled Map: 1 Empty Map (right-click to use)
- Glass: smelt 1 Sand or Red Sand → 1 Glass
- Glass Pane: 6 Glass (2x3) → 16 Glass Panes
- Glass Bottle: 3 Glass (V-shape) → 3 Bottles
- Bowl: 3 Planks (V-shape) → 4 Bowls
- Bucket: 3 Iron Ingots (V-shape) → 1 Bucket
- Water Bucket: right-click water source with Bucket
- Lava Bucket: right-click lava source with Bucket
- Milk Bucket: right-click Cow/Mooshroom with Bucket
- Powder Snow Bucket: right-click Powder Snow with Bucket
- Name Tag: found in loot — NOT craftable; rename at Anvil to name mobs
- Lead: 4 String + 1 Slimeball → 2 Leads
- Clock: 4 Gold Ingots + 1 Redstone Dust (compass pattern)
- Compass: 4 Iron Ingots + 1 Redstone Dust
- Recovery Compass: 8 Echo Shards + 1 Compass → points to death location
- Bundle: 6 Rabbit Hide + 2 String
- Saddle: loot only
- Flint: chance drop from gravel (better with Fortune pickaxe)
- Blaze Powder: 1 Blaze Rod → 2 Blaze Powder
- Eye of Ender: 1 Blaze Powder + 1 Ender Pearl (shapeless)
- Ender Pearl: dropped by Enderman (~50% chance)
- Nether Star: dropped by Wither boss
- Dragon Egg: dropped by Ender Dragon (first kill only)
- Elytra: found in End City ship chest only
- Totem of Undying: dropped by Evoker (raids/woodland mansions)
- Trident: dropped by Drowned (~8% chance)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WOOL & DYE ITEMS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- 16 colors: White, Orange, Magenta, Light Blue, Yellow, Lime, Pink, Gray, Light Gray, Cyan, Purple, Blue, Brown, Green, Red, Black
- Dye sources: Flowers, Cactus (green), Lapis Lazuli (blue), Ink Sac (black), Bone Meal (white), Cocoa Beans (brown)
- Dye + Wool/Bed/Glass/Terracotta/Carpet/Candle/Shulker Box = colored version
- Bed: 3 Wool + 3 Planks → 1 Bed
- Wool: shear Sheep (or kill, but shearing is renewable) | string crafting: 4 String → 1 Wool

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STONE TYPES & STONECUTTER RECIPES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Stone types: Stone, Cobblestone, Granite, Diorite, Andesite, Deepslate, Blackstone, Basalt, Calcite, Tuff, Dripstone
Brick types: Bricks, Stone Bricks, Nether Bricks, End Stone Bricks, Prismarine Bricks, Quartz, Purpur
Each → Stairs, Slabs, Walls, Chiseled versions via Stonecutter or Crafting Table

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SMELTING (FURNACE)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Fuels (burn time): Wood Plank (15s), Coal (80s), Charcoal (80s), Lava Bucket (1000s!), Blaze Rod (120s), Dried Kelp Block (200s), Coal Block (800s)

ORES → INGOTS:
- Raw Iron → Iron Ingot | Raw Gold → Gold Ingot | Raw Copper → Copper Ingot
- Nether Gold Ore → Gold Nuggets | Ancient Debris → Netherite Scrap (need 4 scrap + 4 gold ingots → Netherite Ingot)

OTHER SMELTING:
- Sand / Red Sand → Glass | Clay Ball → Brick | Clay Block → Terracotta
- Stone → Smooth Stone | Sandstone → Smooth Sandstone | Quartz Block → Smooth Quartz
- Cobblestone → Stone | Stone → Smooth Stone | Netherrack → Nether Brick
- Cactus → Green Dye | Sea Pickle → Lime Dye | Kelp → Dried Kelp
- Log → Charcoal | Meat (raw) → Cooked versions | Fish → Cooked fish | Potato → Baked Potato

BLAST FURNACE: 2x faster, ores/ingots/armor only
SMOKER: 2x faster, food only

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BREWING (BREWING STAND)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Fuel: Blaze Powder (must add to brewing stand first!)

STEP 1 — Base Potions:
- Water Bottle + Nether Wart → Awkward Potion (base for almost everything)
- Water Bottle + Fermented Spider Eye → Potion of Weakness (only non-awkward base)

STEP 2 — Add ingredient to Awkward Potion:
- Glistering Melon Slice → Healing (restores HP instantly)
- Sugar → Swiftness (faster movement)
- Rabbit's Foot → Leaping (higher jumps)
- Magma Cream → Fire Resistance (immune to fire & lava)
- Blaze Powder → Strength (more melee damage)
- Golden Carrot → Night Vision (see in dark)
- Pufferfish → Water Breathing (breathe underwater)
- Ghast Tear → Regeneration (heals over time)
- Phantom Membrane → Slow Falling
- Turtle Shell → Potion of the Turtle Master (slowness + resistance)
- Spider Eye → Poison (damages over time)
- Fermented Spider Eye on existing potions → Weakness / Harming / Blindness / etc.

STEP 3 — Modifiers:
- Redstone Dust → extends duration (8 min instead of 3)
- Glowstone Dust → increases effect level (II instead of I) — cannot combine with Redstone
- Gunpowder → converts to Splash Potion (thrown)
- Dragon's Breath → converts Splash to Lingering (cloud on ground)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ENCHANTING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Enchanting Table: needs Lapis Lazuli + XP levels
- Max level 30 requires 15 Bookshelves placed 1 block away from table with air between

WEAPON ENCHANTMENTS:
- Sharpness I-V: +1.25 dmg per level (swords, axes)
- Smite I-V: +2.5 dmg vs undead (zombies, skeletons, phantoms, withers)
- Bane of Arthropods I-V: +2.5 dmg vs spiders, cave spiders, bees, silverfish, endermites
- Fire Aspect I-II: sets target on fire
- Knockback I-II: pushes enemies back further
- Looting I-III: better mob drops
- Sweeping Edge I-III: MORE damage to sweep attack (Java only)
- Sharpness, Smite, and Bane are mutually exclusive

BOW ENCHANTMENTS:
- Power I-V: +25% damage per level
- Punch I-II: extra knockback
- Flame: sets arrow targets on fire
- Infinity: never consume arrows (need at least 1 arrow in inventory)
- Mending: repairs with XP orbs (INCOMPATIBLE with Infinity)

ARMOR ENCHANTMENTS:
- Protection I-IV: reduces all damage (max 4 pieces = 20 protection points)
- Fire Protection I-IV: reduces fire damage + burn time
- Blast Protection I-IV: reduces explosion damage
- Projectile Protection I-IV: reduces arrow/bullet damage
- Thorns I-III: reflects damage back to attacker (at cost to armor durability)
- Feather Falling I-IV: reduces fall damage (boots only)
- Depth Strider I-III: faster in water (boots only)
- Frost Walker I-II: turns water to ice beneath you (boots only, incompatible with Depth Strider)
- Respiration I-III: extended breath underwater (helmet)
- Aqua Affinity: mine at full speed underwater (helmet)
- Soul Speed I-III: faster on soul sand/soil (boots)
- Swift Sneak I-III: faster while sneaking (leggings)

TOOL ENCHANTMENTS:
- Efficiency I-V: +30% mining speed per level
- Silk Touch: mine blocks as themselves (no drops conversion) — mutually exclusive with Fortune
- Fortune I-III: more drops (ore, crops, gravel). Fortune III = 4x diamonds on average
- Unbreaking I-III: ~50%/33%/25% chance item loses durability each use
- Mending: repairs item using XP orbs picked up

CROSSBOW ENCHANTMENTS:
- Quick Charge I-III: faster reload
- Multishot: fires 3 arrows (uses 1 arrow, damages all 3)
- Piercing I-IV: arrows pass through enemies
(Multishot and Piercing are mutually exclusive)

ALL EQUIPMENT:
- Curse of Binding: cannot be removed (except death or breaking)
- Curse of Vanishing: item disappears on death

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ORE LOCATIONS (JAVA 1.18+)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Y = block height. Sea level = Y 62. Bedrock at Y -64.

Coal:        Y -1 to 256 | Best: Y 96 | Fuel, torches
Copper:      Y -16 to 112 | Best: Y 48 | Spyglass, lightning rod, brush, copper blocks
Iron:        Y -64 to 72 | Best: Y 16 | Most important! Tools, armor, rails, hoppers
Gold:        Y -64 to 32 | Best: Y -16 | Clocks, powered rails, golden food, Nether trading
              Also: Badlands biome has gold from Y 32 to 256 (surface accessible!)
Lapis:       Y -64 to 64 | Best: Y 0 | Needed for enchanting (Lapis Lazuli)
Redstone:    Y -64 to 16 | Best: Y -59 | Circuits, potions, clocks, compasses
Diamond:     Y -64 to 16 | Best: Y -59 | Best tools/armor, enchanting table
Emerald:     Mountains biome (windswept hills) only | Y -16 to 256 | Trade with villagers
Ancient Debris: Nether Y 8 to 22 | Best: Y 15 | Extremely rare — need 4 debris for 1 Netherite Ingot

MINING TIPS:
- Strip mining at Y -59 maximizes diamond yield
- Branch mine every 2 blocks to cover all ore veins
- Use Fortune III pickaxe for diamonds = 4x average yield
- Silk Touch mine coal/iron/gold ORE blocks for Fortune later
- Light up caves while mining to prevent mob spawns

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BIOMES & WHERE TO FIND THINGS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OVERWORLD BIOMES:
- Plains: flat, great for building, horses/donkeys spawn, villages common
- Forest: Oak/Birch/Dark Oak, wolves, mushrooms
- Jungle: Bamboo, ocelots, parrots, temple loot
- Desert: sand dunes, temples with loot, cacti, dead bushes, villages
- Savanna: acacia trees, horses, village variants
- Taiga: spruce, wolves, sweet berries, villages with unique trades
- Snowy Tundra: rabbits, polar bears, igloos
- Mountains/Windswept: emerald ore, llamas, goats
- Swamp: slimes at night, witch huts, lily pads, fossils
- Mushroom Island: mooshrooms, no hostile spawns!
- Badlands: red sand, cacti, terracotta, extra gold ore near surface
- Ocean: dolphins, fish, guardians near ocean monuments
- Deep Ocean: elder guardians in monuments, sponges
- Caves: bat, cave spiders in mineshafts, silverfish in strongholds
- Deep Dark (underground): sculk, ancient cities, Warden
- Lush Caves: azalea trees, axolotls, glow berries, dripleaf

NETHER BIOMES:
- Nether Wastes: ghasts, zombie piglins, gravel, netherrack
- Crimson Forest: crimson trees, piglins, hoglins (hostile), striders
- Warped Forest: warped trees, endermen, no piglins, safest Nether biome
- Soul Sand Valley: soul sand, soul soil, skeletons, ghasts, bastion remnants
- Basalt Deltas: magma cubes, blackstone, basalt

END BIOMES:
- The End (main island): Ender Dragon, End Stone, obsidian pillars with crystals
- End Highlands: End Cities, End Ships (Elytra!), Shulkers, chorus fruit
- End Midlands, End Barrens, Small End Islands: outer islands exploration

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STRUCTURES & THEIR LOOT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Village: food, emeralds, armor, weapons, bells, beds (trade with villagers!)
- Dungeon (monster spawner underground): saddle, music disc, gold, iron, enchanted book
- Desert/Jungle Temple: TNT trap!, diamonds, gold, emeralds, bones
- Pillager Outpost: crossbows, iron, ominous banner → start raids if you kill captain
- Woodland Mansion: Totem of Undying from Evoker, diamond loot
- Ocean Monument: Elder Guardian (inflicts Mining Fatigue), sponges, golden apple, prismarine
- Stronghold: End Portal, library books, ores, food
- Bastion Remnant: Piglin Brute, netherite upgrade template, gold blocks, netherite
- Nether Fortress: Blaze spawners (Blaze Rod), Wither Skeleton (skulls), nether wart
- End City: Shulkers (shulker shells), Elytra in ship, diamond/iron loot
- Ancient City (Deep Dark): echo shards, swift sneak books, disc fragments, great builds
- Mineshaft: cave spider spawner, rails, name tags, gold/iron, enchanted books
- Ruined Portal: obsidian, gold, fire resistance potions, golden tools
- Buried Treasure: Heart of the Sea (conduit), diamonds, iron, food, TNT
- Shipwreck: emeralds, food, treasure maps for buried treasure
- Igloo (secret basement): zombie villager + golden apple → cure for good trades!
- Witch Hut: cauldron, crafting table, bookshelf
- Trial Chamber (1.21+): breeze mobs, trial keys, vaults with loot including mace and wind charge

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MOBS — COMPLETE LIST
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PASSIVE MOBS (never attack):
- Bat: caves, useless, hangs upside down
- Cat: tames with raw fish, scares Creepers/Phantoms, drops music disc on death
- Chicken: eggs (every 5-10 min), feathers, raw chicken
- Cod: ocean
- Cow: leather, raw beef, milk with bucket
- Donkey: ride, put Chest on for storage (cannot breed Chest onto Mule)
- Fox: drops rabbit foot, berries; picks up items; tame kit born from 2 tamed foxes
- Frog: 3 variants (warm/cold/temperate biomes), eats small slimes/magma cubes → Froglight
- Glow Squid: deep dark water, drops Glow Ink Sac (glowing text in signs, frames)
- Horse: ride (saddle + tame by repeatedly mounting), breed with Golden Apple/Carrot
- Mooshroom: mushroom island only, gives mushroom stew and milk
- Mule: hybrid of Horse+Donkey, carry chest, cannot breed
- Ocelot: jungle, not tameable (only trust with fish), scares Creepers
- Panda: jungle, rare bamboo-eating bear, different personalities
- Parrot: jungle, tame with seeds, mimics mob sounds
- Pig: pork chops, ride with carrot-on-stick + saddle
- Polar Bear: snowy biomes, aggressive near cubs (neutral otherwise)
- Pufferfish: ocean, used for Water Breathing potion (do NOT eat raw)
- Rabbit: drops rabbit hide, raw rabbit, rabbit foot
- Salmon: river/ocean
- Sheep: wool (shear for renewable supply), raw mutton, rare colored naturally
- Sniffer (1.20+): extinct mob revived from egg, sniffs out ancient seeds
- Squid: drops ink sac
- Strider: Nether, ride on lava with saddle + Warped Fungus on Stick
- Tropical Fish: ocean
- Turtle: beach, drops scutes when maturing (craft Turtle Shell helmet)
- Villager: trade emeralds for goods — curing zombie villager gives huge discounts!

NEUTRAL MOBS (attack only if provoked):
- Bee: stings once then dies, pollinates crops, makes honey, place hive near farms
- Cave Spider: mineshafts, smaller than spider, VENOMOUS
- Dolphin: ocean, leads to treasure/shipwreck, gives dolphin's grace buff when following
- Enderman: 3 blocks tall, picks up/places blocks, teleports if attacked or rain, hates water/eye contact
- Goat: mountains, rams into players/mobs, drops Goat Horn (1.19+)
- Iron Golem: villages, attacks hostile mobs, drops iron + roses — can be built manually
- Llama: mountains, spits when attacked, attach carpet for appearance, Chest for storage
- Piglin: Nether Crimson Forest, attacks without gold, drops gold/arrows, barters with gold ingots
- Piglin Brute: Bastion Remnant guard, always hostile, drops golden axe
- Spider: 1.5x1 block, climbs walls, drops string + spider eye, cannot see when sunlit
- Wolf: tamanho with Bones → loyal dog, attacks skeletons, sheep, foxes

HOSTILE MOBS (always attack players on sight or proximity):
- Blaze: Nether Fortress only, shoots 3 fireballs, drops Blaze Rod (for brewing)
- Bogged (1.21+): slow-shooting skeleton in mangrove/swamp, shoots poison arrows
- Breeze (1.21+): Trial Chamber, shoots wind charges, opens trap doors/doors
- Chicken Jockey: rare baby zombie riding chicken
- Creeper: SILENT! Walks up and explodes (1.5s fuse), drops gunpowder + music disc if killed by skeleton arrow
- Drowned: underwater zombie, can hold trident (~8% spawn with trident), drops copper ingot, rotten flesh
- Elder Guardian: in Ocean Monument, inflicts Mining Fatigue III, drops sponge + prismarine
- Endermite: rare spawn when throwing ender pearl (5%), attacks player and endermen
- Evoker: Woodland Mansion, summons Vexes + fang attacks, drops Totem of Undying
- Ghast: Nether, 4x4 mob, shoots explosive fireballs (deflect with any attack back at it)
- Guardian: Ocean Monument, shoots laser beam, drops prismarine/fish
- Hoglin: Crimson Forest, attacks on sight, drops raw porkchop; repelled by Warped Fungus/Nether Portal/Respawn Anchor
- Husk: desert Zombie variant, no burning in sunlight, inflicts Hunger
- Magma Cube: Nether, splits into smaller pieces, drops magma cream
- Phantom: spawns if player hasn't slept for 3+ in-game nights, attacks airborne, drops Phantom Membrane
- Pillager: crossbow-wielding, attacks villages, drops crossbow + arrows
- Ravager: large beast with pillager raids, destroys crops + leaves, drops Saddle
- Shulker: End City, shoots homing projectiles, inflicts Levitation, drops Shulker Shell
- Silverfish: inside monster eggs in mountains/stronghold, call for help when attacked
- Skeleton: bow and arrows, burns in sunlight, drops bones + arrows
- Skeleton Horseman: rare lightning strike event, 4 skeleton horsemen
- Slime: underground Y<40 and swamp biome full moon, drops Slimeball (for sticky piston + leads)
- Spider Jockey: rare spider carrying skeleton
- Stray: cold biome Skeleton, shoots Slowness tipped arrows
- Vex: summoned by Evoker, small flying hostile, drops iron sword sometimes
- Vindicator: Woodland Mansion + raids, carries axe, "Johnny" AI kills everything
- Witch: swamp/raiding, throws potions (Poison, Weakness, Slowness), drops brewing items
- Wither Skeleton: Nether Fortress, melee attack inflicts Wither, drops Wither Skeleton Skull (rare)
- Zoglin: Hoglin taken to Overworld/End becomes Zoglin, always hostile
- Zombie: most common, drops rotten flesh, rare iron/carrot/potato; arms waving at night
- Zombie Villager: cured with Golden Apple + Splash Weakness Potion → becomes villager with great discounts
- Zombified Piglin: Nether + from Pig struck by lightning, neutral until attacked then calls all nearby

BOSSES:
- Ender Dragon: End, ~200 HP, circle with crystals on obsidian pillars that heal it. Destroy crystals first. Bow from ground or sword on pillars. Drops 12,000 XP + Dragon Egg + activates End portal/gateways
- Wither: built with 4 Soul Sand (T-shape) + 3 Wither Skeleton Skulls on top. ~300 HP. Shoots explosive skulls. Drops Nether Star → Beacon
- Elder Guardian: technically a miniboss, inside Ocean Monument, drops sponge + mining fatigue aura

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DIMENSIONS & PROGRESSION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OVERWORLD (start here):
Y range: -64 (bedrock) to 320 (build limit). Sea level: Y 62.
Day cycle: 10 min day + 10 min night (20 min total)
Hostile mobs spawn in dark (light level < 0 in 1.18+)

NETHER (enter via Obsidian portal, 4x5 min frame, ignite with Flint & Steel):
- 1 block Nether = 8 blocks Overworld (use for fast travel!)
- Bring: fire resistance potions, gold armor to avoid Piglin attacks, food, bed (DON'T sleep in Nether — it EXPLODES!)
- Get here: Blaze Rods (brewing stand fuel + potions), Nether Wart (potion base), Netherite, Quartz
- Nether Fortress for Blazes and Wither Skeleton Skulls
- Bastion Remnant for Netherite + gold loot

THE END (find via Stronghold → End Portal):
- Find Stronghold with Eyes of Ender (craft: Blaze Powder + Ender Pearl)
- Throw Eye, it travels toward stronghold; use ~12 Eyes to fully activate portal
- End Boss: Ender Dragon — defeat to unlock End Gateways and access to outer islands
- End City + End Ship = Elytra (wings), Shulker Shells, diamond loot

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SURVIVAL PROGRESSION ROADMAP
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Day 1:
1. Punch trees → get Oak Logs → make Planks → make Crafting Table
2. Craft: Sticks, Wooden Pickaxe, Wooden Axe, Wooden Sword
3. Mine 15+ Cobblestone → craft Stone tools
4. Find/mine coal → craft Torches
5. Build basic shelter before dark (any 5x5x3 room with door)
6. Place Furnace + Crafting Table in shelter

Day 2-5:
7. Mine Iron at Y 16 → smelt Iron Ingots → craft Iron tools + armor
8. Find food source (farm wheat/carrots, breed animals)
9. Explore for loot structures (villages, dungeons)
10. Build better base

Week 1:
11. Mine Diamond at Y -59 → craft Diamond Pickaxe + gear
12. Get Obsidian (water on lava) → go to Nether
13. Get Blaze Rods + Nether Wart + Ender Pearls
14. Find Stronghold, enter The End, defeat Ender Dragon
15. Return, get Elytra from End City, start on Netherite

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BUILDING TIPS & COMMON BUILDS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BASIC SHELTER: 7x7 cobblestone with door + torch + crafting table + furnace + chest + bed
STARTER FARM: Till ground (hoe), place water source in center, plant wheat/carrots/potatoes
ANIMAL FARM: Enclose animals with fences, breed with food (wheat=cow/sheep, carrot=pig, fish=cat)
MOB FARM: Dark room with spawner or large enclosed dark area, water channels to kill zone
AUTOMATIC FARMS: Observer + piston + chest-hopper system for crops/sugarcane
XP FARM: Zombie/skeleton spawner + water channel + kill mechanism (half-slab height)
IRON FARM: 20 villagers in beds near zombie = Iron Golem spawns automatically
TREE FARM: 2x2 jungle trees or 1x1 any wood type, plant saplings densely

BUILDING MATERIALS (aesthetics):
Stone palette: Cobblestone, Stone Bricks, Smooth Stone, Cracked Stone Bricks, Mossy Stone Bricks, Andesite, Granite, Diorite, Polished versions
Wood palette: Logs, Planks, Stripped Logs, Slabs, Stairs, Fences, Trapdoors (each wood type)
Glass: Glass, Tinted Glass (4 Amethyst Shards + 1 Glass), Stained Glass
Details: Carpet, Banners, Lanterns, Item Frames, Armor Stands, Flower Pots, Candles

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FARMING & FOOD SOURCES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BEST FOODS BY SATURATION:
1. Suspicious Stew (with Dandelion): 13 hunger + 7.2 saturation — best early!
2. Cooked Porkchop / Cooked Beef: 8 hunger + 12.8 saturation
3. Cooked Mutton: 6 hunger + 9.6 saturation  
4. Cooked Salmon: 6 hunger + 9.6 saturation
5. Rabbit Stew: 10 hunger + 12 saturation
6. Golden Carrot: 6 hunger + 14.4 saturation — HIGHEST saturation!
7. Bread: 5 hunger + 6 saturation

CROP FARMING:
- Wheat: seeds from breaking grass, farmland + water
- Carrots: plant whole carrot, farmland + water
- Potatoes: plant whole potato (bake in furnace for food)
- Beetroot: seeds from chests or beetroot, weakest food crop
- Melon: grows sideways, infinite if you break and not the stem
- Pumpkin: grows sideways, use for golems or jack-o-lanterns
- Sugarcane: near water, up to 3 blocks tall, replants from 1 block
- Bamboo: jungle or from pandas, grows tall, fuel or scaffolding
- Cocoa Beans: on jungle log, 3 stages, drops 2-3 beans

ANIMAL BREEDING:
- Cow: Wheat | drops: leather + raw beef
- Pig: Carrot/Potato/Beetroot | drops: raw porkchop
- Sheep: Wheat | drops: wool + raw mutton
- Chicken: Seeds | drops: egg + feather + raw chicken (egg also hatches chicken!)
- Rabbit: Dandelion/Carrot/Golden Carrot | drops: rabbit hide + raw rabbit + (rare) rabbit foot
- Horse/Donkey: Golden Apple/Golden Carrot
- Wolf: Any meat | tame with Bone first
- Cat/Ocelot: Raw fish

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REDSTONE — COMMON CIRCUITS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NOT Gate: Redstone Torch behind block (output on opposite side)
AND Gate: 2 levers → 2 Redstone into Comparator
Clock: Repeater loop (min 3 repeaters) or Observer facing itself off/on
T Flip-Flop: keeps state (toggle with pulse)
RS Latch: Set/Reset memory
Item Filter: Hopper pointing into Comparator → detect specific items

PRACTICAL REDSTONE:
- Hidden door: piston + sticky piston sequence
- Auto farm: Observer watches crop → piston harvests → hopper collects
- Storage sorter: multiple hoppers each with 4 of same item + 1 named item
- Day detector: Daylight Sensor → activate/deactivate lights
- Train station: Powered/Detector Rail + lever/pressure plate

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TIPS & TRICKS (ADVANCED)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Water Bucket cancel fall damage: place water right before landing
- Lava bucket: best early-game fuel (1000 seconds!) and emergency weapon
- Milk Bucket: removes ALL potion effects (good and bad)
- Gravel trick: Gravel + torch = faster gravel removal + flint farming
- Enderman: don't look at eyes OR wear Pumpkin helmet (they won't attack)
- Creeper: Shield blocks explosion; or lure skeleton to shoot creeper → music disc
- Anvil: cost = prior work + enchantment level; avoid "Too Expensive!" by minimizing anvil uses
- F3 screen: shows coordinates, direction, biome, light level, TPS, etc.
- Name Tag mob "Dinnerbone" or "Grumm": flips mob upside down
- Curing zombie villager: Splash Weakness + Golden Apple → gives best trade prices (1 emerald)
- Boat on ice: fastest non-elytra travel (put boat on Blue Ice = insanely fast)
- Silk Touch + Fortune: cannot have both (mutually exclusive)
- Never dig straight down: lava, cave drops, falling gravel
- Always carry: food, torches, extra pickaxe, water bucket (for emergencies)

=== END OF KNOWLEDGE BASE ===
`;

module.exports = { MINECRAFT_KNOWLEDGE };
