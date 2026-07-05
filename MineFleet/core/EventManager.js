/**
 * core/EventManager.js
 *
 * Central event bus for the MineFleet platform. Modules and plugins
 * emit and listen to events through this manager, keeping components
 * decoupled from one another.
 */

class EventManager {
  constructor() {
    // Map of event names to arrays of listener functions
    this.listeners = {};
  }

  /**
   * Sets up the internal event bus.
   * Currently a stub — full implementation added in a later phase.
   */
  initialize() {
    console.log('[EventManager] Initialized');
  }
}

module.exports = EventManager;
