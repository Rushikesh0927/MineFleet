/**
 * core/PermissionManager.js
 *
 * Loads and persists config/permissions.json.
 * Single source of truth for all authorization checks.
 *
 * Permission hierarchy:
 *   Owner  → full access to everything, always
 *   Admin  → full access to everything
 *   Others → public commands only (help, ping, status)
 *
 * Public API:
 *   getOwner()                   — username of the owner
 *   isOwner(player)              — true if player is the owner
 *   isAdmin(player)              — true if player is in admins list
 *   hasPermission(player, cmd)   — authorization check
 *   addAdmin(player)             — add to admins list and save
 *   removeAdmin(player)          — remove from admins list and save
 */

const fs   = require('fs');
const path = require('path');

const PERMISSIONS_PATH = path.join(__dirname, '../config/permissions.json');

// Commands every player can always run regardless of role
const PUBLIC_COMMANDS = ['help', 'ping', 'status'];

class PermissionManager {
  constructor() {
    /** @type {{ owner: string, admins: string[], players: object }} */
    this.data = null;
  }

  /**
   * Loads permissions.json from disk.
   * Must be called before any other method.
   */
  initialize() {
    this._load();
    console.log(`[PermissionManager] Owner: ${this.data.owner} | Admins: ${this.data.admins.length}`);
    console.log('[PermissionManager] Initialized');
  }

  // ---------------------------------------------------------------------------
  // Getters
  // ---------------------------------------------------------------------------

  /**
   * Returns the owner username.
   * @returns {string}
   */
  getOwner() {
    return this.data.owner;
  }

  /**
   * Returns true if the player is the owner (case-sensitive).
   * @param {string} player
   * @returns {boolean}
   */
  isOwner(player) {
    return player === this.data.owner;
  }

  /**
   * Returns true if the player is in the admins list.
   * @param {string} player
   * @returns {boolean}
   */
  isAdmin(player) {
    return this.data.admins.includes(player);
  }

  /**
   * Checks whether a player is allowed to run a given command.
   *
   * Hierarchy:
   *   1. Owner  → always allowed
   *   2. Admin  → always allowed
   *   3. Others → only PUBLIC_COMMANDS
   *
   * @param {string} player      — in-game username
   * @param {string} permission  — command name (without "!")
   * @returns {boolean}
   */
  hasPermission(player, permission) {
    if (this.isOwner(player)) return true;
    if (this.isAdmin(player)) return true;
    return PUBLIC_COMMANDS.includes(permission);
  }

  // ---------------------------------------------------------------------------
  // Admin management
  // ---------------------------------------------------------------------------

  /**
   * Adds a player to the admins list and persists to disk.
   * @param {string} player
   */
  addAdmin(player) {
    if (this.isAdmin(player)) {
      console.log(`[PermissionManager] ${player} is already an admin.`);
      return;
    }
    this.data.admins.push(player);
    this._save();
    console.log(`[PermissionManager] Added admin: ${player}`);
  }

  /**
   * Removes a player from the admins list and persists to disk.
   * @param {string} player
   */
  removeAdmin(player) {
    const idx = this.data.admins.indexOf(player);
    if (idx === -1) {
      console.log(`[PermissionManager] ${player} is not an admin.`);
      return;
    }
    this.data.admins.splice(idx, 1);
    this._save();
    console.log(`[PermissionManager] Removed admin: ${player}`);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Reads and parses permissions.json.
   */
  _load() {
    const raw  = fs.readFileSync(PERMISSIONS_PATH, 'utf8');
    this.data  = JSON.parse(raw);

    // Guarantee required fields exist
    if (!this.data.owner)   this.data.owner   = '';
    if (!this.data.admins)  this.data.admins  = [];
    if (!this.data.players) this.data.players = {};
  }

  /**
   * Writes the current data object back to permissions.json.
   */
  _save() {
    fs.writeFileSync(PERMISSIONS_PATH, JSON.stringify(this.data, null, 2), 'utf8');
    console.log('[PermissionManager] Saved permissions.json');
  }
}

module.exports = PermissionManager;
