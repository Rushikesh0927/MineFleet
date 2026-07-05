/**
 * index.js
 *
 * MineFleet - Open Source Minecraft Multi Bot Platform
 * Entry point of the application.
 *
 * Prints the startup banner, then delegates all initialization
 * to the Application class which boots each core manager in order.
 */

const Application = require('./core/Application');

console.log('=================================');
console.log('MineFleet v0.1.0');
console.log('Minecraft Multi Bot Platform');
console.log('Initializing...');
console.log('=================================');

const app = new Application();
app.initialize();

console.log('MineFleet Started Successfully');
