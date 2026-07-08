/**
 * AIAgent.js
 *
 * The AI Brain of MineFleetBot5 — v2 Neural Behavior Engine.
 *
 * Architecture:
 *   Layer 1 — BehaviorEngine (reflexes): runs every 1.5s, zero API calls
 *   Layer 2 — LLM Strategist (conscious mind): runs every 45s, sets high-level mode
 *   Layer 3 — Chat Handler: responds to player messages naturally
 *
 * The LLM no longer controls every micro-action. It only decides:
 *   "Should I gather wood, explore, mine stone, or do something else?"
 * The BehaviorEngine handles the HOW autonomously.
 */

const { OpenAI } = require('openai');
const KnowledgeRAG = require('./KnowledgeRAG');
const BotMemory = require('./BotMemory');
const SpatialMemory = require('./SpatialMemory');
const UtilityDecisionEngine = require('./UtilityDecisionEngine');

const STRATEGY_INTERVAL_MS = 45_000; // LLM consulted every 45 seconds for strategy

// Survival goal progression — the bot follows this like a real player
const GOAL_TREE = [
  { id: 'get_wood', name: 'Gather wood', mode: 'gather_wood', check: (inv) => inv.some(i => i.name.includes('log') || i.name.includes('plank')) },
  { id: 'craft_tools', name: 'Craft basic tools', mode: 'craft', check: (inv) => inv.some(i => i.name.includes('pickaxe')) },
  { id: 'mine_stone', name: 'Mine stone', mode: 'gather_stone', check: (inv) => inv.some(i => i.name === 'cobblestone' && i.count >= 8) },
  { id: 'craft_furnace', name: 'Craft furnace', mode: 'craft', check: (inv) => inv.some(i => i.name === 'furnace') },
  { id: 'get_iron', name: 'Mine iron ore', mode: 'gather_stone', check: (inv) => inv.some(i => i.name.includes('iron')) },
  { id: 'get_food', name: 'Get food supply', mode: 'explore', check: (inv) => inv.some(i => ['cooked_beef', 'cooked_porkchop', 'bread', 'cooked_chicken', 'golden_carrot', 'cooked_mutton'].includes(i.name)) },
  { id: 'find_diamonds', name: 'Find diamonds', mode: 'gather_stone', check: (inv) => inv.some(i => i.name === 'diamond') },
];

class AIAgent {
  constructor(botManager, botId, username) {
    this.botManager = botManager;
    this.botId = botId;
    this.username = username;

    // Conversation memory for chat context
    this.conversationHistory = [];
    this.MAX_HISTORY = 20;

    // Separate locks
    this._isChatThinking = false;
    this._isStrategyThinking = false;
    this._strategyTimer = null;

    // RAG Knowledge retrieval
    this.rag = new KnowledgeRAG();

    // Persistent memory (loads from disk)
    this.memory = new BotMemory(username);

    // Spatial memory (world map)
    this.spatial = new SpatialMemory(username);

    // Continuous utility engine (created in startAutonomousLoop)
    this.utilityEngine = null;

    // NVIDIA NIM API
    this.openai = new OpenAI({
      baseURL: 'https://integrate.api.nvidia.com/v1',
      apiKey: process.env.NVIDIA_API_KEY || '',
    });

    // Model fallback chain
    this.models = [
      'meta/llama-3.1-70b-instruct',
    ];

    // Tools for chat interaction (player commands)
    this.chatTools = [
      { type: 'function', function: { name: 'goto', description: 'Walk to x y z coordinates', parameters: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' } }, required: ['x', 'y', 'z'] } } },
      { type: 'function', function: { name: 'follow', description: 'Follow a player by name', parameters: { type: 'object', properties: { target: { type: 'string' } }, required: ['target'] } } },
      { type: 'function', function: { name: 'jump', description: 'Make the bot jump', parameters: { type: 'object', properties: {} } } },
      { type: 'function', function: { name: 'stop', description: 'Stop everything and idle', parameters: { type: 'object', properties: {} } } },
      { type: 'function', function: { name: 'explore', description: 'Start exploring the world', parameters: { type: 'object', properties: {} } } },
      { type: 'function', function: { name: 'gather_wood', description: 'Start gathering wood from trees', parameters: { type: 'object', properties: {} } } },
      { type: 'function', function: { name: 'mine_stone', description: 'Start mining stone', parameters: { type: 'object', properties: {} } } },
      { type: 'function', function: { name: 'come_here', description: 'Come to the player who asked', parameters: { type: 'object', properties: { target: { type: 'string' } }, required: ['target'] } } },
    ];
  }

  // ─── LLM Call with Fallback ──────────────────────────────────────────────

  async _callLLM(messages, useTools = false, tools = null) {
    let lastError = null;

    for (const model of this.models) {
      try {
        console.log(`[AIAgent][${this.username}] Trying ${model}...`);

        const params = {
          model,
          messages,
          max_tokens: 200,
          temperature: 0.7,
        };

        if (useTools && tools) {
          params.tools = tools;
          params.tool_choice = 'auto';
        }

        const response = await this.openai.chat.completions.create(params, {
          timeout: 20000,
        });

        const msg = response.choices?.[0]?.message;
        if (msg) {
          console.log(`[AIAgent][${this.username}] ✅ ${model} responded`);
          return msg;
        }
      } catch (err) {
        console.error(`[AIAgent][${this.username}] ${model} failed: ${err.message}`);
        lastError = err;
      }
    }

    return { content: null, tool_calls: null };
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
      posRaw: pos,
      health: Math.round(bot.health ?? 20),
      food: Math.round(bot.food ?? 20),
      dimension: bot.game?.dimension ?? 'overworld',
      heldItem: held,
      invSummary,
      invRaw: inv,
      nearbyPlayers: nearbyPlayers.length ? nearbyPlayers.join(', ') : 'none',
      nearbyMobs: nearbyMobs.length ? nearbyMobs.join(', ') : 'none',
      timeOfDay: bot.time?.timeOfDay ?? 0,
      isDay: (bot.time?.timeOfDay ?? 0) < 13000,
    };
  }

  // ─── Determine Current Goal ──────────────────────────────────────────────

  _determineGoalAndMode(state) {
    for (const goal of GOAL_TREE) {
      if (!goal.check(state.invRaw)) {
        return { goal: goal.name, mode: goal.mode };
      }
    }
    return { goal: 'Explore and gather resources', mode: 'explore' };
  }

  // ─── System Prompt Builder ───────────────────────────────────────────────

  _buildChatPrompt(senderName, gameState) {
    const spatialInfo = gameState.posRaw
      ? this.spatial.getSummaryForPrompt(gameState.posRaw.x, gameState.posRaw.z)
      : '';

    return `You are MineFleetBot5, an intelligent Minecraft bot playing survival. You talk like a real chill player — short, natural, sometimes funny.

Currently: ${this.behaviorEngine ? this.behaviorEngine.getMode() : 'idle'}
Position: ${gameState.posStr}
Health: ${gameState.health}/20 | Food: ${gameState.food}/20
Holding: ${gameState.heldItem} | Inventory: ${gameState.invSummary}
Nearby players: ${gameState.nearbyPlayers}
Nearby mobs: ${gameState.nearbyMobs}
World knowledge: ${spatialInfo}

${this.memory.getContextForPrompt()}

Player ${senderName} is talking to you. Respond naturally.

RULES:
- Keep responses under 200 chars (Minecraft chat limit)
- Talk naturally like a real player — short, casual, no robotic language
- Use tools ONLY if the player asks you to DO something physical (move, follow, jump, mine, etc.)
- If they're just chatting or asking questions, reply with text ONLY — NO tools
- If asked where you are, tell them your coordinates
- If asked what you're doing, describe your current activity
- NEVER dump internal reasoning or coordinates into chat unless asked`;
  }

  // ─── Start the Engine ────────────────────────────────────────────────────

  startAutonomousLoop(bot, taskManager) {
    this._bot = bot;
    this._taskManager = taskManager;

    // Create Utility Decision Engine
    this.utilityEngine = new UtilityDecisionEngine(bot, this.spatial, this.memory, this.botManager, this.botId);
    this.utilityEngine.start();

    // Listen for death events
    bot.on('death', () => {
      this.memory.recordDeath('Died in game');
    });

    // Start LLM strategy loop (every 45 seconds, just for high-level decisions)
    this._strategyTimer = setInterval(() => {
      this._strategyTick(bot);
    }, STRATEGY_INTERVAL_MS);

    // Initial strategy decision after 5 seconds (let the bot settle in)
    setTimeout(() => this._strategyTick(bot), 5000);

    console.log(`[AIAgent] Autonomous engine started for ${this.username} — BehaviorEngine ticking every 1.5s, LLM strategy every 45s`);
  }

  shutdown() {
    if (this._strategyTimer) {
      clearInterval(this._strategyTimer);
      this._strategyTimer = null;
    }
    if (this.utilityEngine) {
      this.utilityEngine.stop();
    }
    this.memory.shutdown();
    this.spatial.shutdown();
  }

  // ─── LLM Strategy Tick (every 45s) ───────────────────────────────────────

  async _strategyTick(bot) {
    if (this._isStrategyThinking) return;
    if (!process.env.NVIDIA_API_KEY) return;

    this._isStrategyThinking = true;
    try {
      const state = this._readGameState(bot);
      const spatialInfo = state.posRaw
        ? this.spatial.getSummaryForPrompt(state.posRaw.x, state.posRaw.z)
        : '';

      const prompt = `You are the Brain (High-Level Intelligence) of a Minecraft AI player.
Your reasoning engine must output a structured JSON plan. Do NOT output raw text.
Output EXACTLY valid JSON matching this schema:
{
  "current_goal": "Collect wood",
  "reasoning": "Need wood to craft tools.",
  "next_task": "gather_wood", 
  "expected_result": "Have enough wood for a crafting table"
}

Valid "next_task" values: [gather_wood, gather_stone, explore, eat, flee, craft, shelter, idle]

Current State:
Health: ${state.health}/20 | Food: ${state.food}/20
Holding: ${state.heldItem} | Inventory: ${state.invSummary}
World: ${spatialInfo}
Nearby: ${state.nearbyBlocks}
Mobs: ${state.nearbyMobs}

${this.memory.getContextForPrompt()}

Output only the JSON.`;

      const msg = await this._callLLM([{ role: 'user', content: prompt }]);
      
      let plan;
      try {
        // Strip markdown code blocks if the model outputs them
        const rawJson = msg.content.replace(/```json/g, '').replace(/```/g, '').trim();
        plan = JSON.parse(rawJson);
      } catch (err) {
        console.error(`[AIAgent] Failed to parse Nemotron JSON:`, err.message);
        plan = { current_goal: 'Explore', next_task: 'explore' };
      }

      console.log(`[AIAgent] NEMOTRON PLAN:`, plan);

      // Update goal in memory
      if (!this.memory.data.currentGoal || this.memory.data.currentGoal.goal !== plan.current_goal) {
        if (this.memory.data.currentGoal) this.memory.completeGoal();
        this.memory.setGoal(plan.current_goal);
      }

      if (this.utilityEngine) {
        // Pass the Brain's target task into the Utility Engine
        this.utilityEngine.setBrainGoal(plan.next_task || 'explore');
      }

      this.memory.addExperience('strategy', `goal=${plan.current_goal}, task=${plan.next_task}`, true);
    } catch (err) {
      console.error(`[AIAgent][${this.username}] Strategy tick error: ${err.message}`);
    } finally {
      this._isStrategyThinking = false;
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

      this.conversationHistory.push({ role: 'user', content: `${sender}: ${message}` });
      if (this.conversationHistory.length > this.MAX_HISTORY) {
        this.conversationHistory = this.conversationHistory.slice(-this.MAX_HISTORY);
      }

      const msg = await this._callLLM([
        { role: 'system', content: this._buildChatPrompt(sender, state) },
        ...this.conversationHistory.slice(-8)
      ], true, this.chatTools);

      if (msg.content) {
        this.conversationHistory.push({ role: 'assistant', content: msg.content });
      }

      // Execute tool calls from chat (player commands)
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        for (const toolCall of msg.tool_calls) {
          const fn = toolCall.function.name;
          let args;
          try { args = JSON.parse(toolCall.function.arguments); } catch (_) { continue; }
          this._dispatchChatAction(fn, args, bot, sender);
        }
      }

      // Send response
      if (msg.content && msg.content.trim().length > 0) {
        bot.chat(msg.content.slice(0, 200));
      }

      this.memory.data.chatResponses++;

    } catch (error) {
      console.error(`[AIAgent][${this.username}] Chat error: ${error.message}`);
      bot.chat(`Hey ${sender}! Had a brain freeze, try again?`);
    } finally {
      this._isChatThinking = false;
    }
  }

  // ─── Dispatch Chat Actions ───────────────────────────────────────────────

  _dispatchChatAction(fn, args, bot, sender) {
    try {
      if (fn === 'jump') {
        bot.setControlState('jump', true);
        setTimeout(() => bot.setControlState('jump', false), 500);
        return;
      }
      if (fn === 'stop') {
        if (this.utilityEngine) this.utilityEngine.setBrainGoal('idle');
        return;
      }
      if (fn === 'explore') {
        if (this.utilityEngine) this.utilityEngine.setBrainGoal('explore');
        return;
      }
      if (fn === 'gather_wood') {
        if (this.utilityEngine) this.utilityEngine.setBrainGoal('gather_wood');
        return;
      }
      if (fn === 'mine_stone') {
        if (this.utilityEngine) this.utilityEngine.setBrainGoal('gather_stone');
        return;
      }
      if (fn === 'follow' || fn === 'come_here') {
        const target = args.target || sender;
        if (this.behaviorEngine) this.behaviorEngine.setMode('follow', { target });
        return;
      }
      if (fn === 'goto') {
        if (this.behaviorEngine) this.behaviorEngine.setMode('goto', { x: args.x, y: args.y, z: args.z });
        return;
      }
    } catch (e) {
      console.error(`[AIAgent] Failed to dispatch chat action ${fn}: ${e.message}`);
    }
  }
}

module.exports = AIAgent;
