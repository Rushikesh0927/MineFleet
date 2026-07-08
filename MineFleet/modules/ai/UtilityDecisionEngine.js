/**
 * UtilityDecisionEngine.js
 * 
 * Replaces the static BehaviorEngine. FSMs are too rigid.
 * This runs continuously (100ms) and evaluates all possible actions.
 * 
 * • Observe the environment
 * • Calculate priorities
 * • Score every possible action (Confidence)
 * • Select the highest scoring action
 * • Pass to LocalPlanner
 */

const AttentionSystem = require('./AttentionSystem');
const LocalPlanner = require('./LocalPlanner');

class UtilityDecisionEngine {
  constructor(bot, spatialMemory, memory, botManager, botId) {
    this.bot = bot;
    this.spatial = spatialMemory;
    this.memory = memory;
    this.botManager = botManager;
    this.botId = botId;

    this.attention = new AttentionSystem(bot, spatialMemory);
    this.planner = new LocalPlanner(bot, spatialMemory);

    this._loopTimer = null;
    this.currentMacroAction = null;
    this.brainGoal = 'explore'; // Default goal from Nemotron
  }

  start() {
    console.log(`[UtilityEngine] Starting continuous decision loop (10Hz)`);
    // 100ms tick rate
    this._loopTimer = setInterval(() => this._tick(), 100);
    this.planner.start();
  }

  stop() {
    if (this._loopTimer) {
      clearInterval(this._loopTimer);
      this._loopTimer = null;
    }
    this.planner.stop();
  }

  // Called by AIAgent (Nemotron) every 30-60s
  setBrainGoal(goalName) {
    if (this.brainGoal !== goalName) {
      console.log(`[UtilityEngine] Brain updated strategy goal: ${goalName}`);
      this.brainGoal = goalName;
    }
  }

  _tick() {
    try {
      // 1. Observe
      this.attention.observe();

      // 2. Score possible actions
      const utilities = this._calculateUtilities();

      // 3. Select best action
      let bestAction = null;
      let highestScore = -1;

      for (const [action, score] of Object.entries(utilities)) {
        if (score > highestScore) {
          highestScore = score;
          bestAction = action;
        }
      }

      // 4. Check for interrupts or continuation
      if (this.currentMacroAction !== bestAction) {
        // Only interrupt if the new action is significantly better to avoid rapid oscillation (hysteresis)
        const currentScore = this.currentMacroAction ? utilities[this.currentMacroAction] : -1;
        if (highestScore > currentScore + 10) {
          console.log(`[UtilityEngine] Interrupt! Switching from ${this.currentMacroAction} (score: ${Math.round(currentScore)}) to ${bestAction} (score: ${Math.round(highestScore)})`);
          this.currentMacroAction = bestAction;
          this.planner.setMacroAction(bestAction, this._getContextForAction(bestAction));
        }
      }

    } catch (err) {
      console.error(`[UtilityEngine] Tick error:`, err);
    }
  }

  _calculateUtilities() {
    const scores = {};

    // Base scores
    scores['flee'] = this._scoreFlee();
    scores['eat'] = this._scoreEat();
    scores['investigate'] = this._scoreCuriosity();
    scores['execute_brain_goal'] = this._scoreBrainGoal();
    scores['idle'] = 10; // Baseline

    return scores;
  }

  _scoreFlee() {
    const threat = this.attention.getHighestThreat();
    if (!threat) return 0;
    
    // Low health + high threat = extreme utility
    const healthFactor = (20 - this.bot.health) * 2;
    return threat.threatLevel + healthFactor;
  }

  _scoreEat() {
    if (this.bot.food >= 18) return 0;
    const foodItems = this.bot.inventory.items().filter(i => ['bread', 'cooked_beef', 'apple', 'cooked_porkchop'].includes(i.name));
    if (foodItems.length === 0) return 0;

    // Starving = extreme utility
    if (this.bot.food <= 6) return 95;
    return (20 - this.bot.food) * 4; // Max 56 if food is 6
  }

  _scoreCuriosity() {
    const obj = this.attention.getHighestCuriosity();
    if (!obj) return 0;

    // If we're already full health and not hungry, curiosity can distract us
    return obj.curiosityScore; 
  }

  _scoreBrainGoal() {
    // The Brain's goal is the default high-priority task unless an emergency overrides it
    // Default score is 60. So a threat > 60 or hunger < 10 will interrupt it.
    return 60;
  }

  _getContextForAction(action) {
    if (action === 'flee') return { threat: this.attention.getHighestThreat() };
    if (action === 'investigate') return { target: this.attention.getHighestCuriosity() };
    if (action === 'execute_brain_goal') return { goal: this.brainGoal };
    return {};
  }
}

module.exports = UtilityDecisionEngine;
