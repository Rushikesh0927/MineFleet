const { OpenAI } = require('openai');

// How often the bot autonomously decides its next action (ms)
const AUTO_LOOP_INTERVAL_MS = 30_000; // 30 seconds

class AIAgent {
  constructor(botManager, botId, username) {
    this.botManager = botManager;
    this.botId = botId;
    this.username = username;

    // Conversation memory (learning from interactions)
    this.conversationHistory = [];
    this.MAX_HISTORY = 30;

    // Autonomous gameplay experience log (self-learning)
    this.experienceLog = [];
    this.MAX_EXPERIENCE = 20;

    // SEPARATE thinking locks — so autonomous tick doesn't block chat
    this._isChatThinking = false;
    this._isAutoThinking = false;

    // Autonomous loop handle
    this._autoLoopTimer = null;

    this.openai = new OpenAI({
      baseURL: 'https://integrate.api.nvidia.com/v1',
      apiKey: process.env.NVIDIA_API_KEY || '',
    });

    // Models to try in order — 8B first (proven working from VPS in 0.7s)
    this.models = [
      'meta/llama-3.1-8b-instruct',  // Fast, reliable, works with tools
      'meta/llama-3.3-70b-instruct', // Backup (sometimes times out from VPS)
    ];

    // Tools the AI can call to control the bot
    this.tools = [
      {
        type: 'function',
        function: {
          name: 'goto',
          description: 'Walk to x y z coordinates',
          parameters: {
            type: 'object',
            properties: {
              x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' }
            },
            required: ['x', 'y', 'z']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'follow',
          description: 'Follow a player by name',
          parameters: {
            type: 'object',
            properties: { target: { type: 'string' } },
            required: ['target']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'mine',
          description: 'Mine the block at x y z',
          parameters: {
            type: 'object',
            properties: {
              x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' }
            },
            required: ['x', 'y', 'z']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'attack',
          description: 'Attack entity by name or "hostile" for nearest hostile mob',
          parameters: {
            type: 'object',
            properties: { target: { type: 'string' } },
            required: ['target']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'craft',
          description: 'Craft an item by name',
          parameters: {
            type: 'object',
            properties: { itemName: { type: 'string' } },
            required: ['itemName']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'stop',
          description: 'Stop current action',
          parameters: { type: 'object', properties: {} }
        }
      }
    ];
  }

  // ─── AI API call with model fallback (NON-streaming for reliability) ──────

  async _callLLM(messages, useTools = true) {
    let lastError = null;

    for (const model of this.models) {
      try {
        console.log(`[AIAgent][${this.username}] Trying model: ${model}`);

        const params = {
          model,
          messages,
          max_tokens: 256,
          temperature: 0.7,
        };

        // Only include tools if requested and model supports them
        if (useTools) {
          params.tools = this.tools;
          params.tool_choice = 'auto';
        }

        const response = await this.openai.chat.completions.create(params, {
          timeout: 30000, // 30 second timeout
        });

        const choice = response.choices?.[0]?.message;
        if (!choice) throw new Error('Empty response from API');

        console.log(`[AIAgent][${this.username}] ✅ Got response from ${model}`);
        return {
          content: choice.content || '',
          tool_calls: choice.tool_calls || null
        };
      } catch (err) {
        console.error(`[AIAgent][${this.username}] ${model} failed: ${err.message}`);
        lastError = err;
      }
    }

    // If all models with tools fail, try without tools (simpler request)
    if (useTools) {
      console.log(`[AIAgent][${this.username}] Retrying without tools...`);
      try {
        return await this._callLLM(messages, false);
      } catch (_) {}
    }

    throw lastError || new Error('All AI models failed');
  }

  // ─── Game state reader ─────────────────────────────────────────────────────

  _readGameState(bot) {
    const pos = bot.entity?.position;
    const inv = bot.inventory?.items() ?? [];

    const invSummary = inv.slice(0, 10)
      .map(i => `${i.name}x${i.count}`)
      .join(', ') || 'empty';

    const nearbyPlayers = Object.values(bot.players || {})
      .filter(p => p.username !== bot.username)
      .map(p => p.username);

    const held = bot.heldItem ? `${bot.heldItem.name}x${bot.heldItem.count}` : 'nothing';

    // Get nearby block types (what's around the bot)
    let nearbyBlocks = 'unknown';
    if (pos) {
      const blocks = [];
      for (let dx = -2; dx <= 2; dx += 2) {
        for (let dz = -2; dz <= 2; dz += 2) {
          try {
            const block = bot.blockAt(pos.offset(dx, -1, dz));
            if (block && block.name !== 'air' && !blocks.includes(block.name)) {
              blocks.push(block.name);
            }
          } catch (_) {}
        }
      }
      nearbyBlocks = blocks.join(', ') || 'air';
    }

    return {
      posStr: pos ? `X:${Math.floor(pos.x)} Y:${Math.floor(pos.y)} Z:${Math.floor(pos.z)}` : 'unknown',
      health: Math.round(bot.health ?? 20),
      food: Math.round(bot.food ?? 20),
      dimension: bot.game?.dimension ?? 'overworld',
      heldItem: held,
      invSummary,
      nearbyPlayers: nearbyPlayers.length ? nearbyPlayers.join(', ') : 'none',
      nearbyBlocks,
      timeOfDay: bot.time?.timeOfDay ?? 'unknown',
    };
  }

  // ─── System prompt (compact — no massive knowledge dump) ───────────────────

  _buildSystemPrompt(context = 'chat', senderName = null) {
    const modeContext = context === 'autonomous'
      ? 'You are in AUTONOMOUS MODE. No player gave you an order. Decide what to do next to survive and progress.'
      : `Player ${senderName} is talking to you. Respond helpfully and naturally.`;

    return `You are MineFleetBot5, a Minecraft bot that plays like a real player. You think, act, and chat naturally.
${modeContext}

CORE MINECRAFT KNOWLEDGE:
- Punch trees → get logs → craft planks → craft sticks → craft tools
- Wooden pickaxe → mine stone → stone tools → mine iron → iron tools → mine diamond
- Craft table: 4 planks. Furnace: 8 cobblestone. Chest: 8 planks
- Tools: 2 sticks bottom-center + 3 material on top row (pickaxe), L-shape (axe), 1-top (shovel)
- Sword: 1 stick + 2 material vertically. Shield: 1 iron + 6 planks
- Food: kill animals (cow/pig/chicken/sheep), cook raw meat in furnace, craft bread from 3 wheat
- Armor: helmet(5), chestplate(8), leggings(7), boots(4) of material in armor patterns
- Diamonds found at Y:-59 to Y:16 (best Y:-59). Iron at Y:-24 to Y:56
- Night = hostile mobs spawn. Build shelter or craft bed (3 wool + 3 planks)
- Torches: 1 coal + 1 stick = 4 torches. Place them to prevent mob spawns
- Golden apple: 1 apple + 8 gold ingots
- Enchanting table: 1 book + 2 diamonds + 4 obsidian
- Brewing stand: 1 blaze rod + 3 cobblestone

SURVIVAL PRIORITIES:
1. Health low → eat food or retreat
2. No tools → chop wood first, then craft
3. Night time → find/build shelter
4. Hostile mob nearby → fight or flee
5. Stable → explore, mine, gather resources

CHAT RULES:
- Keep messages under 200 chars (Minecraft limit)
- Be friendly, talk like a real player
- Answer any question naturally — you know Minecraft inside out
- If asked to do something, use your tools to do it`;
  }

  // ─── Autonomous game loop ──────────────────────────────────────────────────

  startAutonomousLoop(bot, taskManager) {
    this._bot = bot;
    this._taskManager = taskManager;
    if (this._autoLoopTimer) clearInterval(this._autoLoopTimer);

    this._autoLoopTimer = setInterval(() => {
      this._autonomousTick(bot, taskManager);
    }, AUTO_LOOP_INTERVAL_MS);

    console.log(`[AIAgent][${this.username}] 🤖 Autonomous loop started (every ${AUTO_LOOP_INTERVAL_MS / 1000}s)`);
  }

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
    if (this._isAutoThinking) return;
    if (!process.env.NVIDIA_API_KEY) return;

    // Don't act autonomously if already doing something
    const activeTask = taskManager ? taskManager.getActive() : null;
    if (activeTask) return;

    this._isAutoThinking = true;
    try {
      const state = this._readGameState(bot);

      const expContext = this.experienceLog.length > 0
        ? `\nRecent actions:\n${this.experienceLog.slice(-5).map(e => `- ${e.action} → ${e.result}`).join('\n')}`
        : '';

      const stateMsg = `Game state: Pos ${state.posStr} | HP ${state.health}/20 | Food ${state.food}/20 | Holding: ${state.heldItem} | Inventory: ${state.invSummary} | Nearby players: ${state.nearbyPlayers} | Ground: ${state.nearbyBlocks} | Time: ${state.timeOfDay}${expContext}

What is the single best action to take right now? Use a tool to act. Explain in 1 short sentence what you're doing.`;

      const msg = await this._callLLM([
        { role: 'system', content: this._buildSystemPrompt('autonomous') },
        { role: 'user', content: stateMsg }
      ]);

      const timestamp = new Date().toLocaleTimeString();

      if (msg.tool_calls && msg.tool_calls.length > 0) {
        for (const toolCall of msg.tool_calls) {
          const fn = toolCall.function.name;
          let args;
          try {
            args = JSON.parse(toolCall.function.arguments);
          } catch (_) {
            console.error(`[AIAgent][${this.username}] Bad tool args: ${toolCall.function.arguments}`);
            continue;
          }

          const synthMsg = this._buildCommand(fn, args);
          if (synthMsg) {
            this.botManager.commandManager.execute(this.username, synthMsg, bot);
            this.experienceLog.push({ time: timestamp, action: `${fn}(${JSON.stringify(args)})`, result: 'dispatched' });
            if (this.experienceLog.length > this.MAX_EXPERIENCE) {
              this.experienceLog = this.experienceLog.slice(-this.MAX_EXPERIENCE);
            }
          }
        }
        if (msg.content) bot.chat(msg.content.slice(0, 200));
      } else if (msg.content) {
        this.experienceLog.push({ time: timestamp, action: 'observe', result: msg.content.slice(0, 80) });
        bot.chat(msg.content.slice(0, 200));
      }

    } catch (err) {
      console.error(`[AIAgent][${this.username}] Auto tick error: ${err.message}`);
    } finally {
      this._isAutoThinking = false;
    }
  }

  // ─── Manual chat handler ───────────────────────────────────────────────────

  /**
   * Respond to a player calling !MineFleetBot5 <message>
   */
  async handleMessage(sender, message, bot) {
    if (!process.env.NVIDIA_API_KEY) {
      bot.chat(`Sorry ${sender}, AI key is not set.`);
      return;
    }

    // Separate lock — chat is NEVER blocked by autonomous thinking
    if (this._isChatThinking) {
      bot.chat(`${sender}, give me a sec, still working on your last request!`);
      return;
    }

    this._isChatThinking = true;
    try {
      console.log(`[AIAgent][${this.username}] Chat from ${sender}: "${message}"`);

      // Read current game state for context
      const state = this._readGameState(bot);
      const stateContext = `[Current state: Pos ${state.posStr} | HP ${state.health}/20 | Food ${state.food}/20 | Holding: ${state.heldItem} | Inv: ${state.invSummary} | Near: ${state.nearbyPlayers}]`;

      // Add to conversation memory
      this.conversationHistory.push({ role: 'user', content: `${sender}: ${message}\n${stateContext}` });
      if (this.conversationHistory.length > this.MAX_HISTORY) {
        this.conversationHistory = this.conversationHistory.slice(-this.MAX_HISTORY);
      }

      const msg = await this._callLLM([
        { role: 'system', content: this._buildSystemPrompt('chat', sender) },
        ...this.conversationHistory.slice(-10) // only last 10 messages for speed
      ]);

      // Save AI reply to memory
      if (msg.content) {
        this.conversationHistory.push({ role: 'assistant', content: msg.content });
      }

      // Execute tool calls if any
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        for (const toolCall of msg.tool_calls) {
          const fn = toolCall.function.name;
          let args;
          try {
            args = JSON.parse(toolCall.function.arguments);
          } catch (_) {
            continue;
          }

          const synthMsg = this._buildCommand(fn, args);
          if (synthMsg) {
            this.botManager.commandManager.execute(sender, synthMsg, bot);
            this.experienceLog.push({
              time: new Date().toLocaleTimeString(),
              action: `${fn}(${JSON.stringify(args)}) by ${sender}`,
              result: 'dispatched'
            });
          }
        }
        const reply = msg.content || `On it, ${sender}!`;
        bot.chat(reply.slice(0, 200));
      } else if (msg.content) {
        bot.chat(msg.content.slice(0, 200));
      } else {
        bot.chat(`Hey ${sender}! I'm here, what can I help with?`);
      }

    } catch (error) {
      console.error(`[AIAgent][${this.username}] Chat error: ${error.message}`);
      // Still give a useful response even if AI fails
      bot.chat(`Hey ${sender}! AI had a hiccup but I'm still here. Try again?`);
    } finally {
      this._isChatThinking = false;
    }
  }

  // ─── Helper: build a !command string from tool call ────────────────────────

  _buildCommand(fn, args) {
    switch (fn) {
      case 'goto':
      case 'mine':
        return `!${fn} ${args.x} ${args.y} ${args.z}`;
      case 'follow':
      case 'attack':
        return `!${fn} ${args.target}`;
      case 'craft':
        return `!craft ${args.itemName}`;
      case 'stop':
        return '!stop';
      default:
        return null;
    }
  }
}

module.exports = AIAgent;
