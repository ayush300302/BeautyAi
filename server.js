/**
 * server.js — BeautyAI Node.js Server & Secure LLM Proxy (Zero External Dependencies)
 * Technical Assignment Submission — Inspired by Orbo.ai
 *
 * Security: Serves static frontend assets and proxies BeautyGPT requests to OpenRouter server-side.
 * OpenRouter API Key is stored ONLY server-side via process.env.OPENROUTER_API_KEY.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8000;
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = 'google/gemini-2.5-flash';

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

const SYSTEM_PROMPT = `You are BeautyGPT, an AI Beauty Advisor created for BeautyAI.

ROLE & POSITIONING:
- You are an AI Beauty Advisor providing general skincare education, active ingredient information, routine building guidance, and product recommendations.
- You are NOT a doctor, dermatologist, medical professional, or clinical skin diagnostic system. Do NOT present yourself as a medical authority or state that you provide clinical diagnoses.

CONVERSATIONAL CONTEXT DIRECTIVES:
1. Maintain ongoing multi-turn conversation context across turns. Always interpret follow-up messages in the context of preceding turns.
2. Automatically resolve contextual references such as "it", "this", "that", "again", "next", "week 2", "make it longer", "what about night?", "can I use this?", "give me a schedule", "make it a month", "what should I do next?" to the skin type, routine, or active ingredients previously discussed.
3. Do NOT re-ask the user for information already provided in earlier turns (e.g., if they previously stated their skin type is oily, do not ask them again).
4. Only ask clarifying questions when required information genuinely cannot be inferred from context.

RESPONSE & SAFETY GUIDELINES:
1. ORDINARY SKINCARE QUESTIONS: Answer warmly, helpfully, and directly (e.g. routine steps, ingredient functions like Niacinamide or Retinol, product pairings, 4-week schedules). Do NOT append "consult a dermatologist" to ordinary non-medical skincare questions. Keep answers engaging and helpful.
2. MEDICALLY CONCERNING QUESTIONS: For potentially serious, painful, or medical skin issues (e.g. severe or cystic acne, painful lesions, suspected skin infections, severe swelling, allergic reactions, rapidly changing spots, prescription medicine requests), recommend professional evaluation using natural language: "Because this may require a medical assessment, consider consulting a qualified dermatologist." Do NOT claim that you have diagnosed the condition.
3. CELEBRITY QUESTIONS: If asked about a celebrity, actor, or public figure's skincare routine, DO NOT invent personal details, fake products, or fake routines. If verified information is unavailable, say: "I don't have verified information about their personal skincare routine, so I don't want to make one up. However, I can explain general skincare principles for that concern."
4. PERSONALIZATION: Personalize advice using user-provided skin parameters, but keep language educational (e.g., "For oily, acne-prone skin, a routine can focus on gentle cleansing and oil control...") rather than diagnostic.
5. OUT-OF-SCOPE QUESTIONS: If asked non-skincare questions (math, coding, politics), decline politely: "I am specialized strictly as your AI Beauty Advisor 🧴. I can only help with skincare routines, products, and ingredient safety!"

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

  // ─── GET /api/health Production Endpoint ───────────────────────────────────
  if (req.method === 'GET' && req.url === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  // ─── POST /api/chat Proxy Endpoint (Supports Multi-Turn History) ────────────
  if (req.method === 'POST' && req.url === '/api/chat') {
    let bodyStr = '';
    req.on('data', chunk => bodyStr += chunk);
    req.on('end', async () => {
      try {
        const body = JSON.parse(bodyStr || '{}');

        // Extract conversation messages array or build single message turn
        let conversationMessages = [];
        if (Array.isArray(body.messages) && body.messages.length > 0) {
          conversationMessages = body.messages.slice(-10).map(m => ({
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: String(m.content || '')
          }));
        } else if (body.message && typeof body.message === 'string') {
          conversationMessages = [{ role: 'user', content: body.message }];
        }

        const lastUserMsg = conversationMessages.slice().reverse().find(m => m.role === 'user')?.content || '';
        console.log(`[CHAT] multi-turn request received (${conversationMessages.length} msgs) | Latest: "${lastUserMsg.slice(0, 40)}"`);

        if (conversationMessages.length === 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'error', reason: 'Message parameter is required.' }));
          return;
        }

        if (!OPENROUTER_KEY || OPENROUTER_KEY.length < 10) {
          console.error('[CHAT] process.env.OPENROUTER_API_KEY is not configured on server!');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'error', reason: 'AI Connection Temporarily Unavailable' }));
          return;
        }

        console.log(`[CHAT] OpenRouter request started (Model: ${MODEL})`);

        // 30-second AbortController timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        try {
          const openRouterRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            signal: controller.signal,
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${OPENROUTER_KEY}`,
              'HTTP-Referer': 'https://beautyai-recommender-app.azurewebsites.net',
              'X-Title': 'BeautyAI Assistant'
            },
            body: JSON.stringify({
              model: MODEL,
              messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                ...conversationMessages
              ]
            })
          });

          clearTimeout(timeoutId);
          console.log(`[CHAT] OpenRouter response received: HTTP ${openRouterRes.status}`);

          if (!openRouterRes.ok) {
            const errText = await openRouterRes.text();
            console.error(`[CHAT] OpenRouter Error ${openRouterRes.status}: ${errText.slice(0, 100)}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'error', reason: 'AI Connection Temporarily Unavailable' }));
            return;
          }

          const data = await openRouterRes.json();
          console.log('[CHAT] OpenRouter response parsed');

          if (data.choices && data.choices[0]?.message?.content) {
            console.log('[CHAT] response sent to browser');
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'success', message: data.choices[0].message.content }));
          } else {
            console.error('[CHAT] OpenRouter empty choices payload');
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'error', reason: 'AI Connection Temporarily Unavailable' }));
          }
        } catch (fetchErr) {
          clearTimeout(timeoutId);
          if (fetchErr.name === 'AbortError') {
            console.error('[CHAT] OpenRouter request timed out (30s)');
          } else {
            console.error('[CHAT] Fetch exception:', fetchErr.message);
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'error', reason: 'AI Connection Temporarily Unavailable' }));
        }
      } catch (err) {
        console.error('[CHAT] Throwable Error:', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'error', reason: 'AI Connection Temporarily Unavailable' }));
      }
    });
    return;
  }

  // ─── Static File Server ────────────────(Handles all static asset routing)──
  let filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url);

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
  console.log(`✨ BeautyAI Server running on port ${PORT}`);
});
