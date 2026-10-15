// Test-Attrappe für Tailscale Serve / Funnel (nur Tests!): node tests/tailscale_proxy_stub.js <lauschPort> <zielPort> serve|funnel
// Leitet HTTP und WebSocket nach 127.0.0.1:<zielPort> weiter und macht, was die Dokumentation von Tailscale beschreibt:
//  serve : entfernt vom Client mitgeschickte Tailscale-User-*/Tailscale-Funnel-Request-Header, setzt Tailscale-User-Login/-Name
//          und X-Forwarded-For (Tailnet-IP); Host bleibt unverändert
//  funnel: entfernt dieselben Header, setzt KEINEN Login, aber Tailscale-Funnel-Request: ?1 und X-Forwarded-For (öffentliche IP)
//  serve-ohne-identitaet (v26): wie serve, aber OHNE Tailscale-User-* (nur X-Forwarded-For mit Tailnet-IP) – falls ein tailscaled keine Identität liefert
//  serve-ohne-xff (v26)       : wie serve, aber OHNE X-Forwarded-For (nur Identität)
//  serve-nichts (v26)         : weder Identität noch X-Forwarded-For (Header-lose Weiterleitung)
//  cloudflared (v26)          : kein Tailscale; XFF = öffentliche IP, cf-connecting-ip (fremder Reverse-Proxy auf 127.0.0.1)
// Verbindungen zum Ziel kommen – wie bei Tailscale – von 127.0.0.1.
'use strict';
const http = require('http'), net = require('net');
const [lausch, ziel, art] = [+process.argv[2], +process.argv[3], process.argv[4] || 'serve'];
function kopf(h) {
  const o = {};
  for (const [k, v] of Object.entries(h)) if (!/^tailscale-/i.test(k) && k.toLowerCase() !== 'x-forwarded-for') o[k] = v;
  if (art === 'serve-ohne-identitaet') { o['X-Forwarded-For'] = '100.101.102.103'; }
  else if (art === 'serve-ohne-xff') { o['Tailscale-User-Login'] = 'sebastian@example.com'; o['Tailscale-User-Name'] = 'Sebastian'; }
  else if (art === 'serve-nichts') { /* nichts */ }
  else if (art === 'cloudflared') { o['X-Forwarded-For'] = '203.0.113.50'; o['CF-Connecting-IP'] = '203.0.113.50'; }
  else if (art === 'serve') { o['Tailscale-User-Login'] = 'sebastian@example.com'; o['Tailscale-User-Name'] = 'Sebastian'; o['X-Forwarded-For'] = '100.101.102.103'; }
  else { o['Tailscale-Funnel-Request'] = '?1'; o['X-Forwarded-For'] = '203.0.113.50'; }
  return o;
}
const srv = http.createServer((req, res) => {
  const p = http.request({ host: '127.0.0.1', port: ziel, method: req.method, path: req.url, headers: kopf(req.headers) }, (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
  p.on('error', () => { res.writeHead(502); res.end(); });
  req.pipe(p);
});
srv.on('upgrade', (req, sock, head) => {
  const z = net.connect(ziel, '127.0.0.1', () => {
    const h = kopf(req.headers);
    z.write(`${req.method} ${req.url} HTTP/1.1\r\n` + Object.entries(h).map(([k, v]) => `${k}: ${v}`).join('\r\n') + '\r\n\r\n');
    if (head && head.length) z.write(head);
    sock.pipe(z); z.pipe(sock);
  });
  z.on('error', () => sock.destroy()); sock.on('error', () => z.destroy());
});
srv.listen(lausch, '127.0.0.1', () => console.log('proxy bereit'));
