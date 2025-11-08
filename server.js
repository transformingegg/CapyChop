const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve a public folder if the user moves assets there
app.use(express.static(path.join(__dirname, 'public')));

// Also serve existing asset directories/names so current repo layout keeps working
app.use('/images', express.static(path.join(__dirname, 'images')));
app.use('/Audio', express.static(path.join(__dirname, 'Audio')));
app.use(express.static(path.join(__dirname)));

// Fallback to index.html for SPA-style routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🎮 CapyChop Node server listening on http://localhost:${PORT}`);
  console.log('Serving static assets from:', __dirname);
});

module.exports = app;
const fs = require('fs');
const path = require('path');

// For local development
if (require.main === module) {
    const http = require('http');
    const PORT = 3000;
    
    const server = http.createServer((req, res) => {
        handler(req, res);
    });
    
    server.listen(PORT, () => {
        console.log(`🎮 CapyChop server running at http://localhost:${PORT}/`);
        console.log(`📂 Serving files from: ${__dirname}`);
        console.log(`Press Ctrl+C to stop the server`);
    });
}

// Vercel serverless function handler
function handler(req, res) {
    // Default to index.html for root path
    let filePath = req.url === '/' ? '/index.html' : req.url;
    
    // Remove query strings
    filePath = filePath.split('?')[0];
    
    filePath = path.join(__dirname, filePath);

    // Get file extension for content type
    const extname = path.extname(filePath).toLowerCase();
    const contentTypeMap = {
        '.html': 'text/html',
        '.css': 'text/css',
        '.js': 'text/javascript',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.ttf': 'font/ttf',
        '.woff': 'font/woff',
        '.woff2': 'font/woff2',
        '.mp3': 'audio/mpeg',
        '.ogg': 'audio/ogg',
        '.wav': 'audio/wav'
    };
    const contentType = contentTypeMap[extname] || 'application/octet-stream';

    // Read and serve the file
    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.statusCode = 404;
                res.setHeader('Content-Type', 'text/html');
                res.end('<h1>404 - File Not Found</h1>', 'utf-8');
            } else {
                res.statusCode = 500;
                res.end(`Server Error: ${err.code}`, 'utf-8');
            }
        } else {
            res.statusCode = 200;
            res.setHeader('Content-Type', contentType);
            res.end(content);
        }
    });
}

module.exports = handler;
