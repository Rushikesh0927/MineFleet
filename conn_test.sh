#!/bin/bash
echo "=== Testing TCP to crappie.aternos.host:17552 ==="
timeout 5 bash -c 'cat < /dev/null > /dev/tcp/crappie.aternos.host/17552' 2>&1 && echo "TCP CONNECTION OK!" || echo "TCP FAILED - port not reachable"

echo ""
echo "=== DNS A record for crappie.aternos.host ==="
nslookup crappie.aternos.host 2>&1 || host crappie.aternos.host 2>&1 || getent hosts crappie.aternos.host 2>&1

echo ""
echo "=== SRV record for Minecraft ==="
nslookup -type=SRV _minecraft._tcp.rushi161928.aternos.me 2>&1 | head -20
