/**
 * ExperienceDatabase.js
 * 
 * Persistent storage for long-term memory.
 * Stores spatial/categorical records (deaths, combat, routes).
 * Exposes a query API for Nemotron (Strategic Planning) and the Tactical Planner.
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'experience_db.json');
const AUTO_SAVE_MS = 60_000;

class ExperienceDatabase {
  constructor(botName) {
    this.botName = botName;
    this._dirty = false;
    
    // Schema
    this.data = {
      records: [], // ExperienceRecord[]
    };

    this._load();
    this._saveTimer = setInterval(() => this.save(), AUTO_SAVE_MS);
  }

  _load() {
    try {
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        this.data = JSON.parse(raw);
        console.log(`[ExperienceDB][${this.botName}] Loaded ${this.data.records.length} records.`);
      }
    } catch (err) {
      console.error(`[ExperienceDB] Load error: ${err.message}`);
    }
  }

  save() {
    if (!this._dirty) return;
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(this.data, null, 2), 'utf-8');
      this._dirty = false;
    } catch (err) {
      console.error(`[ExperienceDB] Save error: ${err.message}`);
    }
  }

  shutdown() {
    if (this._saveTimer) {
      clearInterval(this._saveTimer);
      this._saveTimer = null;
    }
    this.save();
  }

  /**
   * Single entry point for all subsystems to log experience.
   * @param {import('./Types').ExperienceRecord} record 
   */
  recordExperience(record) {
    this.data.records.push({
      timestamp: Date.now(),
      ...record
    });
    this._dirty = true;
    
    // Trim if it gets too large
    if (this.data.records.length > 5000) {
      this.data.records.shift();
    }
  }

  // ─── Query API ───────────────────────────────────────────────────────────

  getNearbyMemories(pos, radius, categories = []) {
    return this.data.records.filter(r => {
      if (categories.length > 0 && !categories.includes(r.category)) return false;
      if (!r.location) return false;
      const dx = r.location.x - pos.x;
      const dz = r.location.z - pos.z;
      const dist = Math.sqrt(dx*dx + dz*dz);
      return dist <= radius;
    });
  }

  getDeathLocations() {
    return this.data.records.filter(r => r.category === 'death');
  }

  getMistakes() {
    return this.data.records.filter(r => r.lessonLearned !== null && r.lessonLearned !== undefined);
  }

  /**
   * For Nemotron's planning prompt. Returns a condensed string of important recent/local memories.
   */
  getStrategicContext(currentPos) {
    let ctx = "Long-Term Memory Snippets:\n";
    
    // Top 3 mistakes
    const mistakes = this.getMistakes().slice(-3);
    if (mistakes.length > 0) {
      ctx += "- Known Mistakes:\n" + mistakes.map(m => `  * ${m.details}: ${m.lessonLearned}`).join('\n') + "\n";
    }

    // Nearby danger
    if (currentPos) {
      const nearbyDeaths = this.getNearbyMemories(currentPos, 100, ['death']);
      if (nearbyDeaths.length > 0) {
        ctx += `- WARNING: You have died near your current location ${nearbyDeaths.length} times before.\n`;
      }
    }

    return ctx;
  }
}

module.exports = ExperienceDatabase;
