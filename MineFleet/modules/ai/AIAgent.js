/**
 * AIAgent.js
 *
 * The AI Brain of MineFleetBot5.
 *
 * Architecture:
 *  - RAG Knowledge: retrieves only relevant Minecraft knowledge per query
 *  - Persistent Memory: remembers experiences across restarts
 *  - Goal System: follows survival → tools → mine → build progression
 *  - Model Fallback: tries 70B first (smart), falls back to 8B (fast)
 */

const { OpenAI } = require('openai');
const KnowledgeRAG = require('./KnowledgeRAG');
const BotMemory = require('./BotMemory');

const AUTO_LOOP_INTERVAL_MS = 25_000; // 25 seconds between autonomous decisions

// Survival goal progression — the bot follows this like a real player
const GOAL_TREE = [
  { id: 'get_wood', name: 'Gather wood', check: (inv) => inv.some(i => i.name.includes('log') || i.name.includes('plank')) },
  { id: 'craft_tools', name: 'Craft basic tools', check: (inv) => inv.some(i => i.name.includes('pickaxe')) },
  { id: 'mine_stone', name: 'Mine stone', check: (inv) => inv.some(i => i.name === 'cobblestone' && i.count >= 8) },
  { id: 'craft_furnace', name: 'Craft furnace', check: (inv) => inv.some(i => i.name === 'furnace') },
  { id: 'get_iron', name: 'Mine iron ore', check: (inv) => inv.some(i => i.name.includes('iron')) },
  { id: 'craft_iron_tools', name: 'Craft iron tools', check: (inv) => inv.some(i => i.name === 'iron_pickaxe' || i.name === 'iron_sword') },
  { id: 'get_food', name: 'Get food supply', check: (inv) => inv.some(i => ['cooked_beef', 'cooked_porkchop', 'bread', 'cooked_chicken', 'golden_carrot', 'cooked_mutton'].includes(i.name)) },
  { id: 'find_diamonds', name: 'Find diamonds', check: (inv) => inv.some(i => i.name === 'diamond') },
];

class AIAgent {
  constructor(botManager, botId, username) {
    this.botManager = botManager;
    this.botId = botId;
    this.username = username;

    // Conversation memory for chat context
    this.conversationHistory = [];
    this.MAX_HISTORY = 20;

    // Separate locks — chat NEVER blocks autonomous, and vice versa
    this._isChatThinking = false;
    this._isAutoThinking = false;
    this._autoLoopTimer = null;

    // RAG Knowledge retrieval
    this.rag = new KnowledgeRAG();

    // Persistent memory (loads from disk)
    this.memory = new BotMemory(username);

    // NVIDIA NIM API
    this.openai = new OpenAI({
      baseURL: 'https://integrate.api.nvidia.com/v1',
      apiKey: process.env.NVIDIA_API_KEY || '',
    });

    // Model fallback chain — 70B first (with compact RAG prompt it should work now)
    this.models = [
      'meta/llama-3.1-70b-instruct',
      'meta/llama-3.1-8b-instruct',
    ];

    // Tools the AI can use to control the bot
    this.tools = [
      { type: 'function', function: { name: 'goto', description: 'Walk to x y z coordinates', parameters: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' } }, required: ['x', 'y', 'z'] } } },
      { type: 'function', function: { name: 'follow', description: 'Follow a player by name', parameters: { type: 'object', properties: { target: { type: 'string' } }, required: ['target'] } } },
      { type: 'function', function: { name: 'jump', description: 'Make the bot jump', parameters: { type: 'object', properties: {} } } },
      { type: 'function', function: { name: 'mine', description: 'Mine the block at x y z. You MUST be standing right next to it (within 4 blocks)! If you are far, use goto first.', parameters: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' } }, required: ['x', 'y', 'z'] } } },
      { type: 'function', function: { name: 'attack', description: 'Attack entity by name or "hostile" for nearest hostile', parameters: { type: 'object', properties: { target: { type: 'string' } }, required: ['target'] } } },
      { type: 'function', function: { name: 'craft', description: 'Craft an item by name (e.g. "wooden_pickaxe", "crafting_table")', parameters: { type: 'object', properties: { itemName: { type: 'string' } }, required: ['itemName'] } } },
      { type: 'function', function: { name: 'stop', description: 'Stop current action', parameters: { type: 'object', properties: {} } } },
    ];
  }

  // ─── LLM Call with Fallback ──────────────────────────────────────────────

  async _callLLM(messages, useTools = true) {
    let lastError = null;

    for (const model of this.models) {
      try {
        console.log(`[AIAgent][${this.username}] Trying ${model}...`);

        const params = {
          model,
          messages,
          max_tokens: 256,
          temperature: 0.7,
        };

        if (useTools) {
          params.tools = this.tools;
          params.tool_choice = 'auto';
        }

        const response = await this.openai.chat.completions.create(params, {
          timeout: 25000, // 25s — enough for 70B with small prompt
        });

        const choice = response.choices?.[0]?.message;
        if (!choice) throw new Error('Empty API response');

        console.log(`[AIAgent][${this.username}] ✅ ${model} responded`);
        return { content: choice.content || '', tool_calls: choice.tool_calls || null };
      } catch (err) {
        console.error(`[AIAgent][${this.username}] ${model} failed: ${err.message}`);
        lastError = err;
      }
    }

    // Last resort: retry without tools (simpler request)
    if (useTools) {
      console.log(`[AIAgent][${this.username}] Retrying without tools...`);
      return await this._callLLM(messages, false);
    }

    throw lastError || new Error('All AI models failed');
  }

  // ─── Game State Reader ───────────────────────────────────────────────────

  _readGameState(bot) {
    const pos = bot.entity?.position;
    const inv = bot.inventory?.items() ?? [];

    const invSummary = inv.slice(0, 15)
      .map(i => `${i.name}x${i.count}`)
      .join(', ') || 'empty';

    const nearbyPlayers = Object.values(bot.players || {})
      .filter(p => p.username !== bot.username)
      .map(p => p.username);

    const held = bot.heldItem ? `${bot.heldItem.name}x${bot.heldItem.count}` : 'nothing';

    // Scan nearby blocks
    let nearbyBlocks = [];
    if (pos) {
      for (let dx = -3; dx <= 3; dx += 2) {
        for (let dz = -3; dz <= 3; dz += 2) {
          for (let dy = -1; dy <= 2; dy++) {
            try {
              const block = bot.blockAt(pos.offset(dx, dy, dz));
              if (block && block.name !== 'air' && !nearbyBlocks.includes(block.name)) {
                nearbyBlocks.push(block.name);
              }
            } catch (_) {}
          }
        }
      }
    }

    // Nearby entities (mobs)
    let nearbyMobs = [];
    try {
      const entities = Object.values(bot.entities || {});
      nearbyMobs = entities
        .filter(e => e !== bot.entity && e.position && pos && e.position.distanceTo(pos) < 16)
        .map(e => e.name || e.displayName || 'unknown')
        .filter(n => n !== 'unknown' && n !== 'player')
        .slice(0, 5);
    } catch (_) {}

    return {
      posStr: pos ? `X:${Math.floor(pos.x)} Y:${Math.floor(pos.y)} Z:${Math.floor(pos.z)}` : 'unknown',
      health: Math.round(bot.health ?? 20),
      food: Math.round(bot.food ?? 20),
      dimension: bot.game?.dimension ?? 'overworld',
      heldItem: held,
      invSummary,
      invRaw: inv,
      nearbyPlayers: nearbyPlayers.length ? nearbyPlayers.join(', ') : 'none',
      nearbyBlocks: nearbyBlocks.slice(0, 8).join(', ') || 'air',
      nearbyMobs: nearbyMobs.length ? nearbyMobs.join(', ') : 'none',
      timeOfDay: bot.time?.timeOfDay ?? 0,
      isDay: (bot.time?.timeOfDay ?? 0) < 13000,
    };
  }

  // ─── Determine Current Goal ──────────────────────────────────────────────

  _determineGoal(state) {
    // Check which goals are already completed
    for (const goal of GOAL_TREE) {
      if (!goal.check(state.invRaw)) {
        return goal.name;
      }
    }
    return 'Explore and gather resources';
  }

  // ─── System Prompt Builder ───────────────────────────────────────────────

  _buildSystemPrompt(context, senderName, ragKnowledge, gameState) {
    const modeContext = context === 'autonomous'
      ? 'You are in AUTONOMOUS MODE. Decide your next survival action based on your goal and game state.'
      : `Player ${senderName} is talking to you. Respond naturally and helpfully.`;

    const goalInfo = gameState ? `YOUR CURRENT GOAL: ${this._determineGoal(gameState)}` : '';

    return `You are MineFleetBot5, an intelligent Minecraft bot that plays like a real experienced player. You learn from your mistakes and remember your experiences.
${modeContext}

${goalInfo}

RELEVANT MINECRAFT KNOWLEDGE:
${ragKnowledge || 'Use your general Minecraft knowledge.'}

${this.memory.getContextForPrompt()}

RULES:
- Keep chat under 200 chars (Minecraft limit)
- Talk naturally like a real player
- ONLY use tools if you need to take a physical action (move, craft, attack, jump, etc.) that the user explicitly asked for.
- Do NOT hallucinate tool calls just because you can!
- If the player is just chatting or asking a question, do NOT use any tools! Just reply with text.
- Think step by step — what's the best next action?
- Learn from failures — don't repeat mistakes`;
  }

  // ─── Autonomous Gameplay Loop ────────────────────────────────────────────

  startAutonomousLoop(bot, taskManager) {
    this._bot = bot;
    this._taskManager = taskManager;
    if (this._autoLoopTimer) clearInterval(this._autoLoopTimer);

    // Listen for death events to record them
    bot.on('death', () => {
      this.memory.recordDeath('Died in game');
    });

    this._autoLoopTimer = setInterval(() => {
      this._autonomousTick(bot, taskManager);
    }, AUTO_LOOP_INTERVAL_MS);

    console.log(`[AIAgent][${this.username}] 🧠 AI Brain started (RAG + Memory + Goals, every ${AUTO_LOOP_INTERVAL_MS / 1000}s)`);
  }

  stopAutonomousLoop() {
    if (this._autoLoopTimer) {
      clearInterval(this._autoLoopTimer);
      this._autoLoopTimer = null;
    }
    this.memory.shutdown();
  }

  async _autonomousTick(bot, taskManager) {
    if (this._isAutoThinking) return;
    if (!process.env.NVIDIA_API_KEY) return;

    // Don't act if already busy with a task
    const activeTask = taskManager ? taskManager.getActive() : null;
    if (activeTask) return;

    this._isAutoThinking = true;
    try {
      const state = this._readGameState(bot);
      const currentGoal = this._determineGoal(state);

      // Update goal in memory
      if (!this.memory.data.currentGoal || this.memory.data.currentGoal.goal !== currentGoal) {
        if (this.memory.data.currentGoal) this.memory.completeGoal();
        this.memory.setGoal(currentGoal);
      }

      // RAG: retrieve knowledge relevant to current situation
      const ragQuery = `${currentGoal} ${state.invSummary} ${state.nearbyBlocks}`;
      const ragKnowledge = this.rag.retrieve(ragQuery, 2);

      const stateMsg = `GAME STATE:
Position: ${state.posStr} | Health: ${state.health}/20 | Food: ${state.food}/20
Time: ${state.isDay ? 'DAY' : 'NIGHT'} | Dimension: ${state.dimension}
Holding: ${state.heldItem} | Inventory: ${state.invSummary}
Nearby blocks: ${state.nearbyBlocks}
Nearby mobs: ${state.nearbyMobs}
Nearby players: ${state.nearbyPlayers}

YOUR GOAL: ${currentGoal}
What is the best SINGLE next action? Use a tool. Explain briefly what you're doing.`;

      const msg = await this._callLLM([
        { role: 'system', content: this._buildSystemPrompt('autonomous', null, ragKnowledge, state) },
        { role: 'user', content: stateMsg }
      ]);

      if (msg.tool_calls && msg.tool_calls.length > 0) {
        for (const toolCall of msg.tool_calls) {
          const fn = toolCall.function.name;
          let args;
          try { args = JSON.parse(toolCall.function.arguments); } catch (_) { continue; }

          if (this._dispatchAITask(fn, args, bot)) {
            this.memory.addExperience(`${fn}(${JSON.stringify(args)})`, 'dispatched', true);
            this.memory.addGoalStep(`${fn}: ${JSON.stringify(args)}`, 'executed');

            // Track skill usage
            const skillMap = { mine: 'stoneMining', craft: 'crafting', attack: 'combat', goto: 'exploring', follow: 'exploring' };
            if (skillMap[fn]) this.memory.trackSkill(skillMap[fn], true);
          }
        }
        if (msg.content) bot.chat(msg.content.slice(0, 200));
      } else if (msg.content) {
        this.memory.addExperience('observe', msg.content.slice(0, 100), true);
        bot.chat(msg.content.slice(0, 200));
      }

    } catch (err) {
      console.error(`[AIAgent][${this.username}] Auto tick error: ${err.message}`);
      this.memory.addExperience('auto_tick', `error: ${err.message}`, false);
    } finally {
      this._isAutoThinking = false;
    }
  }

  // ─── Chat Handler ────────────────────────────────────────────────────────

  async handleMessage(sender, message, bot) {
    if (!process.env.NVIDIA_API_KEY) {
      bot.chat(`Sorry ${sender}, AI key is not set.`);
      return;
    }

    if (this._isChatThinking) {
      bot.chat(`${sender}, working on your last request, one sec!`);
      return;
    }

    this._isChatThinking = true;
    try {
      console.log(`[AIAgent][${this.username}] Chat from ${sender}: "${message}"`);

      const state = this._readGameState(bot);

      // RAG: retrieve knowledge relevant to the player's question
      const ragKnowledge = this.rag.retrieve(message, 2);

      const stateContext = `[Pos ${state.posStr} | HP ${state.health}/20 | Food ${state.food}/20 | Holding: ${state.heldItem} | Inv: ${state.invSummary} | Near: ${state.nearbyPlayers}]`;

      this.conversationHistory.push({ role: 'user', content: `${sender}: ${message}\n${stateContext}` });
      if (this.conversationHistory.length > this.MAX_HISTORY) {
        this.conversationHistory = this.conversationHistory.slice(-this.MAX_HISTORY);
      }

      const msg = await this._callLLM([
        { role: 'system', content: this._buildSystemPrompt('chat', sender, ragKnowledge, state) },
        ...this.conversationHistory.slice(-8)
      ], true); // Allow tools in chat so it can obey commands

      if (msg.content) {
        this.conversationHistory.push({ role: 'assistant', content: msg.content });
      }

      // Execute tool calls
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        for (const toolCall of msg.tool_calls) {
          const fn = toolCall.function.name;
          let args;
          try { args = JSON.parse(toolCall.function.arguments); } catch (_) { continue; }

          if (this._dispatchAITask(fn, args, bot)) {
            this.memory.addExperience(`${fn} by ${sender}`, JSON.stringify(args), true);
          }
        }
        bot.chat((msg.content || `On it, ${sender}!`).slice(0, 200));
      } else if (msg.content) {
        bot.chat(msg.content.slice(0, 200));
      } else {
        bot.chat(`Hey ${sender}! What's up?`);
      }

      this.memory.data.chatResponses++;

      // User feels the bot "pauses" after chat because it waits 25s for next tick.
      // We will trigger an immediate autonomous tick to resume survival goals!
      setTimeout(() => {
         if (this._bot && this._taskManager) {
             this._autonomousTick(this._bot, this._taskManager);
         }
      }, 1000);

    } catch (error) {
      console.error(`[AIAgent][${this.username}] Chat error: ${error.message}`);
      this.memory.addExperience(`chat with ${sender}`, `error: ${error.message}`, false);
      bot.chat(`Hey ${sender}! Had a brain freeze, try again?`);
    } finally {
      this._isChatThinking = false;
    }
  }

  // ─── Build command string from tool call ─────────────────────────────────

  _dispatchAITask(fn, args, bot) {
    const id = bot._minefleetId;
    const mm = this.botManager.getMovementManager(id);

    try {
      if (fn === 'jump') {
        bot.setControlState('jump', true);
        setTimeout(() => bot.setControlState('jump', false), 500);
        return true;
      }
      if (fn === 'goto') {
        const GotoTask = require('../tasks/GotoTask');
        if (mm) this.botManager.assignTask(id, new GotoTask(args.x, args.y, args.z, mm));
        return true;
      }
      if (fn === 'follow') {
        const FollowTask = require('../tasks/FollowTask');
        const playerEntry = bot.players[args.target];
        if (playerEntry && playerEntry.entity && mm) {
          this.botManager.assignTask(id, new FollowTask(playerEntry.entity, args.target, mm));
          return true;
        }
      }
      if (fn === 'stop') {
        const StopTask = require('../tasks/StopTask');
        if (mm) this.botManager.assignTask(id, new StopTask(mm));
        return true;
      }
      if (fn === 'mine' || fn === 'craft' || fn === 'attack') {
        // For non-movement tasks, we can either use existing task classes or BotActionTask
        // If BotActionTask or AttackTask are used:
        if (fn === 'attack') {
           const AttackTask = require('../tasks/AttackTask');
           const playerEntry = bot.players[args.target];
           if (playerEntry && playerEntry.entity) {
             this.botManager.assignTask(id, new AttackTask(playerEntry.entity, bot));
             return true;
           }
        } else {
           const BotActionTask = require('../tasks/BotActionTask');
           this.botManager.assignTask(id, new BotActionTask(bot, fn, args));
           return true;
        }
      }
    } catch (e) {
      console.error(`[AIAgent] Failed to dispatch task ${fn}: ${e.message}`);
    }
    return false;
  }
}

module.exports = AIAgent;
