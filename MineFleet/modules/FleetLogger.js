/**
 * modules/FleetLogger.js
 *
 * Thin logging helper for Phase 2.1 Fleet Management actions.
 *
 * All output goes through console.log so it is automatically captured
 * by the log ring-buffer interceptor installed in DashboardServer and
 * visible at GET /api/logs.
 *
 * Log line format (mirrors the BotEngine diagnostic style):
 *   [Fleet] <ISO-timestamp> | <username> | action=<ACTION> | result=<ok|fail> [| <extra>]
 */

/**
 * Logs a fleet management action with a timestamp.
 *
 * @param {string} action    — Action name in UPPER_CASE (e.g. START, STOP, RENAME)
 * @param {string} botId     — Internal bot ID (e.g. bot-1)
 * @param {string} username  — Display username of the bot
 * @param {'ok'|'fail'} result
 * @param {object} [extra]   — Optional key/value pairs appended to the log line
 */
function fleetLog(action, botId, username, result, extra = {}) {
  const ts = new Date().toISOString();

  let line = `[Fleet] ${ts} | ${username || botId} | action=${action} | result=${result}`;

  for (const [k, v] of Object.entries(extra)) {
    line += ` | ${k}=${v}`;
  }

  console.log(line);
}

module.exports = { fleetLog };
