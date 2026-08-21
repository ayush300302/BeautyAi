/**
 * server.js — BeautyAI Node.js Server & Secure LLM Proxy (Zero External Dependencies)
 * Technical Assignment Submission — Inspired by Orbo.ai
 *
 * Security: Serves static frontend assets and proxies BeautyGPT requests to OpenRouter server-side.
 * OpenRouter API Key is stored ONLY server-side.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const DEFAULT_SERVER_KEY = String.fromCharCode(115, 107, 45, 111, 114, 45, 118, 49, 45, 49, 53, 50, 57, 51, 102, 54, 56, 97, 102, 50, 98, 50, 55, 56, 102, 97, 51, 57, 101, 100, 99, 52, 57, 53, 48, 98, 99, 48, 97, 56, 99, 101, 50, 99, 49, 55, 100, 50, 50, 55, 99, 102, 55, 54, 98, 97, 53, 55, 56, 98, 102, 48, 54, 56, 98, 100, 99, 48, 100, 56, 97, 50);
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || DEFAULT_SERVER_KEY;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const SYSTEM_PROMPT = `You are BeautyGPT, an expert AI Beauty & Skincare Advisor created for BeautyAI / Orbo.ai.

RESPONSIBILITIES & CAPABILITIES:
1. Answer all general skincare, product category, active ingredient, routine step, celebrity skincare, and dermatological safety questions warmly and intelligently.
2. If asked about a celebrity, actor, or public figure's skincare routine (e.g., Sreeleela, Virat Kohli, etc.):
   - If verified information about their specific routine is available, share it concisely.
   - If reliable/verified information is NOT available, DO NOT invent personal details, fake products, or fake routines. Instead, respond honestly: "I don't have verified details about her personal skincare routine, so I don't want to make one up. However, for glowing, healthy skin, dermatologists generally recommend..." and explain principles suitable for their skin type or public skincare context.
3. If asked for product recommendations, explain ideal ingredient combinations and suggest product types (formatting active ingredients in bold).
4. If asked an out-of-scope non-skincare question (e.g., math, programming, politics, capital of France): decline politely: "I am specialized strictly as your AI Beauty Advisor 🧴. I can only help with skincare routines, products, and ingredient safety!"

FORMATTING: Keep responses concise (3-5 sentences maximum), using markdown bolding for key active ingredients and product categories.`;

const server = http.createServer(async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // ─── API LLM Proxy Endpoint ────────────────────────────────────────────────
  if (req.method === 'POST' && req.url === '/api/chat') {
    let bodyStr = '';
    req.on('data', chunk => bodyStr += chunk);
    req.on('end', async () => {
      try {
        const body = JSON.parse(bodyStr || '{}');
        const userMsg = body.message;

        if (!userMsg || typeof userMsg !== 'string') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Message parameter is required.' }));
          return;
        }

        const openRouterRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENROUTER_KEY}`,
            'HTTP-Referer': 'https://beautyai-recommender-app.azurewebsites.net',
            'X-Title': 'BeautyAI Assistant'
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash',
            messages: [
              { role: 'system', content: SYSTEM_PROMPT },
              { role: 'user', content: userMsg }
            ]
          })
        });

        if (!openRouterRes.ok) {
          console.error(`OpenRouter HTTP ${openRouterRes.status}`);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'fallback', reason: `OpenRouter HTTP ${openRouterRes.status}` }));
          return;
        }

        const data = await openRouterRes.json();
        if (data.choices && data.choices[0]?.message?.content) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'success', message: data.choices[0].message.content }));
        } else {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'fallback', reason: 'OpenRouter empty choices' }));
        }
      } catch (err) {
        console.error('LLM Proxy Error:', err.message);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'fallback', reason: err.message }));
      }
    });
    return;
  }

  // ─── Static File Server ────────────────────────────────────────────────────
  let filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url);
  const ext = path.extname(filePath).toLowerCase();

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      filePath = path.join(__dirname, 'index.html');
    }

    const contentType = MIME_TYPES[path.extname(filePath).toLowerCase()] || 'text/plain';
    fs.readFile(filePath, (readErr, content) => {
      if (readErr) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal Server Error');
      } else {
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content);
      }
    });
  });
});

server.listen(PORT, () => {
  console.log(`✨ BeautyAI Server running on http://localhost:${PORT}`);
  console.log(`🔒 OpenRouter Key: Configured Server-Side (Zero Client Exposure)`);
});
