/**
 * commands/MovementCommands.js
 *
 * Registers the four movement-related in-game commands with CommandManager.
 *
 * Commands:
 *   !goto <x> <y> <z>   — navigate to an absolute position
 *   !follow <player>     — follow a named player
 *   !stop                — halt all movement
 *   !look <x> <y> <z>   — rotate head to face a position
 *
 * Design rules enforced here:
 *   - Commands create Task objects and assign them via BotManager.
 *   - Commands NEVER call Mineflayer or pathfinder APIs directly.
 *   - Movement is mediated exclusively through MovementManager (via tasks).
 *
 * @param {CommandManager} commandManager — already-initialized CommandManager
 * @param {BotManager}     botManager     — already-initialized BotManager
 */

const GotoTask   = require('../modules/tasks/GotoTask');
const FollowTask = require('../modules/tasks/FollowTask');
const StopTask   = require('../modules/tasks/StopTask');
const LookAtTask = require('../modules/tasks/LookAtTask');

/**
 * Registers all movement commands. Call once during Application.initialize()
 * after both CommandManager and BotManager are ready.
 *
 * @param {CommandManager} commandManager
 * @param {BotManager}     botManager
 */
function registerMovementCommands(commandManager, botManager) {

  // ---------------------------------------------------------------------------
  // !goto <x> <y> <z>
  // ---------------------------------------------------------------------------
  commandManager.register(
    'goto',
    'Navigate the bot to coordinates: !goto <x> <y> <z>',
    (sender, args, bot) => {
      if (args.length < 3) {
        bot.chat('Usage: !goto <x> <y> <z>');
        return;
      }

      const [x, y, z] = args.map(Number);

      if ([x, y, z].some(isNaN)) {
        bot.chat('Invalid coordinates. Usage: !goto <x> <y> <z>');
        return;
      }

      const id = bot._minefleetId;
      const mm = botManager.getMovementManager(id);

      if (!mm) {
        bot.chat('Movement system not available.');
        return;
      }

      const task = new GotoTask(x, y, z, mm);
      botManager.assignTask(id, task);
      bot.chat(`Going to (${x}, ${y}, ${z})`);
    },
  );

  // ---------------------------------------------------------------------------
  // !follow <player>
  // ---------------------------------------------------------------------------
  commandManager.register(
    'follow',
    'Follow a player: !follow <player>',
    (sender, args, bot) => {
      if (args.length < 1) {
        bot.chat('Usage: !follow <player>');
        return;
      }

      const targetName = args[0];
      const playerEntry = bot.players[targetName];

      if (!playerEntry || !playerEntry.entity) {
        bot.chat(`Player "${targetName}" not found or not in range.`);
        return;
      }

      const id = bot._minefleetId;
      const mm = botManager.getMovementManager(id);

      if (!mm) {
        bot.chat('Movement system not available.');
        return;
      }

      const task = new FollowTask(playerEntry.entity, targetName, mm);
      botManager.assignTask(id, task);
      bot.chat(`Following ${targetName}`);
    },
  );

  // ---------------------------------------------------------------------------
  // !stop
  // ---------------------------------------------------------------------------
  commandManager.register(
    'stop',
    'Halt all bot movement: !stop',
    (_sender, _args, bot) => {
      const id = bot._minefleetId;
      const mm = botManager.getMovementManager(id);

      if (!mm) {
        bot.chat('Movement system not available.');
        return;
      }

      // StopTask has high priority (10) so it jumps any queued movement tasks
      const task = new StopTask(mm);
      botManager.assignTask(id, task);
      bot.chat('Stopping.');
    },
  );

  // ---------------------------------------------------------------------------
  // !look <x> <y> <z>
  // ---------------------------------------------------------------------------
  commandManager.register(
    'look',
    'Look at coordinates: !look <x> <y> <z>',
    (sender, args, bot) => {
      if (args.length < 3) {
        bot.chat('Usage: !look <x> <y> <z>');
        return;
      }

      const [x, y, z] = args.map(Number);

      if ([x, y, z].some(isNaN)) {
        bot.chat('Invalid coordinates. Usage: !look <x> <y> <z>');
        return;
      }

      const id = bot._minefleetId;
      const mm = botManager.getMovementManager(id);

      if (!mm) {
        bot.chat('Movement system not available.');
        return;
      }

      const task = new LookAtTask(x, y, z, mm);
      botManager.assignTask(id, task);
      bot.chat(`Looking at (${x}, ${y}, ${z})`);
    },
  );

  console.log('[MovementCommands] Registered: !goto, !follow, !stop, !look');
}

module.exports = registerMovementCommands;
