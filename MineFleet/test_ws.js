const WebSocket = require('ws');

console.log('Connecting to WS...');
const ws = new WebSocket('ws://localhost:3000/?serverId=local-server');

ws.on('open', () => {
  console.log('Connected! Listening for 5 seconds...');
  setTimeout(() => {
    console.log('Abruptly terminating WS connection...');
    ws.terminate();
    process.exit(0);
  }, 5000);
});

ws.on('message', (data) => {
  const msg = JSON.parse(data);
  console.log(`Received ${msg.type}`);
});

ws.on('error', console.error);
