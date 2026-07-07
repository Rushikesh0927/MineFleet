const dns = require('dns');
const net = require('net');

console.log('=== DNS Diagnostics ===');

dns.resolveSrv('_minecraft._tcp.rushi161928.aternos.me', (e, r) => {
  console.log('SRV lookup:', e ? 'FAIL: ' + e.message : JSON.stringify(r));
});

dns.resolve4('rushi161928.aternos.me', (e, r) => {
  console.log('A record rushi161928.aternos.me:', e ? 'FAIL: ' + e.message : r);
});

dns.resolve4('crappie.aternos.host', (e, r) => {
  console.log('A record crappie.aternos.host:', e ? 'FAIL: ' + e.message : r);
});

// Test direct TCP connection to port 17552
setTimeout(() => {
  console.log('\n=== TCP connection test to crappie.aternos.host:17552 ===');
  const sock = new net.Socket();
  sock.setTimeout(5000);
  sock.connect(17552, 'crappie.aternos.host', () => {
    console.log('TCP CONNECT SUCCESS to crappie.aternos.host:17552!');
    sock.destroy();
  });
  sock.on('error', (e) => console.log('TCP FAIL:', e.message));
  sock.on('timeout', () => { console.log('TCP TIMEOUT'); sock.destroy(); });
}, 500);
