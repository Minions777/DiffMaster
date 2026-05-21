/**
 * Tests for server.js path-traversal protection and CSP headers.
 * Boots the server on a random port and probes it.
 * Run: node test-server.js
 */
const assert = require('assert');
const http = require('http');
const net = require('net');
const path = require('path');
const fs = require('fs');

// Patch http.createServer to capture the request handler from server.js
const original = http.createServer;
let capturedHandler = null;
http.createServer = function(handler) {
    capturedHandler = handler;
    const srv = original(handler);
    // Stub listen so requiring server.js doesn't bind to 8082
    srv.listen = () => srv;
    return srv;
};

// Stub console.log so server.js doesn't pollute test output
const origLog = console.log;
console.log = () => {};

require('./server.js');

console.log = origLog;
http.createServer = original;

assert.ok(capturedHandler, 'server.js did not register a request handler');

// Spin up a real server on an ephemeral port using the captured handler
const testServer = original(capturedHandler);
testServer.listen(0);
const port = testServer.address().port;

function fetch(urlPath) {
    return new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:${port}${urlPath}`, (res) => {
            let body = '';
            res.on('data', (c) => body += c);
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
        }).on('error', reject);
    });
}

// Raw-socket fetch — required for path-traversal tests because Node's
// http.get rewrites `/%2e%2e/x` to `/x` before sending. Real attackers
// use `curl --path-as-is` or raw HTTP, so we need to too.
function fetchRaw(rawPath) {
    return new Promise((resolve, reject) => {
        const sock = net.connect(port, '127.0.0.1', () => {
            sock.write(`GET ${rawPath} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n`);
        });
        let data = '';
        sock.on('data', (c) => data += c.toString('binary'));
        sock.on('end', () => {
            const headerEnd = data.indexOf('\r\n\r\n');
            const headBlock = data.slice(0, headerEnd);
            const body = data.slice(headerEnd + 4);
            const statusLine = headBlock.split('\r\n')[0];
            const status = parseInt(statusLine.split(' ')[1], 10);
            resolve({ status, body });
        });
        sock.on('error', reject);
    });
}

(async () => {
    try {
        // Test 1: serves index.html at /
        const root = await fetch('/');
        assert.strictEqual(root.status, 200);
        assert.match(root.headers['content-type'] || '', /text\/html/);
        assert.ok(root.body.includes('DiffMaster'), 'index.html should contain DiffMaster');

        // Test 2: security headers present
        assert.strictEqual(root.headers['x-content-type-options'], 'nosniff');
        assert.strictEqual(root.headers['x-frame-options'], 'DENY');
        assert.strictEqual(root.headers['referrer-policy'], 'strict-origin-when-cross-origin');

        // Test 3: CSP header present and strict
        const csp = root.headers['content-security-policy'];
        assert.ok(csp, 'CSP header should be set');
        assert.ok(csp.includes("default-src 'self'"), 'CSP should default to self');
        assert.ok(csp.includes("script-src 'self' https://cdn.jsdelivr.net"),
            'script-src should allow self + jsdelivr');
        assert.ok(csp.includes("frame-ancestors 'none'"), 'frame-ancestors none required');
        assert.ok(csp.includes("object-src 'none'"), 'object-src none required');
        assert.ok(!csp.includes("'unsafe-eval'"), 'CSP must not allow unsafe-eval');
        // script-src must NOT contain unsafe-inline (style-src may)
        const scriptMatch = csp.match(/script-src[^;]*/);
        assert.ok(scriptMatch, 'script-src directive should exist');
        assert.ok(!scriptMatch[0].includes("'unsafe-inline'"),
            "script-src must not allow 'unsafe-inline'");

        // Test 4: path traversal blocked – literal ../
        const traversal1 = await fetchRaw('/../package.json');
        assert.ok(traversal1.status === 403 || traversal1.status === 404,
            'literal traversal should be blocked, got ' + traversal1.status);

        // Test 5: path traversal blocked – percent-encoded ../
        const traversal2 = await fetchRaw('/%2e%2e/server.js');
        assert.ok(traversal2.status === 403,
            'encoded traversal should return 403, got ' + traversal2.status);
        assert.ok(!traversal2.body.includes('http.createServer'),
            'response must not leak server.js source');

        // Test 6: deeper encoded traversal blocked
        const traversal3 = await fetchRaw('/foo/%2e%2e/%2e%2e/server.js');
        assert.ok(traversal3.status === 403,
            'nested encoded traversal should be blocked, got ' + traversal3.status);

        // Test 7: 404 for missing files
        const notFound = await fetch('/no-such-file.xyz');
        assert.strictEqual(notFound.status, 404);

        // Test 8: serves js files with correct mime
        if (fs.existsSync(path.resolve(__dirname, 'js/app.js'))) {
            const jsFile = await fetch('/js/app.js');
            assert.strictEqual(jsFile.status, 200);
            assert.match(jsFile.headers['content-type'] || '', /javascript/);
        }

        console.log('All server tests passed.');
    } catch (e) {
        console.error('Server test failed:', e);
        process.exitCode = 1;
    } finally {
        testServer.close();
    }
})();
