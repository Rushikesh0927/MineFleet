const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const conn = new Client();

console.log('[Deploy] Connecting to VPS...');

conn.on('ready', () => {
  console.log('[Deploy] SSH Connection established.');

  const commands = [
    // 1. Install Node.js & Git
    'curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -',
    'sudo apt-get install -y nodejs git',
    
    // 2. Clone the repository
    'rm -rf MineFleet', // Clean up just in case
    'git clone https://github.com/Rushikesh0927/MineFleet.git',
    
    // 3. Setup MineFleet
    'cd MineFleet/MineFleet && npm install',
  ];

  const execCommand = (index) => {
    if (index >= commands.length) {
      console.log('[Deploy] Base commands executed successfully.');
      uploadEnv();
      return;
    }

    const cmd = commands[index];
    console.log(`[Deploy] Executing: ${cmd}`);

    conn.exec(cmd, (err, stream) => {
      if (err) throw err;
      
      stream.on('close', (code, signal) => {
        console.log(`[Deploy] Command finished with code ${code}`);
        if (code !== 0) {
          console.error(`[Deploy] Error running command. Aborting.`);
          conn.end();
          return;
        }
        execCommand(index + 1);
      }).on('data', (data) => {
        process.stdout.write(data);
      }).stderr.on('data', (data) => {
        process.stderr.write(data);
      });
    });
  };

  const uploadEnv = () => {
    console.log('[Deploy] Uploading local .env file...');
    conn.sftp((err, sftp) => {
      if (err) throw err;
      
      const localEnvPath = path.join(__dirname, '.env');
      const remoteEnvPath = '/home/rushi/MineFleet/MineFleet/.env';
      
      if (fs.existsSync(localEnvPath)) {
        sftp.fastPut(localEnvPath, remoteEnvPath, (err) => {
          if (err) throw err;
          console.log('[Deploy] .env uploaded successfully.');
          startServer();
        });
      } else {
        console.log('[Deploy] No local .env file found. Skipping upload.');
        startServer();
      }
    });
  };

  const startServer = () => {
    console.log('[Deploy] Starting MineFleet Server using PM2/nohup...');
    
    // Install pm2 globally so the server runs in the background
    const startCmd = 'sudo npm install -g pm2 && cd MineFleet/MineFleet && pm2 start index.js --name MineFleet';
    
    conn.exec(startCmd, (err, stream) => {
      if (err) throw err;
      
      stream.on('close', (code, signal) => {
        console.log(`[Deploy] Server started with code ${code}`);
        console.log('[Deploy] Deployment Complete!');
        conn.end();
      }).on('data', (data) => {
        process.stdout.write(data);
      }).stderr.on('data', (data) => {
        process.stderr.write(data);
      });
    });
  };

  // Start the execution chain
  execCommand(0);

}).on('error', (err) => {
  console.error('[Deploy] SSH Connection Error:', err);
}).connect({
  host: 'localhost',
  port: 2222,
  username: 'rushi',
  password: 'rushi1928'
});
