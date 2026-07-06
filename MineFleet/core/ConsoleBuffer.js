/**
 * core/ConsoleBuffer.js
 *
 * Centralized, in-memory event buffer for Phase 2.3 Live Console.
 * Stores structured events and enforces a maximum capacity.
 * 
 * Events take the shape:
 * {
 *   id: number,
 *   timestamp: string,
 *   botUsername: string,
 *   category: 'Errors' | 'Commands' | 'Movement' | 'Reconnect' | 'Plugins' | 'All',
 *   message: string,
 *   severity: 'info' | 'warn' | 'error'
 * }
 */

const MAX_ENTRIES = 1000;

class ConsoleBuffer {
  constructor() {
    this.buffer = [];
    this._nextId = 1;
  }

  /**
   * Pushes a new structured event into the buffer.
   * 
   * @param {string} botUsername 
   * @param {string} category 
   * @param {string} message 
   * @param {'info'|'warn'|'error'} severity 
   */
  pushEvent(botUsername, category, message, severity = 'info') {
    const entry = {
      id: this._nextId++,
      timestamp: new Date().toISOString(),
      botUsername: botUsername || 'System',
      category: category || 'All',
      message,
      severity
    };

    this.buffer.push(entry);

    if (this.buffer.length > MAX_ENTRIES) {
      this.buffer.shift();
    }
  }

  /**
   * Retrieves events that have an ID strictly greater than `lastId`.
   * If `lastId` is 0 or not provided, returns up to the last 200 events.
   * 
   * @param {number} lastId
   * @returns {Array} 
   */
  getEventsSince(lastId = 0) {
    if (lastId <= 0) {
      return this.buffer.slice(-200);
    }
    
    // Find the first event with id > lastId
    const startIndex = this.buffer.findIndex(e => e.id > lastId);
    
    if (startIndex === -1) {
      return []; // No new events
    }
    
    return this.buffer.slice(startIndex);
  }
}

// Export a singleton instance
module.exports = new ConsoleBuffer();
