/**
 * DynamicUtilityNetwork.js (Phase 1)
 * 
 * Replaces the static UtilityDecisionEngine.
 * Computes scores dynamically from UtilityContext and PredictionSet.
 * Handles Personality biases.
 */

class DynamicUtilityNetwork {
  constructor() {}

  /**
   * @param {import('./Types').UtilityContext} context 
   * @param {import('./Types').PredictionSet} predictions 
   * @returns {string} The highest scoring action name
   */
  getBestAction(context, predictions) {
    const scores = this._computeBaseScores(context);
    
    this._applyPredictionAdjustments(scores, predictions);
    this._applyPersonalityBias(scores, context.personality);

    let bestAction = 'idle';
    let highestScore = -Infinity;

    for (const [action, score] of Object.entries(scores)) {
      if (score > highestScore) {
        highestScore = score;
        bestAction = action;
      }
    }

    // console.log(`[UtilityNetwork] Top Actions:`, Object.entries(scores).sort((a,b)=>b[1]-a[1]).slice(0,3));

    return bestAction;
  }

  _computeBaseScores(context) {
    const scores = {
      idle: 10,
      flee: 0,
      fight: 0,
      gather_resource: 0,
      investigate: 0,
      return_home: 0,
      eat: 0
    };

    // 1. Flee / Fight
    const threats = context.observation.threats;
    if (threats.length > 0) {
      // Find closest threat
      const closest = threats.sort((a,b) => a.dist - b.dist)[0];
      const dangerScore = Math.max(0, 100 - closest.dist * 3);
      
      if (context.observation.health < 10) {
        scores.flee = dangerScore + 50; // Low health -> flee
      } else {
        scores.fight = dangerScore; // High health -> fight
      }
    }

    // 2. Eat
    if (context.observation.food <= 6) {
      scores.eat = 90;
    } else if (context.observation.food < 18) {
      scores.eat = (20 - context.observation.food) * 2;
    }

    // 3. Investigate
    const curTarget = context.observation.interestingObjects;
    if (curTarget && curTarget.length > 0) {
      scores.investigate = 40; // Base score, modified by curiosity engine directly later
    }

    // 4. Tactical Goal
    if (context.tacticalGoal) {
      // Apply the tactical goal's priority to its corresponding action type
      if (scores[context.tacticalGoal.type] !== undefined) {
         scores[context.tacticalGoal.type] += context.tacticalGoal.priority;
      } else {
         scores[context.tacticalGoal.type] = context.tacticalGoal.priority;
      }
    }

    return scores;
  }

  _applyPredictionAdjustments(scores, predictions) {
    for (const signal of predictions.signals) {
      for (const [action, adjustment] of Object.entries(signal.suggestedActionAdjustments)) {
        if (scores[action] !== undefined) {
          scores[action] += (adjustment * signal.confidence * signal.urgency);
        } else {
          scores[action] = (adjustment * signal.confidence * signal.urgency);
        }
      }
    }
  }

  _applyPersonalityBias(scores, personality) {
    if (!personality) return;

    if (scores.flee !== undefined) scores.flee -= (personality.riskTolerance * 20);
    if (scores.fight !== undefined) scores.fight += (personality.combatAggressiveness * 20);
    if (scores.investigate !== undefined) scores.investigate += (personality.curiosity * 20);
    
    // Confidence slightly boosts the tactical goal
    if (scores.gather_resource !== undefined) scores.gather_resource += (personality.confidence * 10);
  }
}

module.exports = DynamicUtilityNetwork;
