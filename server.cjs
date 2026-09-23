#!/usr/bin/env node

const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname);
const port = Number(process.env.PORT) || 8000;
const mimeTypes = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.xml': 'application/xml; charset=utf-8'
};

const server = http.createServer((request, response) => {
    const requestPath = decodeURIComponent(request.url.split('?')[0]);
    const relativePath = requestPath === '/' ? '/index.html' : requestPath;
    const filePath = path.resolve(root, `.${relativePath}`);

    if (!filePath.startsWith(`${root}${path.sep}`)) {
        response.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Forbidden');
        return;
    }

    fs.stat(filePath, (error, stats) => {
        if (error || !stats.isFile()) {
            response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            response.end('Not found');
            return;
        }

        response.writeHead(200, {
            'Content-Type': mimeTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream'
        });
        fs.createReadStream(filePath).pipe(response);
    });
});

server.listen(port, () => {
    console.log(`Lingua Libre Inventory Tool: http://localhost:${port}/`);
});
