const { OpenAI } = require('openai');

// How often the bot autonomously decides its next action (ms)
const AUTO_LOOP_INTERVAL_MS = 45_000; // 45 seconds

class AIAgent {
  constructor(botManager, botId, username) {
    this.botManager = botManager;
    this.botId = botId;
    this.username = username;

    // Conversation memory (learning from interactions)
    this.conversationHistory = [];
    this.MAX_HISTORY = 60; // keep last 60 exchanges

    // Autonomous gameplay experience log (self-learning)
    this.experienceLog = [];
    this.MAX_EXPERIENCE = 30; // keep last 30 autonomous actions + results

    // Autonomous loop handle
    this._autoLoopTimer = null;
    this._isThinking = false; // prevent overlapping AI calls

    this.openai = new OpenAI({
      baseURL: 'https://integrate.api.nvidia.com/v1',
      apiKey: process.env.NVIDIA_API_KEY || '',
    });

    this.model = 'z-ai/glm-5.2';

    // Tools available to the AI
    this.tools = [
      {
        type: 'function',
        function: {
          name: 'goto',
          description: 'Move the bot to specific x, y, z coordinates.',
          parameters: {
            type: 'object',
            properties: {
              x: { type: 'number' },
              y: { type: 'number' },
              z: { type: 'number' }
            },
            required: ['x', 'y', 'z']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'follow',
          description: 'Follow a specific player.',
          parameters: {
            type: 'object',
            properties: {
              target: { type: 'string', description: 'Player name to follow' }
            },
            required: ['target']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'mine',
          description: 'Mine a block at specific x, y, z coordinates.',
          parameters: {
            type: 'object',
            properties: {
              x: { type: 'number' },
              y: { type: 'number' },
              z: { type: 'number' }
            },
            required: ['x', 'y', 'z']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'stop',
          description: 'Stop the current action.',
          parameters: { type: 'object', properties: {}, required: [] }
        }
      },
      {
        type: 'function',
        function: {
          name: 'attack',
          description: 'Attack a specific entity or "hostile" to attack nearest hostile mob.',
          parameters: {
            type: 'object',
            properties: {
              target: { type: 'string', description: 'Entity name or "hostile"' }
            },
            required: ['target']
          }
        }
      }
    ];
  }

  // ─── Game state reader ─────────────────────────────────────────────────────

  /**
   * Read current live game state from the mineflayer bot.
   * This is what gives the AI "eyes" into the Minecraft world.
   */
  _readGameState(bot) {
    const pos = bot.entity?.position;
    const inv = bot.inventory?.items() ?? [];

    // Summarise inventory (top 10 items)
    const invSummary = inv.slice(0, 10)
      .map(i => `${i.name}x${i.count}`)
      .join(', ') || 'empty';

    // Nearby players (excluding self)
    const nearbyPlayers = Object.values(bot.players || {})
      .filter(p => p.username !== bot.username)
      .map(p => p.username);

    // Held item
    const held = bot.heldItem ? `${bot.heldItem.name}x${bot.heldItem.count}` : 'nothing';

    return {
      posStr: pos ? `X:${Math.floor(pos.x)} Y:${Math.floor(pos.y)} Z:${Math.floor(pos.z)}` : 'unknown',
      health: bot.health ?? '?',
      food: bot.food ?? '?',
      dimension: bot.game?.dimension ?? 'overworld',
      heldItem: held,
      invSummary,
      nearbyPlayers: nearbyPlayers.length ? nearbyPlayers.join(', ') : 'none',
    };
  }

  // ─── System prompt ─────────────────────────────────────────────────────────

  _buildSystemPrompt(context = 'chat', senderName = null) {
    const baseIdentity = `You are MineFleetBot5, an autonomous AI Minecraft Java Edition bot with the ability to learn, remember, and play the game by yourself.
${context === 'autonomous'
  ? 'You are currently in AUTONOMOUS MODE — no player has given you an order. You must decide what to do next on your own to survive and thrive in Minecraft.'
  : `A player named ${senderName} is talking to you right now.`}

You remember everything from past actions and conversations. You learn by doing — you try actions, observe what happens, and use that knowledge for future decisions.

=== COMPLETE MINECRAFT JAVA EDITION KNOWLEDGE ===

SURVIVAL PRIORITIES (in order):
1. Stay alive: health > 10 (5 hearts), food > 6
2. Gather basic resources: wood → planks → crafting table → sticks → tools
3. Get shelter before night (Creepers, Zombies, Skeletons spawn in dark)
4. Progress: stone tools → iron tools → diamond tools → netherite
5. Explore: caves for ores, structures for loot, Nether for blaze rods, End for Ender Dragon

CRAFTING RECIPES (key ones):
- Crafting Table: 4 any Wooden Planks
- Sticks: 2 Planks stacked vertically = 4 sticks
- Wooden Pickaxe: 3 Planks on top row + 2 Sticks middle column
- Wooden Sword/Axe/Shovel/Hoe: same pattern with Planks
- Stone/Iron/Gold/Diamond tools: same pattern, different material
- Furnace: 8 Cobblestones (outer ring, hollow center)
- Chest: 8 Planks (outer ring, hollow center)
- Torch: 1 Coal + 1 Stick = 4 Torches
- Bed: 3 Wool (same color) on top + 3 Planks on bottom
- Bow: 3 Sticks + 3 String
- Shield: 6 Planks + 1 Iron Ingot
- Enchanting Table: 4 Obsidian + 2 Diamonds + 1 Book
- Anvil: 3 Iron Blocks + 4 Iron Ingots
- Netherite upgrade: Diamond item + Netherite Ingot in Smithing Table

ORE DEPTHS (Java 1.18+, best Y levels):
- Coal: Y 96 (also surface), used as fuel
- Copper: Y 48, makes spyglass, lightning rod, brush
- Iron: Y 16, most important early game
- Gold: Y -16, Badlands biome = more gold near surface
- Lapis: Y 0, needed for enchanting
- Redstone: Y -59, circuits + potions
- Diamond: Y -59 (rare! bring iron pickaxe at minimum)
- Emerald: Mountains only, Y 256–16, trade with villagers
- Ancient Debris: Nether Y 15, explode-proof, make Netherite

MOBS:
Passive: Cow (leather, beef), Pig (pork), Sheep (wool, mutton), Chicken (feathers, eggs, raw chicken), Rabbit, Horse/Donkey/Mule (ride), Squid (ink sac), Turtle (scutes→helmet), Axolotl (fights underwater mobs), Fox, Parrot
Neutral: Wolf (tame with bones→loyal dog), Bee (honey, pollination), Enderman (pick up blocks, teleports, hates being looked at), Polar Bear (aggressive near cubs), Piglin (wear gold or they attack, trade with gold ingots), Iron Golem (village protector), Llama (spits when attacked)
Hostile (spawn in dark): Zombie (drops rotten flesh, rare iron/carrot/potato), Skeleton (arrows, drops bones + arrows), Creeper (SILENT until close, then EXPLODES, drops gunpowder), Spider (can climb walls, drops string + spider eyes), Witch (throws potions), Blaze (Nether, drops Blaze Rods for brewing), Ghast (Nether, fireball), Drowned (underwater, can drop Trident), Warden (Deep Dark, STRONGEST MOB, avoid or run)
Bosses: Ender Dragon (The End, kills with bow from ground or sword if on pillars), Wither (T-shape Soul Sand/Soil + 3 Wither Skeleton Skulls, drops Nether Star → Beacon)

ENCHANTING:
Table: needs XP levels + Lapis Lazuli. 15 Bookshelves around = max level 30.
Weapons: Sharpness I-V, Smite (vs undead), Fire Aspect, Looting I-III, Sweeping Edge, Unbreaking, Mending
Armor: Protection I-IV, Fire Protection, Blast Protection, Projectile Protection, Feather Falling (boots), Depth Strider/Frost Walker (boots), Respiration/Aqua Affinity (helmet), Thorns, Unbreaking, Mending  
Tools: Efficiency I-V, Silk Touch, Fortune I-III, Unbreaking, Mending
Bow: Power I-V, Punch I-II, Flame, Infinity, Mending

POTIONS (Brewing Stand):
Base: Water Bottle + Nether Wart = Awkward Potion
+ Glistering Melon = Healing | + Sugar = Speed | + Magma Cream = Fire Resistance
+ Rabbit's Foot = Jump Boost | + Blaze Powder = Strength | + Golden Carrot = Night Vision
+ Pufferfish = Water Breathing | + Ghast Tear = Regeneration
Modifiers: Redstone = longer duration | Glowstone = stronger | Gunpowder = splash | Dragon's Breath = lingering

BUILDING MATERIALS (common builds):
- Shelter: Wood planks, Cobblestone, Logs
- Doors: 6 Planks (wood) or 6 Iron Ingots (iron)
- Windows: Glass (smelt sand), Glass Panes
- Lighting: Torches, Lanterns (1 Torch + 8 Iron Nuggets), Glowstone (Nether), Sea Lantern
- Decoration: Stairs, Slabs, Fences, Walls, Trapdoors, Carpets, Banners
- Redstone builds: Auto farms, Doors, Traps, Sorters, Clocks

DIMENSIONS:
Overworld: Y -64 to 320. Sea level Y 62. Caves below Y 0.
Nether: Enter via Obsidian portal (4x5 minimum, flint+steel). 1 block = 8 overworld blocks.
  - Get: Blaze Rods (for brewing), Nether Wart, Quartz, Gold, Magma Cream, Ghast Tears, Soul Sand, Glowstone, Ancient Debris
The End: End Portal in Stronghold (find with Eye of Ender thrown, follow it). Activate 12 frames with Eyes.
  - Kill Ender Dragon to open portal home + End Gateways to outer islands (Elytra, Shulker Boxes, End Cities)

TIPS:
- Water bucket: saves from lava, fall damage, fire
- Milk bucket: removes ALL potion effects
- Name Tag: names a mob so it never despawns (rename at Anvil first)
- Leads: tie passive mobs to fences
- Maps: find Cartographer villager for Explorer Maps to Structures
- Never dig straight down (lava, void, cave drops)
- Sleep in a bed to skip night AND reset spawn point
- Kill Endermen for Ender Pearls (teleport + reach The End)

=== YOUR AUTONOMOUS DECISION PROCESS ===
When in autonomous mode, look at your current state (health, food, inventory, position) and decide the MOST USEFUL next action.
- If health is low: find food, retreat from combat
- If food is low: find animals to hunt, look for crops
- If inventory is empty: chop wood, then craft tools
- If you have tools: mine for ores at the right depth
- If you have iron/diamond: enchant tools, brew potions
- Always report what you are about to do in short clear Minecraft chat

Keep all chat messages under 200 characters.`;

    return baseIdentity;
  }

  // ─── Autonomous game loop ──────────────────────────────────────────────────

  /**
   * Start the self-play loop. Called when the bot goes ONLINE.
   */
  startAutonomousLoop(bot, taskManager) {
    this._bot = bot;
    this._taskManager = taskManager;
    if (this._autoLoopTimer) clearInterval(this._autoLoopTimer);

    this._autoLoopTimer = setInterval(() => {
      this._autonomousTick(bot, taskManager);
    }, AUTO_LOOP_INTERVAL_MS);

    console.log(`[AIAgent][${this.username}] 🤖 Autonomous self-learning loop started (every ${AUTO_LOOP_INTERVAL_MS / 1000}s)`);
  }

  /**
   * Stop the autonomous loop. Called when the bot goes offline.
   */
  stopAutonomousLoop() {
    if (this._autoLoopTimer) {
      clearInterval(this._autoLoopTimer);
      this._autoLoopTimer = null;
    }
  }

  /**
   * One autonomous tick: read game state → ask AI what to do → do it.
   */
  async _autonomousTick(bot, taskManager) {
    if (this._isThinking) return;
    if (!process.env.NVIDIA_API_KEY) return;

    // Only act autonomously when bot is idle (no active task)
    const activeTask = taskManager ? taskManager.getActive() : null;
    if (activeTask) return;

    this._isThinking = true;
    try {
      const state = this._readGameState(bot);

      // Build experience context
      const expContext = this.experienceLog.length > 0
        ? `\nYour recent autonomous actions and results:\n${this.experienceLog.slice(-10).map(e => `- [${e.time}] Did: ${e.action} → Result: ${e.result}`).join('\n')}`
        : '';

      const stateMsg = `AUTONOMOUS TICK - Current game state:
Position: ${state.posStr}
Health: ${state.health}/20 | Food: ${state.food}/20
Dimension: ${state.dimension}
Holding: ${state.heldItem}
Inventory: ${state.invSummary}
Nearby players: ${state.nearbyPlayers}
${expContext}

Based on this state and your Minecraft knowledge, decide the SINGLE BEST next action to survive and progress. Use a tool to act, and explain what you're doing in 1 short sentence.`;

      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: this._buildSystemPrompt('autonomous') },
          ...this.experienceLog.slice(-5).map(e => ({ role: 'assistant', content: `I did: ${e.action}` })),
          { role: 'user', content: stateMsg }
        ],
        tools: this.tools,
        tool_choice: 'auto',
        max_tokens: 200,
      });

      const msg = response.choices[0].message;
      const timestamp = new Date().toLocaleTimeString();

      if (msg.tool_calls && msg.tool_calls.length > 0) {
        for (const toolCall of msg.tool_calls) {
          const fn = toolCall.function.name;
          const args = JSON.parse(toolCall.function.arguments);
          let actionStr = '';

          switch (fn) {
            case 'goto':
            case 'mine':
              actionStr = `!${fn} ${args.x} ${args.y} ${args.z}`;
              break;
            case 'follow':
            case 'attack':
              actionStr = `!${fn} ${args.target}`;
              break;
            case 'stop':
              actionStr = `!stop`;
              break;
          }

          if (actionStr) {
            this.botManager.commandManager.execute(this.username, actionStr, bot);
            const desc = msg.content || `Executed ${fn}`;
            // Log this experience for future learning
            this.experienceLog.push({ time: timestamp, action: `${fn}(${JSON.stringify(args)})`, result: 'dispatched' });
            if (this.experienceLog.length > this.MAX_EXPERIENCE) {
              this.experienceLog = this.experienceLog.slice(-this.MAX_EXPERIENCE);
            }
            if (desc) bot.chat(desc.slice(0, 200));
          }
        }
      } else if (msg.content) {
        // AI decided to just observe (no action) — still log it
        this.experienceLog.push({ time: timestamp, action: 'observe', result: msg.content.slice(0, 100) });
      }

    } catch (err) {
      console.error(`[AIAgent][${this.username}] Autonomous tick error:`, err.message);
    } finally {
      this._isThinking = false;
    }
  }

  // ─── Manual chat handler ───────────────────────────────────────────────────

  /**
   * Respond to a player calling !MineFleetBot5 <message>
   */
  async handleMessage(sender, message, bot) {
    if (!process.env.NVIDIA_API_KEY) {
      bot.chat(`Sorry ${sender}, NVIDIA_API_KEY is not set.`);
      return;
    }

    if (this._isThinking) {
      bot.chat(`${sender}, I'm thinking right now, please wait a moment!`);
      return;
    }

    this._isThinking = true;
    try {
      console.log(`[AIAgent][${this.username}] Chat from ${sender}: "${message}"`);

      // Add to conversation memory
      this.conversationHistory.push({ role: 'user', content: `${sender}: ${message}` });
      if (this.conversationHistory.length > this.MAX_HISTORY) {
        this.conversationHistory = this.conversationHistory.slice(-this.MAX_HISTORY);
      }

      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: this._buildSystemPrompt('chat', sender) },
          ...this.conversationHistory
        ],
        tools: this.tools,
        tool_choice: 'auto',
        max_tokens: 200,
      });

      const responseMessage = response.choices[0].message;

      // Save AI reply to memory
      if (responseMessage.content) {
        this.conversationHistory.push({ role: 'assistant', content: responseMessage.content });
      }

      // Execute tool calls
      if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
        for (const toolCall of responseMessage.tool_calls) {
          const fn = toolCall.function.name;
          const args = JSON.parse(toolCall.function.arguments);
          let synthMsg = '';

          switch (fn) {
            case 'goto':
            case 'mine':
              synthMsg = `!${fn} ${args.x} ${args.y} ${args.z}`;
              break;
            case 'follow':
            case 'attack':
              synthMsg = `!${fn} ${args.target}`;
              break;
            case 'stop':
              synthMsg = `!stop`;
              break;
          }

          if (synthMsg) {
            this.botManager.commandManager.execute(sender, synthMsg, bot);
            // Remember this action in experience log
            this.experienceLog.push({
              time: new Date().toLocaleTimeString(),
              action: `${fn}(${JSON.stringify(args)}) ordered by ${sender}`,
              result: 'dispatched'
            });
            if (this.experienceLog.length > this.MAX_EXPERIENCE) {
              this.experienceLog = this.experienceLog.slice(-this.MAX_EXPERIENCE);
            }
          }
        }
        const reply = responseMessage.content || `On it, ${sender}!`;
        bot.chat(reply.slice(0, 200));
      } else if (responseMessage.content) {
        bot.chat(responseMessage.content.slice(0, 200));
      }

    } catch (error) {
      console.error(`[AIAgent][${this.username}] Error:`, error.message);
      bot.chat(`Error: ${error.message.slice(0, 120)}`);
    } finally {
      this._isThinking = false;
    }
  }
}

module.exports = AIAgent;
