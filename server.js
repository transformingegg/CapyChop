const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;

const server = http.createServer((req, res) => {
    // Default to index.html for root path
    let filePath = req.url === '/' ? '/index.html' : req.url;
    
    // Handle directory listing for /images/
    if (req.url === '/images/' || req.url === '/images') {
        const imagesDir = path.join(__dirname, 'images');
        fs.readdir(imagesDir, (err, files) => {
            if (err) {
                res.writeHead(404, { 'Content-Type': 'text/html' });
                res.end('<h1>Images folder not found</h1>', 'utf-8');
                return;
            }
            const imageFiles = files.filter(f => /\.(png|jpg|jpeg|gif)$/i.test(f));
            const html = '<html><body>' + imageFiles.map(f => `<a href="${f}">${f}</a><br>`).join('') + '</body></html>';
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(html, 'utf-8');
        });
        return;
    }
    
    filePath = path.join(__dirname, filePath);

    // Get file extension for content type
    const extname = path.extname(filePath);
    const contentTypeMap = {
        '.html': 'text/html',
        '.css': 'text/css',
        '.js': 'text/javascript',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml'
    };
    const contentType = contentTypeMap[extname] || 'application/octet-stream';

    // Read and serve the file
    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/html' });
                res.end('<h1>404 - File Not Found</h1>', 'utf-8');
            } else {
                res.writeHead(500);
                res.end(`Server Error: ${err.code}`, 'utf-8');
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

server.listen(PORT, () => {
    console.log(`🎮 CapyChop server running at http://localhost:${PORT}/`);
    console.log(`📂 Serving files from: ${__dirname}`);
    console.log(`Press Ctrl+C to stop the server`);
});
