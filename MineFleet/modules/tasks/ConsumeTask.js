const Task = require('./Task');

class ConsumeTask extends Task {
  /**
   * @param {object} liveBot
   * @param {number} [priority=0]
   */
  constructor(liveBot, priority = 0) {
    super('consume_item', priority);
    this.bot = liveBot;
  }

  start() {
    super.start();
    
    this.bot.consume()
      .then(() => {
        this.complete();
      })
      .catch((err) => {
        this.fail(err.message);
      });
  }

  update() {}
}

module.exports = ConsumeTask;
