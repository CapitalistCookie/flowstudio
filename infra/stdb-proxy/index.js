const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');

const TARGET_HTTP = process.env.STDB_TARGET || 'http://34.150.131.25:3000';
const TARGET_WS = TARGET_HTTP.replace('http://', 'ws://').replace('https://', 'wss://');

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Proxy HTTP requests
  const url = `${TARGET_HTTP}${req.url}`;
  const proxyReq = http.request(url, {
    method: req.method,
    headers: { ...req.headers, host: new URL(TARGET_HTTP).host },
  }, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error('HTTP proxy error:', err.message);
    res.writeHead(502, { 'Content-Type': 'text/plain' });
    res.end('Bad Gateway');
  });

  req.pipe(proxyReq);
});

// WebSocket proxy — handle upgrade manually to forward subprotocols
const wss = new WebSocketServer({
  noServer: true,
  handleProtocols: (protocols) => {
    // Accept whatever protocol the client requests
    if (protocols.size > 0) return protocols.values().next().value;
    return false;
  },
});

server.on('upgrade', (req, socket, head) => {
  // Extract requested protocols from the client
  const protocolHeader = req.headers['sec-websocket-protocol'] || '';
  const protocols = protocolHeader.split(',').map(s => s.trim()).filter(Boolean);

  wss.handleUpgrade(req, socket, head, (clientWs) => {
    const backendUrl = `${TARGET_WS}${req.url}`;
    console.log(`WS connect: ${req.url} → ${backendUrl} (protocols: ${protocols.join(',') || 'none'})`);

    const backendWs = new WebSocket(backendUrl, protocols);

    backendWs.on('open', () => {
      console.log(`WS backend connected: ${req.url}`);
      clientWs.on('message', (data) => {
        if (backendWs.readyState === WebSocket.OPEN) backendWs.send(data);
      });
      backendWs.on('message', (data) => {
        if (clientWs.readyState === WebSocket.OPEN) clientWs.send(data);
      });
    });

    backendWs.on('error', (err) => {
      console.error('WS backend error:', err.message);
      clientWs.close(1011, 'Backend error');
    });

    backendWs.on('close', (code, reason) => {
      console.log(`WS backend closed: ${code} ${reason}`);
      if (clientWs.readyState !== WebSocket.CLOSED) clientWs.close(code, reason);
    });

    clientWs.on('close', () => {
      if (backendWs.readyState !== WebSocket.CLOSED) backendWs.close();
    });

    clientWs.on('error', (err) => {
      console.error('WS client error:', err.message);
      if (backendWs.readyState !== WebSocket.CLOSED) backendWs.close();
    });
  });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`STDB proxy → ${TARGET_HTTP} on :${PORT}`);
});
