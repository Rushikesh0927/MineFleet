/**
 * index.js
 *
 * MineFleet - Open Source Minecraft Multi Bot Platform
 * Entry point of the application.
 *
 * Prints the startup banner, boots the platform through Application,
 * and wires OS shutdown signals (SIGINT, SIGTERM) to a graceful shutdown.
 */

require('dotenv').config();
const Application = require('./core/Application');

console.log('=================================');
console.log('MineFleet v0.1.0');
console.log('Minecraft Multi Bot Platform');
console.log('Initializing...');
console.log('=================================');

const app = new Application();
app.initialize();

console.log('MineFleet Started Successfully');

// --- Graceful shutdown on OS signals ---------------------------------------

process.on('SIGINT',  () => app.shutdown());
process.on('SIGTERM', () => app.shutdown());
