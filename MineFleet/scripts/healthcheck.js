/**
 * scripts/healthcheck.js
 *
 * MineFleet Health Check Script
 *
 * Tests every Dashboard REST API endpoint and reports PASS / FAIL per route.
 * Assumes the Dashboard API is running on http://localhost:3000.
 *
 * Usage:
 *   npm run healthcheck
 */

const http = require('http');

const BASE_URL = 'http://localhost:3000';

const ENDPOINTS = [
  { method: 'GET', path: '/' },
  { method: 'GET', path: '/health' },
  { method: 'GET', path: '/api/bots' },
  { method: 'GET', path: '/api/plugins' },
  { method: 'GET', path: '/api/config' },
];

/**
 * Makes a single HTTP GET request and resolves with the status code.
 *
 * @param {string} url — full URL to request
 * @returns {Promise<number>} — HTTP status code
 */
function request(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      // Drain the response body so the socket closes cleanly
      res.resume();
      resolve(res.statusCode);
    });

    req.on('error', reject);

    // Treat responses that take longer than 5 seconds as a failure
    req.setTimeout(5000, () => {
      req.destroy(new Error('Request timed out'));
    });
  });
}

/**
 * Runs every endpoint check in sequence and prints results.
 */
async function runHealthCheck() {
  console.log('');
  console.log('MineFleet Health Check');
  console.log('======================');
  console.log(`Target: ${BASE_URL}`);
  console.log('');

  let passed = 0;
  let failed = 0;

  for (const endpoint of ENDPOINTS) {
    const url = `${BASE_URL}${endpoint.path}`;

    try {
      const statusCode = await request(url);
      const ok = statusCode >= 200 && statusCode < 300;

      if (ok) {
        console.log(`  ✓ PASS  ${endpoint.method} ${endpoint.path}  (HTTP ${statusCode})`);
        passed++;
      } else {
        console.log(`  ✗ FAIL  ${endpoint.method} ${endpoint.path}  (HTTP ${statusCode})`);
        failed++;
      }
    } catch (err) {
      console.log(`  ✗ FAIL  ${endpoint.method} ${endpoint.path}  (${err.message})`);
      failed++;
    }
  }

  console.log('');
  console.log('----------------------');
  console.log(`  Passed: ${passed} / ${ENDPOINTS.length}`);
  console.log('----------------------');
  console.log('');

  if (failed === 0) {
    console.log('Health Check Passed');
    process.exit(0);
  } else {
    console.log('Health Check Failed');
    process.exit(1);
  }
}

runHealthCheck();
