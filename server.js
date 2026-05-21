const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve('.');
const mime = {
    html: 'text/html; charset=utf-8',
    css: 'text/css; charset=utf-8',
    js: 'application/javascript; charset=utf-8',
    json: 'application/json; charset=utf-8',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    ico: 'image/x-icon',
    woff: 'font/woff',
    woff2: 'font/woff2',
    ttf: 'font/ttf',
};

const securityHeaders = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Content-Security-Policy': [
        "default-src 'self'",
        "script-src 'self' https://cdn.jsdelivr.net",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "font-src 'self' data:",
        "connect-src 'self'",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "object-src 'none'",
    ].join('; '),
};

const s = http.createServer((req, res) => {
    let urlPath;
    try {
        urlPath = decodeURIComponent(req.url.split('?')[0]);
    } catch {
        res.writeHead(400, securityHeaders);
        res.end('Bad Request');
        return;
    }

    // Reject any path traversal segments before normalization. path.normalize
    // collapses `..` against the URL root, which can mask a traversal attempt
    // by leaving a request inside ROOT but accessing files the server
    // shouldn't expose. Hard-fail instead.
    const segments = urlPath.split(/[\\/]/);
    if (segments.includes('..') || urlPath.includes('\0')) {
        res.writeHead(403, securityHeaders);
        res.end('Forbidden');
        return;
    }

    let safePath = path.normalize(urlPath);
    safePath = safePath.replace(/\\/g, '/');
    const isRoot = safePath === '/' || safePath === '\\';
    let f = isRoot ? 'index.html' : safePath;
    f = path.join(ROOT, ...f.split('/').filter(Boolean));

    const resolved = path.resolve(f);
    if (resolved !== ROOT && !resolved.startsWith(ROOT + path.sep)) {
        res.writeHead(403, securityHeaders);
        res.end('Forbidden');
        return;
    }

    const ext = path.extname(resolved).slice(1).toLowerCase();
    try {
        const d = fs.readFileSync(resolved);
        res.writeHead(200, {
            'Content-Type': mime[ext] || 'application/octet-stream',
            ...securityHeaders,
        });
        res.end(d);
    } catch {
        res.writeHead(404, securityHeaders);
        res.end('Not Found');
    }
});

s.listen(8082);
console.log('http://localhost:8082');
