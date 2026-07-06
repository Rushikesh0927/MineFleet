const Task = require('./Task');

class EquipTask extends Task {
  /**
   * @param {object} liveBot
   * @param {string} destination - e.g. 'head', 'torso', 'legs', 'feet', 'hand', 'off-hand'
   * @param {number} itemId - the Mineflayer internal item ID to equip
   * @param {number} [priority=0]
   */
  constructor(liveBot, destination, itemId, priority = 0) {
    super(`equip(${destination})`, priority);
    this.bot = liveBot;
    this.destination = destination;
    this.itemId = itemId;
  }

  start() {
    super.start();
    
    // Equip task needs to resolve the item object from the id
    // We could pass the item ID and equip it.
    this.bot.equip(this.itemId, this.destination)
      .then(() => {
        this.complete();
      })
      .catch((err) => {
        this.fail(err.message);
      });
  }

  update() {}
}

module.exports = EquipTask;
