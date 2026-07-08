/**
 * SelfEvaluator.js (Phase 8)
 * 
 * Periodically checks if the bot is stuck, looping, or repeating mistakes.
 */

class SelfEvaluator {
  constructor(experienceDb) {
    this.experienceDb = experienceDb;
    this.actionHistory = [];
  }

  logAction(action) {
    this.actionHistory.push({ action, time: Date.now() });
    if (this.actionHistory.length > 20) {
      this.actionHistory.shift();
    }
  }

  /**
   * Called every few seconds.
   * @returns {boolean} True if the bot should force a new strategic plan.
   */
  checkProgress() {
    if (this.actionHistory.length < 10) return false;

    // Check for rapid oscillation (e.g. walk -> mine -> walk -> mine in 2 seconds)
    const recent = this.actionHistory.slice(-5);
    const timespan = recent[recent.length - 1].time - recent[0].time;
    
    if (timespan < 5000) {
      // If we've done 5 actions in 5 seconds and they alternate, we are stuck in a loop
      const uniqueActions = new Set(recent.map(a => a.action)).size;
      if (uniqueActions <= 2) {
        console.warn(`[SelfEvaluator] Detected oscillation/stuck loop. Forcing plan invalidation.`);
        return true;
      }
    }

    return false;
  }
}

module.exports = SelfEvaluator;
