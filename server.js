/**
 * server.js — BeautyAI Node.js Express Server & Secure LLM Proxy
 * Technical Assignment Submission — Inspired by Orbo.ai
 *
 * Security: Serves frontend static assets and proxies BeautyGPT requests to OpenRouter.
 * OpenRouter API Key is stored ONLY server-side via process.env.OPENROUTER_API_KEY.
 */

const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8000;

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ─── Health Check Endpoint ───────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    system: 'BeautyAI Recommendation Engine',
    has_openrouter_key: !!process.env.OPENROUTER_API_KEY
  });
});

// ─── Secure LLM Proxy Endpoint ───────────────────────────────────────────────
app.post('/api/chat', async (req, res) => {
  const { message } = req.body;
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Message field is required.' });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    return res.json({
      status: 'fallback',
      reason: 'OPENROUTER_API_KEY not configured on server environment.',
      message: null
    });
  }

  try {
    const fetch = (await import('node-fetch')).default || globalThis.fetch;
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://beautyai-recommender-app.azurewebsites.net',
        'X-Title': 'BeautyAI Assistant'
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: `You are BeautyGPT, an expert AI Beauty & Skincare Advisor created for BeautyAI / Orbo.ai.
Provide warm, concise, highly knowledgeable dermatological advice.
GUARDRAILS:
1. Warmly handle greetings, gratitude, and affection (e.g., if user says "I love you", reply warmly like "Aww, thank you! 💖 I am here to help your skin glow. What skincare questions do you have today?").
2. Handle typos gracefully (e.g. "oily kil" -> oily skin).
3. If query is off-topic (coding, math, politics), decline gracefully: "I am specialized strictly as your AI Beauty Advisor. I can only help with skincare routines, products, and ingredient safety!"
4. Keep answers under 3-4 sentences, formatting key products or ingredients in bold.`
          },
          { role: 'user', content: message }
        ]
      })
    });

    const data = await response.json();
    if (data.choices && data.choices[0]?.message?.content) {
      return res.json({
        status: 'success',
        message: data.choices[0].message.content
      });
    } else {
      return res.json({
        status: 'fallback',
        reason: 'OpenRouter empty response.',
        message: null
      });
    }
  } catch (err) {
    console.error('Server LLM Proxy Error:', err.message);
    return res.json({
      status: 'fallback',
      reason: err.message,
      message: null
    });
  }
});

// Fallback to index.html for SPA routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`✨ BeautyAI Server running on port ${PORT}`);
  console.log(`🔒 OpenRouter Key status: ${process.env.OPENROUTER_API_KEY ? 'Configured (Server-side)' : 'Not Set (Local Guardrails Active)'}`);
});
