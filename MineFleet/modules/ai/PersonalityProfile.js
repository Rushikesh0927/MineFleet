/**
 * PersonalityProfile.js
 * 
 * Manages slowly drifting personality traits for the bot.
 * Ensures no two bot instances behave identically.
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const FILE = path.join(DATA_DIR, 'personality.json');

class PersonalityProfile {
  constructor(botName) {
    this.botName = botName;
    
    // Default traits (0.0 to 1.0)
    /** @type {import('./Types').PersonalityProfile} */
    this.traits = {
      riskTolerance: 0.5,
      explorationTendency: 0.5,
      combatAggressiveness: 0.5,
      curiosity: 0.5,
      confidence: 0.5
    };

    this._loadOrSeed();
  }

  _loadOrSeed() {
    try {
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
      if (fs.existsSync(FILE)) {
        const raw = fs.readFileSync(FILE, 'utf-8');
        this.traits = JSON.parse(raw);
        console.log(`[Personality] Loaded existing traits: Risk=${this.traits.riskTolerance.toFixed(2)}, Curiosity=${this.traits.curiosity.toFixed(2)}`);
      } else {
        // Seed with random noise (+/- 0.2 from 0.5) so fleets diverge
        for (const key of Object.keys(this.traits)) {
          this.traits[key] = 0.3 + (Math.random() * 0.4);
        }
        this._save();
        console.log(`[Personality] Seeded new traits: Risk=${this.traits.riskTolerance.toFixed(2)}, Curiosity=${this.traits.curiosity.toFixed(2)}`);
      }
    } catch (err) {
      console.error(`[Personality] Init error: ${err.message}`);
    }
  }

  _save() {
    try {
      fs.writeFileSync(FILE, JSON.stringify(this.traits, null, 2), 'utf-8');
    } catch (e) {}
  }

  /**
   * Drifts a trait slowly based on an event.
   * @param {'riskTolerance'|'explorationTendency'|'combatAggressiveness'|'curiosity'|'confidence'} trait 
   * @param {number} delta - e.g. +0.02 or -0.05
   */
  drift(trait, delta) {
    if (this.traits[trait] !== undefined) {
      this.traits[trait] += delta;
      // Clamp between 0.05 and 0.95
      this.traits[trait] = Math.max(0.05, Math.min(0.95, this.traits[trait]));
      this._save();
    }
  }

  get() {
    return this.traits;
  }
}

module.exports = PersonalityProfile;
