const Task = require('./Task');

class MoveItemTask extends Task {
  /**
   * @param {object} liveBot
   * @param {number} sourceSlot
   * @param {number} destSlot
   * @param {number} [priority=0]
   */
  constructor(liveBot, sourceSlot, destSlot, priority = 0) {
    super(`move_item(${sourceSlot}->${destSlot})`, priority);
    this.bot = liveBot;
    this.sourceSlot = sourceSlot;
    this.destSlot = destSlot;
  }

  start() {
    super.start();
    
    // Perform the async move action
    this.bot.moveSlotItem(this.sourceSlot, this.destSlot)
      .then(() => {
        this.complete();
      })
      .catch((err) => {
        this.fail(err.message);
      });
  }

  update() {
    // waiting for promise to resolve
  }
}

module.exports = MoveItemTask;
