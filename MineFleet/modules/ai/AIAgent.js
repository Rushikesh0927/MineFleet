const { OpenAI } = require('openai');

class AIAgent {
  constructor(botManager, botId, username) {
    this.botManager = botManager;
    this.botId = botId;
    this.username = username;

    // Conversation history — bot "remembers" past messages (self-learning memory)
    this.conversationHistory = [];
    this.MAX_HISTORY = 40; // keep last 40 exchanges in context

    // Initialize OpenAI client pointing to NVIDIA NIM API
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
          description: 'Moves the bot to specific x, y, z coordinates.',
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
          description: 'Follows a specific player.',
          parameters: {
            type: 'object',
            properties: {
              target: { type: 'string', description: 'The name of the player to follow' }
            },
            required: ['target']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'mine',
          description: 'Mines a block at specific coordinates.',
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
          description: 'Stops the current action (e.g. stops moving or following).',
          parameters: { type: 'object', properties: {}, required: [] }
        }
      },
      {
        type: 'function',
        function: {
          name: 'attack',
          description: 'Attacks a specific target entity or type of entity (e.g. "hostile").',
          parameters: {
            type: 'object',
            properties: {
              target: { type: 'string', description: 'The name of the entity or "hostile"' }
            },
            required: ['target']
          }
        }
      }
    ];
  }

  /**
   * Build the comprehensive Minecraft Java Edition system prompt.
   */
  _buildSystemPrompt(sender) {
    return `You are MineFleetBot5, an AI-powered Minecraft Java Edition bot and expert assistant with memory of past conversations.
The player talking to you right now is: ${sender}.
You are live on a Minecraft server and can hear all chat. You remember everything said to you and learn from each interaction.

=== COMPLETE MINECRAFT JAVA EDITION KNOWLEDGE ===

CRAFTING SYSTEM:
- 2x2 inventory grid: basic recipes (sticks, planks, crafting table)
- 3x3 Crafting Table grid: advanced recipes
- Key recipes:
  * Crafting Table = 4 Wooden Planks (any type)
  * Sticks = 2 Planks stacked vertically
  * Wooden Sword/Pick/Axe/Shovel/Hoe = planks + sticks (T-shape)
  * Stone/Iron/Gold/Diamond/Netherite tools = same shape with those materials
  * Furnace = 8 Cobblestones (hollow square)
  * Chest = 8 Planks (hollow square)
  * Bed = 3 Wool (top) + 3 Planks (bottom), color matches wool
  * Torch = 1 Coal/Charcoal + 1 Stick = 4 Torches
  * Iron Armor = Iron Ingots in helmet/chestplate/leggings/boots shape
  * Bow = 3 Sticks + 3 String
  * Arrows = 1 Flint + 1 Stick + 1 Feather = 4 Arrows
  * Bookshelf = 3 Books + 6 Planks
  * Enchanting Table = 1 Book + 2 Diamonds + 4 Obsidian
  * Piston = 3 Planks + 4 Cobblestone + 1 Iron Ingot + 1 Redstone
  * Netherite Upgrade: combine Diamond item + Netherite Ingot in Smithing Table

SMELTING:
- Furnace needs fuel (Coal, Charcoal, Wood, Lava Bucket) and input item
- Iron Ore → Iron Ingot, Gold Ore → Gold Ingot, Sand → Glass, Raw Chicken/Beef/Pork → Cooked food
- Blast Furnace: 2x faster for ores/ingots
- Smoker: 2x faster for food

ORE DISTRIBUTION (Java 1.18+):
- Coal: Y 0–256 (surface), best Y 96
- Copper: Y -16–112, best Y 48
- Iron: Y -64–72, best Y 16
- Gold: Y -64–32, best Y -16 (also common in Badlands biome)
- Lapis Lazuli: Y -64–64, best Y 0
- Redstone: Y -64–16, best Y -59
- Diamond: Y -64–16, best Y -59 (rarest near bedrock layer)
- Emerald: Mountains biome only, Y -16–256
- Ancient Debris (Netherite): Nether Y 8–22, best Y 15

BLOCKS & BIOMES:
- Wood types: Oak, Spruce, Birch, Jungle, Acacia, Dark Oak, Mangrove, Cherry, Pale Oak
- Stone variants: Stone, Cobblestone, Deepslate (Y<0), Blackstone (Nether)
- Overworld biomes: Plains, Forest, Taiga, Jungle, Desert, Savanna, Badlands, Snowy Plains, Swamp, Mushroom Island, Beach, Ocean, River
- Nether biomes: Nether Wastes, Crimson Forest, Warped Forest, Soul Sand Valley, Basalt Deltas
- End: Main island (Ender Dragon), Outer End Islands (End Cities, Elytra, Shulkers)

MOBS:
- Passive: Cow, Pig, Sheep, Chicken, Horse, Donkey, Mule, Llama, Parrot, Ocelot, Bat, Squid, Glow Squid, Turtle, Axolotl, Tropical Fish, Pufferfish, Salmon, Cod, Rabbit, Fox, Strider (Nether), Hoglin (Nether)
- Neutral: Wolf (tame with bones), Bee (honey without smoke = aggressive), Enderman (don't look at eyes), Polar Bear, Iron Golem, Piglin (wear gold to avoid aggro), Zombified Piglin, Snow Golem
- Hostile: Zombie, Skeleton, Creeper (explodes!), Spider, Cave Spider (poisonous), Witch, Slime, Blaze (Nether, drops Blaze Rods), Ghast (Nether), Magma Cube, Endermite, Shulker, Husk (desert Zombie), Stray (snowy Skeleton), Drowned (water Zombie with Tridents), Vex, Vindicator, Pillager, Ravager, Guardian, Elder Guardian, Phantom (skips sleep), Warden (Deep Dark, strongest mob)
- Bosses: Ender Dragon (The End, killed to unlock outer islands + credits), Wither (spawn with 4 Soul Sand/Soil T-shape + 3 Wither Skeleton Skulls)

ENCHANTING:
- Enchanting Table + Lapis + XP levels
- 15 Bookshelves around table for max level 30 enchants
- Key weapon enchants: Sharpness (extra dmg), Smite (undead dmg), Bane of Arthropods (spiders), Fire Aspect, Looting (more drops), Sweeping Edge, Knockback, Unbreaking, Mending
- Key armor enchants: Protection, Fire Protection, Blast Protection, Projectile Protection, Thorns, Feather Falling (boots), Depth Strider/Frost Walker (boots), Respiration/Aqua Affinity (helmet), Unbreaking, Mending
- Key tool enchants: Efficiency, Silk Touch (mines blocks intact), Fortune (more drops), Unbreaking, Mending
- Key bow enchants: Power, Punch, Flame, Infinity, Unbreaking, Mending
- Grindstone: removes enchants (recovers some XP). Anvil: combines enchanted items/books

POTIONS (Brewing Stand):
- Base: Water Bottle + Nether Wart = Awkward Potion
- Add to Awkward: Glistering Melon Slice (Healing), Sugar (Speed), Magma Cream (Fire Resistance), Rabbit's Foot (Leaping), Blaze Powder (Strength), Golden Carrot (Night Vision), Pufferfish (Water Breathing), Ghast Tear (Regeneration), Turtle Shell (Slowness)
- Fermented Spider Eye converts: Healing→Harming, Speed→Slowness, Night Vision→Invisibility, Fire Resistance→Weakness
- Modifiers: Redstone Dust (longer duration), Glowstone Dust (stronger effect), Gunpowder (splash potion), Dragon's Breath (lingering potion)

REDSTONE:
- Power sources: Lever (toggle), Button, Pressure Plate, Daylight Sensor, Observer, Tripwire Hook, Target Block, Sculk Sensor
- Transmission: Redstone Dust (up to 15 blocks), Redstone Repeater (extends signal, adds delay), Redstone Comparator (compares/subtracts signals)
- Logic gates: NOT = Redstone Torch behind block, AND/OR = combinations of torches
- Outputs: Piston/Sticky Piston, Dropper, Dispenser, Door, Trapdoor, Fence Gate, Note Block, Bell, TNT, Redstone Lamp

DIMENSIONS & TRAVEL:
- Nether Portal: 4x5 frame of Obsidian minimum, lit with Flint & Steel or Fire Charge
- 1 block Nether = 8 blocks Overworld (use for fast travel)
- End Portal: found in Strongholds (locate with Eye of Ender), activate 12 End Portal Frames with Eyes of Ender
- End Gateway Portal (purple): spawns after Ender Dragon kill, teleports to outer End islands

SURVIVAL TIPS:
- Never dig straight down — risk of lava/void
- Always carry a bed to set spawn + skip night
- Bring milk (from cows) to cure bad status effects
- Shield blocks Skeleton arrows and Creeper blasts (craft: 6 Planks + 1 Iron Ingot)
- A Totem of Undying (from Evokers) prevents death once
- Eating Golden Apples gives Absorption (extra HP) and Regeneration
- Enchanted Golden Apple (notch apple) gives even stronger buffs

=== HOW TO INTERACT WITH ME ===
- Talk freely: I respond to all chat
- Give orders naturally: "follow me", "go to x y z", "stop", "attack that zombie"
- Ask Minecraft questions: "how do I make netherite?", "where do diamonds spawn?"
- I remember our conversation so you can refer to things said earlier

Keep all my chat responses under 200 characters (Minecraft chat limit). Be concise and helpful.`;
  }

  /**
   * Process a chat message.
   */
  async handleMessage(sender, message, bot) {
    if (!process.env.NVIDIA_API_KEY) {
      bot.chat(`Sorry ${sender}, my AI brain is missing an API key.`);
      return;
    }

    try {
      console.log(`[AIAgent][${this.username}] Processing from ${sender}: "${message}"`);

      // Add this message to conversation history (memory)
      this.conversationHistory.push({ role: 'user', content: `${sender}: ${message}` });
      if (this.conversationHistory.length > this.MAX_HISTORY) {
        this.conversationHistory = this.conversationHistory.slice(-this.MAX_HISTORY);
      }

      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: this._buildSystemPrompt(sender) },
          ...this.conversationHistory
        ],
        tools: this.tools,
        tool_choice: 'auto',
        max_tokens: 200,
      });

      const responseMessage = response.choices[0].message;

      // Remember the AI's reply too (for self-learning context)
      if (responseMessage.content) {
        this.conversationHistory.push({ role: 'assistant', content: responseMessage.content });
      }

      // Check if AI wants to call a tool
      if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
        for (const toolCall of responseMessage.tool_calls) {
          const functionName = toolCall.function.name;
          const functionArgs = JSON.parse(toolCall.function.arguments);

          console.log(`[AIAgent][${this.username}] Executing tool ${functionName}:`, functionArgs);

          let synthMsg = '';
          switch (functionName) {
            case 'goto':
            case 'mine':
              synthMsg = `!${functionName} ${functionArgs.x} ${functionArgs.y} ${functionArgs.z}`;
              break;
            case 'follow':
            case 'attack':
              synthMsg = `!${functionName} ${functionArgs.target}`;
              break;
            case 'stop':
              synthMsg = `!stop`;
              break;
          }

          if (synthMsg) {
            this.botManager.commandManager.execute(sender, synthMsg, bot);
          }
        }

        if (responseMessage.content) {
          bot.chat(responseMessage.content.slice(0, 250));
        } else {
          bot.chat(`On it, ${sender}!`);
        }
      } else if (responseMessage.content) {
        bot.chat(responseMessage.content.slice(0, 250));
      }

    } catch (error) {
      console.error(`[AIAgent][${this.username}] Error:`, error.message);
      bot.chat(`Sorry, I hit an error: ${error.message.slice(0, 100)}`);
    }
  }
}

module.exports = AIAgent;
