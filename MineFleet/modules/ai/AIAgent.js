const { OpenAI } = require('openai');
const { MINECRAFT_KNOWLEDGE } = require('./MinecraftKnowledge');

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

    // We'll try these models in order if one fails
    this.models = [
      'meta/llama-3.3-70b-instruct', // Powerful fallback (promoted due to glm outage)
      'meta/llama-3.1-8b-instruct',  // Reliable, fast fallback
      'z-ai/glm-5.2'                 // Primary requested by user (currently degraded)
    ];

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
      },
      {
        type: 'function',
        function: {
          name: 'craft',
          description: 'Craft an item. Provide the exact item name.',
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
          name: 'equip',
          description: 'Equip an item from inventory to your hand, armor, or off-hand.',
          parameters: {
            type: 'object',
            properties: { itemName: { type: 'string' }, destination: { type: 'string', description: '"hand", "head", "torso", "legs", "feet", "off-hand"' } },
            required: ['itemName', 'destination']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'consume',
          description: 'Eat food or drink a potion you are holding.',
          parameters: { type: 'object', properties: {}, required: [] }
        }
      },
      {
        type: 'function',
        function: {
          name: 'place',
          description: 'Place the currently held block at coordinates.',
          parameters: {
            type: 'object',
            properties: { x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' } },
            required: ['x', 'y', 'z']
          }
        }
      }
    ];
  }

  // ─── AI API Helper with Fallback ───────────────────────────────────────────

  async _callLLM(messages) {
    let lastError = null;
    
    console.log(`[AIAgent][${this.username}] Starting LLM call with fallback...`);

    for (const model of this.models) {
      try {
        console.log(`[AIAgent][${this.username}] Requesting model: ${model}...`);
        
        // We use streaming to support z-ai/glm-5.2 and handle tool accumulation manually
        const stream = await this.openai.chat.completions.create({
          model: model,
          messages: messages,
          tools: this.tools,
          tool_choice: 'auto',
          max_tokens: 300,
          stream: true
        }, { timeout: 60000 }); // 60 second timeout to allow large models to respond

        let content = '';
        let toolCalls = [];

        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta;
          if (!delta) continue;

          if (delta.content) {
            content += delta.content;
          }

          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              if (tc.id) {
                toolCalls[tc.index] = {
                  id: tc.id,
                  type: tc.type,
                  function: { name: tc.function.name, arguments: tc.function.arguments || '' }
                };
              } else if (tc.function && tc.function.arguments) {
                if (toolCalls[tc.index]) {
                  toolCalls[tc.index].function.arguments += tc.function.arguments;
                }
              }
            }
          }
        }

        toolCalls = toolCalls.filter(Boolean);
        return { content, tool_calls: toolCalls.length > 0 ? toolCalls : null };
      } catch (err) {
        console.error(`[AIAgent][${this.username}] Model ${model} failed: ${err.message}. Trying next...`);
        lastError = err;
      }
    }

    throw lastError || new Error("All fallback models failed");
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
    const modeContext = context === 'autonomous'
      ? 'You are currently in AUTONOMOUS MODE — no player has given you an order. You must decide what to do next on your own to survive and thrive in Minecraft.'
      : `A player named ${senderName} is talking to you right now. Only respond to what they say or ask.`;

    const baseIdentity = `You are MineFleetBot5, an autonomous AI Minecraft Java Edition bot with the ability to learn, remember, and play the game by yourself.
${modeContext}

You remember everything from past actions and conversations. You learn by doing — you try actions, observe what happens, and use that knowledge for future decisions.

${MINECRAFT_KNOWLEDGE}

=== YOUR AUTONOMOUS DECISION PROCESS ===
When in autonomous mode, look at your current state (health, food, inventory, position) and decide the MOST USEFUL next action.
- If health is low: find food, retreat from combat
- If food is low: find animals to hunt, look for crops
- If inventory is empty: chop wood, then craft tools using the recipes above
- If you have tools: mine for ores at the right depth
- If you have iron/diamond: enchant tools, brew potions
- Always report what you are about to do in short clear Minecraft chat

=== CHAT RULES ===
Keep all chat messages under 200 characters (Minecraft chat limit).
Be helpful, knowledgeable, and concise.
When answering recipe questions use the exact recipes from the knowledge base above.`;

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

      const responseMessage = await this._callLLM([
        { role: 'system', content: this._buildSystemPrompt('autonomous') },
        ...this.experienceLog.slice(-5).map(e => ({ role: 'assistant', content: `I did: ${e.action}` })),
        { role: 'user', content: stateMsg }
      ]);

      const msg = responseMessage;
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
            case 'place':
              actionStr = `!place ${args.x} ${args.y} ${args.z}`;
              break;
            case 'craft':
              actionStr = `!craft ${args.itemName}`;
              break;
            case 'equip':
              actionStr = `!equip ${args.destination} ${args.itemName}`;
              break;
            case 'consume':
              actionStr = `!consume`;
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

      const responseMessage = await this._callLLM([
        { role: 'system', content: this._buildSystemPrompt('chat', sender) },
        ...this.conversationHistory
      ]);

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
            case 'place':
              synthMsg = `!place ${args.x} ${args.y} ${args.z}`;
              break;
            case 'craft':
              synthMsg = `!craft ${args.itemName}`;
              break;
            case 'equip':
              synthMsg = `!equip ${args.destination} ${args.itemName}`;
              break;
            case 'consume':
              synthMsg = `!consume`;
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
