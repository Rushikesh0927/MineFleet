const Task = require('./Task');

class DropTask extends Task {
  /**
   * @param {object} liveBot
   * @param {number} slotId - The slot ID of the item to drop
   * @param {number} [count] - The amount to drop, defaults to full stack
   * @param {number} [priority=0]
   */
  constructor(liveBot, slotId, count, priority = 0) {
    super(`drop_item(slot:${slotId})`, priority);
    this.bot = liveBot;
    this.slotId = slotId;
    this.count = count;
  }

  start() {
    super.start();
    
    const item = this.bot.inventory.slots[this.slotId];
    if (!item) {
      this.fail("No item found in that slot");
      return;
    }

    let promise;
    if (this.count && this.count < item.count) {
      promise = this.bot.toss(item.type, item.metadata, this.count);
    } else {
      promise = this.bot.tossStack(item);
    }

    promise
      .then(() => {
        this.complete();
      })
      .catch((err) => {
        this.fail(err.message);
      });
  }

  update() {}
}

module.exports = DropTask;
