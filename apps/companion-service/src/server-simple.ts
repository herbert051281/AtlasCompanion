import { createServer } from 'node:http';

const PORT = 9999;
const HOST = '127.0.0.1';

console.log('Starting simple test server...');

const server = createServer((req, res) => {
  console.log(`${req.method} ${req.url}`);
  
  if (req.url === '/execute-primitive' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        console.log('Received:', data);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ code: 0, stdout: 'ok', stderr: '' }));
      } catch (err) {
        res.writeHead(400);
        res.end('Bad JSON');
      }
    });
    return;
  }
  
  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, HOST, () => {
  console.log(`✅ Server listening on http://${HOST}:${PORT}`);
});

server.on('error', (err) => {
  console.error('Server error:', err);
  process.exit(1);
});

process.on('SIGINT', () => {
  console.log('Shutting down...');
  server.close();
  process.exit(0);
});
