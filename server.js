// server.js — Main Node.js HTTP Server (no Express, built-in modules only)
require('dotenv').config();
const http = require('http');
const fs   = require('fs');
const path = require('path');

const { dispatch } = require('./routes/router');

const PORT      = parseInt(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

// MIME types for static file serving
const MIME = {
    '.html': 'text/html',
    '.css':  'text/css',
    '.js':   'application/javascript',
    '.json': 'application/json',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif':  'image/gif',
    '.svg':  'image/svg+xml',
    '.ico':  'image/x-icon',
    '.woff': 'font/woff',
    '.woff2':'font/woff2',
    '.ttf':  'font/ttf'
};

// Parse JSON body from a request
function parseBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => {
            body += chunk;
            if (body.length > 1e6) reject(new Error('Request too large')); // 1MB limit
        });
        req.on('end', () => {
            if (!body.trim()) return resolve({});
            try {
                resolve(JSON.parse(body));
            } catch {
                resolve({});
            }
        });
        req.on('error', reject);
    });
}

// Serve a static file
function serveStatic(res, filePath) {
    const ext  = path.extname(filePath).toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/html' });
            return res.end('<h1>404 Not Found</h1>');
        }
        res.writeHead(200, {
            'Content-Type': mime,
            'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=86400'
        });
        res.end(data);
    });
}

// Main request handler
const server = http.createServer(async (req, res) => {
    // CORS headers (development)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        return res.end();
    }

    // Route API requests
    if (req.url.startsWith('/api/')) {
        try {
            req.body = await parseBody(req);
        } catch {
            req.body = {};
        }
        return dispatch(req, res);
    }

    // Serve static files from /public
    let filePath = path.join(PUBLIC_DIR, req.url.split('?')[0]);

    // Default to index.html for directory requests
    if (filePath.endsWith('/') || !path.extname(filePath)) {
        const htmlPath = filePath.endsWith('/')
            ? path.join(filePath, 'index.html')
            : filePath + '.html';
        if (fs.existsSync(htmlPath)) return serveStatic(res, htmlPath);
        filePath = path.join(PUBLIC_DIR, 'index.html');
    }

    if (!fs.existsSync(filePath)) {
        filePath = path.join(PUBLIC_DIR, 'index.html');
    }

    serveStatic(res, filePath);
});

server.listen(PORT, () => {
    console.log(`\n🚖 Cab Booking Server running at http://localhost:${PORT}`);
    console.log(`   Environment : ${process.env.NODE_ENV || 'development'}`);
    console.log(`   Public Dir  : ${PUBLIC_DIR}\n`);
});

server.on('error', err => {
    if (err.code === 'EADDRINUSE') {
        console.error(`[Server] Port ${PORT} is already in use. Change PORT in .env`);
    } else {
        console.error('[Server] Error:', err.message);
    }
    process.exit(1);
});
