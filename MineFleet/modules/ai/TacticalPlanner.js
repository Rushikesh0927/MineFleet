/**
 * TacticalPlanner.js (Phase 10)
 * 
 * Sits between Nemotron's high-level Strategic Goal and the DynamicUtilityNetwork.
 * Updates every few seconds to feed the "objective" into the UtilityContext.
 */

class TacticalPlanner {
  constructor(experienceDb) {
    this.experienceDb = experienceDb;
    this.strategicGoal = null; // String from Nemotron
    
    /** @type {import('./Types').TacticalGoal} */
    this.currentTacticalGoal = null;
  }

  setStrategicGoal(goalStr) {
    this.strategicGoal = goalStr;
  }

  tick(observation) {
    if (!this.strategicGoal) return;

    // A simple mapping from strategic goal to tactical goal
    // In a full implementation, this queries the ExperienceDB for optimal routes/areas
    
    let targetType = 'idle';
    let priority = 50;

    if (this.strategicGoal === 'gather_wood') {
      targetType = 'gather_resource';
      priority = 60;
    } else if (this.strategicGoal === 'explore') {
      targetType = 'explore_structure';
      priority = 40;
    }

    this.currentTacticalGoal = {
      id: `tac_${Date.now()}`,
      type: targetType,
      targetParams: this.strategicGoal,
      priority
    };
  }

  getGoal() {
    return this.currentTacticalGoal;
  }
}

module.exports = TacticalPlanner;
