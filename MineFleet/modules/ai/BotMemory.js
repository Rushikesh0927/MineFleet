/**
 * BotMemory.js
 *
 * Persistent memory system for the AI bot.
 * Saves experiences, learned lessons, and skill progress to disk.
 * Survives PM2 restarts — the bot never forgets.
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const MEMORY_FILE = path.join(DATA_DIR, 'bot_memory.json');
const AUTO_SAVE_MS = 60_000; // auto-save every 60 seconds
const MAX_EXPERIENCES = 100;
const MAX_LESSONS = 50;

class BotMemory {
  constructor(botName) {
    this.botName = botName;
    this._dirty = false;
    this._saveTimer = null;

    // Memory structure
    this.data = {
      botName,
      createdAt: new Date().toISOString(),
      lastSaved: null,

      // Raw experiences: what happened during gameplay
      experiences: [],

      // Distilled lessons: key takeaways the bot learned
      learnedLessons: [],

      // Track which skills the bot has tried and how well they went
      skills: {
        woodChopping: { attempts: 0, successes: 0 },
        stoneMining: { attempts: 0, successes: 0 },
        crafting: { attempts: 0, successes: 0 },
        combat: { attempts: 0, successes: 0 },
        farming: { attempts: 0, successes: 0 },
        building: { attempts: 0, successes: 0 },
        exploring: { attempts: 0, successes: 0 },
        cooking: { attempts: 0, successes: 0 },
      },

      // Current goal tracking
      currentGoal: null,
      completedGoals: [],

      // Stats
      totalActions: 0,
      deaths: 0,
      chatResponses: 0,
    };

    // Load existing memory from disk
    this._load();

    // Start auto-save
    this._saveTimer = setInterval(() => this.save(), AUTO_SAVE_MS);
    console.log(`[BotMemory][${botName}] Memory system initialized (${this.data.experiences.length} experiences, ${this.data.learnedLessons.length} lessons)`);
  }

  // ─── Load from disk ──────────────────────────────────────────────────────

  _load() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      if (fs.existsSync(MEMORY_FILE)) {
        const raw = fs.readFileSync(MEMORY_FILE, 'utf-8');
        const loaded = JSON.parse(raw);
        // Merge loaded data with defaults (so new fields are always present)
        this.data = { ...this.data, ...loaded };
        console.log(`[BotMemory][${this.botName}] Loaded memory: ${this.data.experiences.length} experiences, ${this.data.learnedLessons.length} lessons, ${this.data.totalActions} total actions`);
      } else {
        console.log(`[BotMemory][${this.botName}] No existing memory found — starting fresh`);
      }
    } catch (err) {
      console.error(`[BotMemory][${this.botName}] Failed to load memory: ${err.message}`);
    }
  }

  // ─── Save to disk ────────────────────────────────────────────────────────

  save() {
    if (!this._dirty) return;
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      this.data.lastSaved = new Date().toISOString();
      fs.writeFileSync(MEMORY_FILE, JSON.stringify(this.data, null, 2), 'utf-8');
      this._dirty = false;
    } catch (err) {
      console.error(`[BotMemory][${this.botName}] Save failed: ${err.message}`);
    }
  }

  // ─── Shutdown (stop auto-save + flush) ───────────────────────────────────

  shutdown() {
    if (this._saveTimer) {
      clearInterval(this._saveTimer);
      this._saveTimer = null;
    }
    this._dirty = true;
    this.save();
    console.log(`[BotMemory][${this.botName}] Memory saved and shutdown`);
  }

  // ─── Record an experience ────────────────────────────────────────────────

  addExperience(action, result, success = true) {
    this.data.experiences.push({
      time: new Date().toISOString(),
      action,
      result: typeof result === 'string' ? result.slice(0, 200) : String(result),
      success,
    });

    // Trim old experiences
    if (this.data.experiences.length > MAX_EXPERIENCES) {
      this.data.experiences = this.data.experiences.slice(-MAX_EXPERIENCES);
    }

    this.data.totalActions++;
    this._dirty = true;
  }

  // ─── Record a learned lesson ─────────────────────────────────────────────

  addLesson(lesson) {
    // Avoid duplicate lessons
    const existing = this.data.learnedLessons.find(l => l.lesson === lesson);
    if (existing) {
      existing.reinforced = (existing.reinforced || 1) + 1;
      existing.lastSeen = new Date().toISOString();
    } else {
      this.data.learnedLessons.push({
        lesson,
        learnedAt: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
        reinforced: 1,
      });
    }

    if (this.data.learnedLessons.length > MAX_LESSONS) {
      // Keep the most reinforced lessons
      this.data.learnedLessons.sort((a, b) => (b.reinforced || 1) - (a.reinforced || 1));
      this.data.learnedLessons = this.data.learnedLessons.slice(0, MAX_LESSONS);
    }

    this._dirty = true;
  }

  // ─── Track skill usage ───────────────────────────────────────────────────

  trackSkill(skillName, success) {
    if (this.data.skills[skillName]) {
      this.data.skills[skillName].attempts++;
      if (success) this.data.skills[skillName].successes++;
      this._dirty = true;
    }
  }

  // ─── Record death ────────────────────────────────────────────────────────

  recordDeath(cause) {
    this.data.deaths++;
    this.addExperience('died', cause, false);
    this.addLesson(`Died because: ${cause}. Avoid this situation.`);
  }

  // ─── Goal management ─────────────────────────────────────────────────────

  setGoal(goal) {
    this.data.currentGoal = {
      goal,
      startedAt: new Date().toISOString(),
      steps: [],
    };
    this._dirty = true;
  }

  addGoalStep(step, result) {
    if (this.data.currentGoal) {
      this.data.currentGoal.steps.push({ step, result, at: new Date().toISOString() });
      this._dirty = true;
    }
  }

  completeGoal() {
    if (this.data.currentGoal) {
      this.data.currentGoal.completedAt = new Date().toISOString();
      this.data.completedGoals.push(this.data.currentGoal);
      if (this.data.completedGoals.length > 20) {
        this.data.completedGoals = this.data.completedGoals.slice(-20);
      }
      this.data.currentGoal = null;
      this._dirty = true;
    }
  }

  // ─── Get context for AI prompt ───────────────────────────────────────────

  /**
   * Returns a compact string of the bot's memory for injection into the AI prompt.
   * Keeps it short to fit within token limits.
   */
  getContextForPrompt() {
    const parts = [];

    // Recent experiences (last 5)
    const recentExp = this.data.experiences.slice(-5);
    if (recentExp.length > 0) {
      parts.push('RECENT ACTIONS:\n' + recentExp.map(e =>
        `- ${e.action} → ${e.result} (${e.success ? '✓' : '✗'})`
      ).join('\n'));
    }

    // Top lessons (most reinforced, max 5)
    const topLessons = [...this.data.learnedLessons]
      .sort((a, b) => (b.reinforced || 1) - (a.reinforced || 1))
      .slice(0, 5);
    if (topLessons.length > 0) {
      parts.push('LEARNED LESSONS:\n' + topLessons.map(l => `- ${l.lesson}`).join('\n'));
    }

    // Current goal
    if (this.data.currentGoal) {
      const steps = this.data.currentGoal.steps.slice(-3);
      parts.push(`CURRENT GOAL: ${this.data.currentGoal.goal}\nProgress: ${steps.map(s => s.step).join(' → ') || 'just started'}`);
    }

    // Skill summary
    const skillLines = Object.entries(this.data.skills)
      .filter(([_, v]) => v.attempts > 0)
      .map(([k, v]) => `${k}: ${v.successes}/${v.attempts}`);
    if (skillLines.length > 0) {
      parts.push('SKILLS: ' + skillLines.join(', '));
    }

    // Stats
    parts.push(`STATS: ${this.data.totalActions} actions | ${this.data.deaths} deaths | ${this.data.completedGoals.length} goals completed`);

    return parts.join('\n\n');
  }
}

module.exports = BotMemory;
