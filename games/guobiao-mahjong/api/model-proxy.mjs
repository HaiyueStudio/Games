import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
registerHooks({ resolve(s, c, next) { return next(/^\.{1,2}\//.test(s) && !/\.[a-z0-9]+$/i.test(s) ? s + '.ts' : s, c); } });
const { AGENT_SYSTEM_PROMPT } = await import('./agents.ts');
const { TILE_NAMES, actionKey } = await import('../rules/types.ts');
const configFile = process.argv[2];
if (!configFile) throw new Error('Usage: node --experimental-strip-types games/guobiao-mahjong/api/model-proxy.mjs <providers.json>');
// Configuration maps path names to a provider's chat/completions-compatible endpoint.
const providers = JSON.parse(readFileSync(configFile, 'utf8'));
const server = createServer(async (req, res) => {
  const origin = req.headers.origin;
  if (origin && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) { res.writeHead(403); res.end('Local origins only'); return; }
  if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type'); res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  const provider = providers[req.url?.replace(/^\/agent\//, '')];
  if (req.method !== 'POST' || !provider) { res.writeHead(404); res.end(); return; }
  const abort = new AbortController(), timer = setTimeout(() => abort.abort(), 55000);
  const disconnected = () => { if (!res.writableEnded) abort.abort(); }; res.on('close', disconnected);
  try {
    let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 2000000) throw new Error('Request too large'); }
    const request = JSON.parse(body);
    if (request.protocol !== 'haiyue.mcr/1' || !request.observation?.legalActions?.length) throw new Error('Invalid protocol');
    const key = process.env[provider.keyEnv]; if (!key) throw new Error('Provider key environment variable is missing');
    const upstream = await fetch(provider.endpoint, { method: 'POST', signal: abort.signal, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: provider.model, messages: [{ role: 'system', content: AGENT_SYSTEM_PROMPT + '\n牌号映射：' + JSON.stringify(TILE_NAMES.map((name, id) => ({ id, name }))) }, { role: 'user', content: JSON.stringify(request) }], ...(provider.jsonMode === false ? {} : { response_format: { type: 'json_object' } }) }) });
    if (!upstream.ok) throw new Error(`Provider HTTP ${upstream.status}`);
    const reply = await upstream.json(), content = reply.choices?.[0]?.message?.content;
    const parsed = JSON.parse(String(content).replace(/^```(?:json)?\s*|\s*```$/g, ''));
    if (parsed.requestId !== request.requestId || parsed.revision !== request.observation.revision || !request.observation.legalActions.some(a => actionKey(a) === actionKey(parsed.action))) throw new Error('Provider returned an invalid decision');
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(parsed));
  } catch (error) { res.writeHead(502, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: String(error) })); }
  finally { clearTimeout(timer); res.off('close', disconnected); }
});
server.listen(8765, '127.0.0.1', () => console.log('Mahjong model proxy listening on http://127.0.0.1:8765'));
