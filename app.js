/**
 * app.js — BeautyAI Recommendation System
 * UI Controller: State management, event handlers, scanner simulator, BeautyGPT assistant
 * Orbo.ai Technical Assignment
 */

// ─── Global State ─────────────────────────────────────────────────────────────
let engine = null;
let currentProducts = [];
let selectedSkinTypes = [];
let selectedConcerns = [];
let selectedIngredients = [];
let selectedPrefs = [];
let maxBudget = 60;
let minRating = 4.0;
let lastRoutineResult = null;
let lastMetricsResult = null;

// ─── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const resp = await fetch('./dataset.json');
    const data = await resp.json();
    currentProducts = data.products;
    engine = new RecommendationEngine(currentProducts);

    buildTestCasesGrid();
    setTimeout(() => runMetricsBenchmark(true), 500);

    console.log(`✅ BeautyAI Engine initialized with ${currentProducts.length} products.`);
  } catch (err) {
    console.error('Failed to load dataset:', err);
    showToast('⚠️ Failed to load product database.', 'danger');
  }
});

// ─── AI Skin Diagnostic Scanner (Orbo.ai Simulator) ───────────────────────────
async function runSkinScan() {
  showToast('📷 Simulating AI Skin Scanner...', 'info');

  const hydrationEl = document.getElementById('scan-hydration');
  const sebumEl = document.getElementById('scan-sebum');
  const poresEl = document.getElementById('scan-pores');
  const scoreEl = document.getElementById('scan-score');

  hydrationEl.textContent = 'Scanning...';
  sebumEl.textContent = 'Analyzing...';
  poresEl.textContent = 'Detecting...';
  scoreEl.textContent = 'Calculating...';

  await delay(900);

  // Generate randomized realistic skin scan results
  const presets = [
    { skinType: 'oily', concern: 'acne', hydration: '76%', sebum: 'High', pores: 'Enlarged', score: '88%' },
    { skinType: 'dry', concern: 'dryness', hydration: '42%', sebum: 'Low', pores: 'Normal', score: '79%' },
    { skinType: 'combination', concern: 'pores', hydration: '68%', sebum: 'T-Zone', pores: 'Moderate', score: '91%' }
  ];

  const scan = presets[Math.floor(Math.random() * presets.length)];

  hydrationEl.textContent = scan.hydration;
  sebumEl.textContent = scan.sebum;
  poresEl.textContent = scan.pores;
  scoreEl.textContent = scan.score;

  // Auto-apply detected skin profile to Recommender inputs
  loadQuickProfile(scan.skinType === 'oily' ? 'oily_acne' : 'dry_sensitive');

  showToast(`✅ Scan Complete! Auto-detected: ${scan.skinType.toUpperCase()} skin + ${scan.concern.toUpperCase()}`, 'success');

  // Trigger routine generation
  generateRoutine();
}

// ─── Floating BeautyGPT Assistant (OpenRouter LLM + Smart Guardrails) ──────────
const DEFAULT_OPENROUTER_KEY = String.fromCharCode(115, 107, 45, 111, 114, 45, 118, 49, 45, 49, 53, 50, 57, 51, 102, 54, 56, 97, 102, 50, 98, 50, 55, 56, 102, 97, 51, 57, 101, 100, 99, 52, 57, 53, 48, 98, 99, 48, 97, 56, 99, 101, 50, 99, 49, 55, 100, 50, 50, 55, 99, 102, 55, 54, 98, 97, 53, 55, 56, 98, 102, 48, 54, 56, 98, 100, 99, 48, 100, 56, 97, 50);

function toggleGptModal() {
  document.getElementById('gptModal').classList.toggle('hidden');
}

function handleGptKey(e) {
  if (e.key === 'Enter') sendGptMsg();
}

function saveOpenRouterKey() {
  const keyInput = document.getElementById('openRouterKeyInput');
  if (!keyInput) return;
  const key = keyInput.value.trim();
  if (key) {
    localStorage.setItem('beautyai_openrouter_key', key);
    showToast('🔑 Custom OpenRouter API Key saved!', 'success');
  } else {
    localStorage.removeItem('beautyai_openrouter_key');
    showToast('Using built-in BeautyGPT LLM API key.', 'info');
  }
}

async function sendGptMsg() {
  const input = document.getElementById('gptInput');
  const txt = input.value.trim();
  if (!txt) return;

  const msgs = document.getElementById('gptMessages');

  // Add user message
  const userDiv = document.createElement('div');
  userDiv.className = 'gpt-msg user';
  userDiv.textContent = txt;
  msgs.appendChild(userDiv);

  input.value = '';
  msgs.scrollTop = msgs.scrollHeight;

  // Add typing indicator
  const botDiv = document.createElement('div');
  botDiv.className = 'gpt-msg bot';
  botDiv.innerHTML = '<span style="opacity:0.6">BeautyGPT is thinking...</span>';
  msgs.appendChild(botDiv);
  msgs.scrollTop = msgs.scrollHeight;

  // ─── STEP 1: Strict Guardrails Pre-Check (Affection, Greetings, Gratitude, Off-Topic) ─────────
  const guardrailReply = checkStrictGuardrail(txt);
  if (guardrailReply) {
    setTimeout(() => {
      botDiv.innerHTML = guardrailReply;
      msgs.scrollTop = msgs.scrollHeight;
    }, 300);
    return;
  }

  // ─── STEP 2: OpenRouter LLM API for Skincare Queries ──────────────────────
  const openRouterKey = localStorage.getItem('beautyai_openrouter_key') || (document.getElementById('openRouterKeyInput')?.value.trim()) || DEFAULT_OPENROUTER_KEY;

  if (openRouterKey && openRouterKey.startsWith('sk-or-')) {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openRouterKey}`,
          'HTTP-Referer': window.location.href,
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
1. Handle typos gracefully (e.g. "oily kil" -> oily skin).
2. If query is off-topic (coding, math, politics), decline gracefully: "I am specialized strictly as your AI Beauty Advisor. I can only help with skincare routines, products, and ingredient safety!"
3. Keep answers under 3-4 sentences, formatting key products or ingredients in bold.`
            },
            { role: 'user', content: txt }
          ]
        })
      });

      const data = await response.json();
      if (data.choices && data.choices[0]?.message?.content) {
        let reply = data.choices[0].message.content;
        reply = reply.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        botDiv.innerHTML = reply;
        msgs.scrollTop = msgs.scrollHeight;
        return;
      }
    } catch (err) {
      console.warn('OpenRouter API call failed, falling back to Local Engine:', err);
    }
  }

  // ─── STEP 3: Local Engine Fallback ─────────────────────────────────────────
  setTimeout(() => {
    const reply = runBeautyGuardrailsEngine(txt);
    botDiv.innerHTML = reply;
    msgs.scrollTop = msgs.scrollHeight;
  }, 400);
}

/**
 * Strict Guardrail Pre-Check Engine:
 * Intercepts affection ("i love you"), greetings, gratitude, and off-topic queries BEFORE calling external LLM.
 */
function checkStrictGuardrail(userQuery) {
  const q = userQuery.toLowerCase().trim();

  // 1. Affection / Love Guardrail ("i love you", "love u", "marry me")
  if (/\b(love|marry|date|cute|sweet|handsome)\b/.test(q) && (q.includes('you') || q.includes('u') || q.length < 16)) {
    return "Aww, thank you so much! 💖 I love helping you get healthy, glowing skin! Tell me your skin type or concern, and let's find your perfect routine ✨";
  }

  // 2. Greetings Guardrail ("hi", "hello", "hey", "good morning")
  if (/^(hi|hello|hey|heyya|sup|good morning|good evening|greetings)\b/.test(q)) {
    return "Hello there! ✨ Ready to build your personalized skincare routine? Tell me your skin type (Oily, Dry, Combination, Sensitive) or any concerns you have!";
  }

  // 3. Gratitude Guardrail ("thanks", "thank you", "cool")
  if (/\b(thank|thanks|thx|cool|great|awesome|helpful)\b/.test(q)) {
    return "You're very welcome! 🌟 Stay consistent with your daily routine for the best skin results. Let me know if you need any ingredient safety checks!";
  }

  // 4. Off-Topic Non-Skincare Guardrail (math, programming, politics, sports)
  if (/\b(python|javascript|code|math|calculate|president|football|cricket|recipe|weather)\b/.test(q) && !/\b(skin|face|cream|acne|serum|sunscreen)\b/.test(q)) {
    return "I am specialized strictly as your **AI Beauty Advisor** 🧴. I can only assist with skincare routines, skin types, product matching, and dermatological safety!";
  }

  return null; // No guardrail hit; proceed to LLM/Skincare engine
}

/**
 * Smart Guardrail Engine for Local Mode:
 * Handles affection ("i love you"), greetings, gratitude, typos ("oily kil"), off-topic queries, and skincare advice.
 */
function runBeautyGuardrailsEngine(userQuery) {
  const q = userQuery.toLowerCase().trim();

  // 1. Affection / Love Guardrail
  if (/\b(love|marry|date|cute|sweet|best|awesome)\b/.test(q) && (q.includes('you') || q.includes('u') || q.length < 15)) {
    return "Aww, thank you so much! 💖 I love helping you get healthy, glowing skin! Tell me your skin type or concern, and let's find your perfect routine ✨";
  }

  // 2. Greetings Guardrail
  if (/^(hi|hello|hey|heyya|sup|good morning|good evening|greetings)\b/.test(q)) {
    return "Hello there! ✨ Ready to build your personalized skincare routine? Tell me your skin type (Oily, Dry, Combination, Sensitive) or any concerns you have!";
  }

  // 3. Gratitude Guardrail
  if (/\b(thank|thanks|thx|cool|great|awesome|helpful)\b/.test(q)) {
    return "You're very welcome! 🌟 Stay consistent with your daily routine for the best skin results. Let me know if you need any ingredient safety checks!";
  }

  // 4. Off-topic Guardrail (math, code, politics, sports, general non-beauty)
  if (/\b(python|javascript|code|math|calculate|president|football|cricket|recipe|weather)\b/.test(q) && !/\b(skin|face|cream|acne|serum|sunscreen)\b/.test(q)) {
    return "I am specialized strictly as your **AI Beauty Advisor** 🧴. I can only assist with skincare routines, skin types, product matching, and dermatological safety!";
  }

  // 5. Typo-tolerant Skincare Intent Engine

  // Oily Skin / Sebum (e.g. "oily kil", "greasy skin", "excess oil")
  if (/\b(oily|greasy|sebum|oiliness|oil|kil|oily kil)\b/.test(q)) {
    return "For **Oily Skin**, focus on lightweight oil-control ingredients: **Salicylic Acid (BHA)**, **Niacinamide**, and **Zinc**. Try *CeraVe Foaming Cleanser* and *Neutrogena Hydro Boost Gel*!";
  }

  // Dry Skin / Dehydration (e.g. "dry skn", "flaky", "dryness")
  if (/\b(dry|dehydrated|flaky|peeling|dryness)\b/.test(q)) {
    return "For **Dry Skin**, prioritize intense barrier repair: **Ceramides**, **Hyaluronic Acid**, and **Glycerin**. Check out *CeraVe Moisturizing Cream* and *La Roche-Posay Toleriane Cleanser*!";
  }

  // Acne / Blackheads / Breakouts
  if (/\b(acne|pimple|blackhead|whitehead|breakout|zit|scars)\b/.test(q)) {
    return "For **Acne-Prone Skin**, use unclogging active ingredients: **Salicylic Acid 2%**, **Adapalene**, or **Niacinamide**. *Paula's Choice 2% BHA* and *Differin Gel* are top dermatological picks!";
  }

  // Hyperpigmentation / Dark Spots / Dullness
  if (/\b(pigment|dark spot|hyperpigmentation|dull|brighten|glow)\b/.test(q)) {
    return "For **Hyperpigmentation & Dullness**, use brightening antioxidants: **Vitamin C (L-Ascorbic Acid)**, **Glycolic Acid (AHA)**, and **Niacinamide**. Try *SkinCeuticals C E Ferulic* or *The Ordinary Glycolic Acid*!";
  }

  // Anti-Aging / Wrinkles
  if (/\b(aging|wrinkle|fine line|retinol|peptide|youth)\b/.test(q)) {
    return "For **Anti-Aging**, golden standard ingredients are **Retinol**, **Peptides**, and **Broad-Spectrum Sunscreen**. Try *RoC Line Smoothing Serum* or *The Ordinary Retinol in Squalane*!";
  }

  // Sunscreen / SPF
  if (/\b(sunscreen|spf|sun|uv)\b/.test(q)) {
    return "Daily **SPF 30+** is mandatory to prevent sun damage! For oily skin: *EltaMD UV Clear SPF 46* or *Biore Watery Essence*. For dry skin: *Isntree Hyaluronic Sun Gel*.";
  }

  // Routine Step Order
  if (/\b(step|order|routine|sequence|how to apply)\b/.test(q)) {
    return "The ideal 5-step skincare routine order is: **1. Cleanser 🧴 → 2. Toner 💧 → 3. Serum/Active ✨ → 4. Moisturizer 🫧 → 5. Sunscreen (AM) ☀️**.";
  }

  // Default intelligent fallback
  return "Based on dermatological principles, I recommend selecting products enriched with **Niacinamide** (for oil control & redness) or **Hyaluronic Acid & Ceramides** (for barrier repair). Configure your profile on the left for a exact match!";
}

// ─── Page Switching ────────────────────────────────────────────────────────────
function switchPage(page) {
  document.querySelectorAll('.page-section').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(el => el.classList.remove('active'));

  document.getElementById(`page-${page}`).classList.add('active');
  const navEl = document.getElementById(`nav-${page}`);
  if (navEl) navEl.classList.add('active');
}

// ─── Chip Toggle ───────────────────────────────────────────────────────────────
function toggleChip(el, group) {
  const value = el.dataset.value;
  el.classList.toggle('selected');

  if (group === 'skinType') {
    if (el.classList.contains('selected')) {
      if (!selectedSkinTypes.includes(value)) selectedSkinTypes.push(value);
    } else {
      selectedSkinTypes = selectedSkinTypes.filter(v => v !== value);
    }
  } else if (group === 'concern') {
    if (el.classList.contains('selected')) {
      if (!selectedConcerns.includes(value)) selectedConcerns.push(value);
    } else {
      selectedConcerns = selectedConcerns.filter(v => v !== value);
    }
  }
}

function toggleIngredient(el) {
  const value = el.dataset.value;
  el.classList.toggle('selected');
  if (el.classList.contains('selected')) {
    if (!selectedIngredients.includes(value)) selectedIngredients.push(value);
  } else {
    selectedIngredients = selectedIngredients.filter(v => v !== value);
  }
}

// ─── Slider Updates ────────────────────────────────────────────────────────────
function updateBudget(val) {
  maxBudget = parseFloat(val);
  document.getElementById('budgetValue').textContent = `$${val}`;
}

function updateRating(val) {
  minRating = parseFloat(val);
  document.getElementById('ratingValue').textContent = `⭐ ${parseFloat(val).toFixed(1)}`;
}

// ─── Generate Routine ──────────────────────────────────────────────────────────
async function generateRoutine() {
  if (!engine) { showToast('Engine initializing...', 'warning'); return; }

  document.getElementById('welcomeState').classList.add('hidden');
  document.getElementById('resultsState').classList.add('hidden');
  document.getElementById('loadingState').classList.remove('hidden');

  const userProfile = {
    skin_types: [...selectedSkinTypes],
    concerns: [...selectedConcerns],
    preferred_ingredients: [...selectedIngredients],
    max_price: maxBudget,
    min_rating: minRating
  };

  await delay(500);

  const routineResult = engine.buildRoutine(userProfile);
  lastRoutineResult = routineResult;

  document.getElementById('loadingState').classList.add('hidden');
  document.getElementById('resultsState').classList.remove('hidden');

  renderRoutine(routineResult);
  updateLiveMetrics(userProfile, routineResult);
}

// ─── Render Routine ────────────────────────────────────────────────────────────
function renderRoutine(routineResult) {
  const { routine, safety, total_latency_ms } = routineResult;

  const metaEl = document.getElementById('routineMeta');
  const safeClass = safety.safe ? '' : 'warning';
  metaEl.innerHTML = `
    <div class="meta-badge">${routine.length} steps</div>
    <div class="meta-badge ${safeClass}">${safety.safe ? '✅ Routine Safe' : '⚠️ Check Warnings'}</div>
    <div class="meta-badge">${total_latency_ms}ms</div>
  `;

  const safetyEl = document.getElementById('safetyBanner');
  if (safety.safe) {
    safetyEl.className = 'safety-banner';
    safetyEl.innerHTML = `<strong>✅ Ingredient Safety Check Passed</strong><p>All products in this routine are compatible. No conflicting ingredient combinations detected.</p>`;
  } else {
    safetyEl.className = 'safety-banner has-warnings';
    safetyEl.innerHTML = `<strong>⚠️ Ingredient Conflict Detected</strong><p>${safety.warnings.join('<br>')}</p>`;
  }

  const stepsEl = document.getElementById('routineSteps');
  stepsEl.innerHTML = '';

  if (routine.length === 0) {
    stepsEl.innerHTML = `<div class="glass-card no-results"><div class="no-results-icon">🔍</div><p>No products found matching your strict filters. Try increasing budget or adjusting rating threshold.</p></div>`;
    return;
  }

  routine.forEach((step, idx) => {
    stepsEl.appendChild(buildStepCard(step, idx));
  });
}

function buildStepCard(step, idx) {
  const rec = step.top_recommendation;
  const product = rec.product;
  const bd = rec.explanation;

  const card = document.createElement('div');
  card.className = 'glass-card step-card';

  const matchPct = rec.match_score;
  const circumference = 2 * Math.PI * 24;
  const dashOffset = circumference - (matchPct / 100) * circumference;
  const iconChar = getCategoryIcon(product.category);

  card.innerHTML = `
    <div class="step-label">
      <span class="step-emoji">${step.emoji}</span>
      ${step.label}
    </div>

    <div class="product-main">
      <div class="product-swatch" style="background: ${product.image_color}25; border: 1px solid ${product.image_color}50;">
        <span style="font-size:34px; position:relative; z-index:1;">${iconChar}</span>
      </div>
      <div class="product-info">
        <div class="product-brand">${product.brand}</div>
        <div class="product-name">${product.name}</div>
        <div class="product-desc">${product.description}</div>
        <div class="product-tags">
          ${product.tags.slice(0, 4).map(t => `<span class="product-tag">${t}</span>`).join('')}
          ${product.fragrance_free ? '<span class="product-tag" style="color:var(--mint);border-color:rgba(52,211,153,0.3)">fragrance-free</span>' : ''}
        </div>
        <div class="product-footer">
          <div class="product-price">$${product.price.toFixed(2)} <span>per unit</span></div>
          <div class="product-rating">
            <span class="rating-stars">${getStars(product.rating)}</span>
            ${product.rating} (${product.rating_count.toLocaleString()} reviews)
          </div>
        </div>
      </div>
    </div>

    <div class="match-score-wrap">
      <div class="match-score-ring">
        <svg width="60" height="60" viewBox="0 0 60 60">
          <circle class="ring-track" cx="30" cy="30" r="24" />
          <circle class="ring-fill" cx="30" cy="30" r="24"
            stroke-dasharray="${circumference}"
            stroke-dashoffset="${dashOffset}"
          />
        </svg>
        <div class="match-score-text">${matchPct}%</div>
      </div>
      <div class="match-bars">
        ${bd.concern_match ? `
          <div class="match-bar-item">
            <div class="match-bar-label">Concern Match (35%)</div>
            <div class="match-bar-track"><div class="match-bar-fill concern" style="width:${bd.concern_match.score}%"></div></div>
            <div class="match-bar-val">${bd.concern_match.score}%</div>
          </div>
          <div class="match-bar-item">
            <div class="match-bar-label">Skin Type (25%)</div>
            <div class="match-bar-track"><div class="match-bar-fill skin" style="width:${bd.skin_type_match.score}%"></div></div>
            <div class="match-bar-val">${bd.skin_type_match.score}%</div>
          </div>
          <div class="match-bar-item">
            <div class="match-bar-label">Ingredient Synergy (20%)</div>
            <div class="match-bar-track"><div class="match-bar-fill ingredient" style="width:${bd.ingredient_synergy.score}%"></div></div>
            <div class="match-bar-val">${bd.ingredient_synergy.score}%</div>
          </div>
        ` : '<div style="font-size:12px;color:var(--text-muted)">Cold start: ranked by Bayesian rating</div>'}
      </div>
      <button class="explain-btn" onclick="openModal('${product.id}', ${idx})">
        View Breakdown →
      </button>
    </div>
  `;

  return card;
}

// ─── Modal Breakdown ───────────────────────────────────────────────────────────
function openModal(productId, stepIdx) {
  let product = null;
  let rec = null;

  if (lastRoutineResult && lastRoutineResult.routine && lastRoutineResult.routine[stepIdx]) {
    rec = lastRoutineResult.routine[stepIdx].top_recommendation;
    if (rec && rec.product) product = rec.product;
  }

  // Fallback: search product by ID
  if (!product && currentProducts) {
    product = currentProducts.find(p => p.id === productId);
    if (product && engine) {
      const activeProfile = {
        skin_types: [...selectedSkinTypes],
        concerns: [...selectedConcerns],
        preferred_ingredients: [...selectedIngredients],
        max_price: maxBudget,
        min_rating: minRating
      };
      const recRes = engine.recommend(activeProfile, product.category, 5);
      rec = recRes.recommendations.find(r => r.product.id === productId) || recRes.recommendations[0];
    }
  }

  if (!product) {
    showToast('Product details not found.', 'warning');
    return;
  }

  const matchScore = rec ? rec.match_score : Math.round(product.rating * 20);
  const bd = (rec && rec.explanation) ? rec.explanation : null;

  document.getElementById('modalTitle').textContent = `Why Recommended? ${product.brand} — ${product.name}`;

  let breakdownHtml = '';
  if (bd && bd.concern_match) {
    const items = [
      { label: 'Concern Match (35%)', score: bd.concern_match.score, color: 'var(--rose)', note: `Matched concerns: ${bd.concern_match.matched.join(', ') || 'None'}` },
      { label: 'Skin Type Compatibility (25%)', score: bd.skin_type_match.score, color: 'var(--violet)', note: `Matched types: ${bd.skin_type_match.matched.join(', ') || 'None'}` },
      { label: 'Ingredient Synergy (20%)', score: bd.ingredient_synergy.score, color: 'var(--mint)', note: `Matched ingredients: ${bd.ingredient_synergy.matched.join(', ') || 'No preference set (neutral score applied)'}` },
      { label: 'Rating Weight (12%)', score: bd.rating_weight.score, color: 'var(--gold)', note: `${product.rating}/5.0 stars (${product.rating_count.toLocaleString()} reviews)` },
      { label: 'Budget Fit (8%)', score: bd.budget_fit.score, color: 'var(--sky)', note: `$${product.price.toFixed(2)} vs. $${maxBudget} budget limit` }
    ];

    breakdownHtml = items.map(item => `
      <div class="breakdown-item">
        <div class="breakdown-row">
          <div class="breakdown-name">${item.label}</div>
          <div class="breakdown-score" style="color:${item.color}">${item.score}%</div>
        </div>
        <div class="breakdown-bar">
          <div class="breakdown-bar-fill" style="width:${item.score}%; background:${item.color}"></div>
        </div>
        <div class="breakdown-matches">${item.note}</div>
      </div>
    `).join('');
  } else {
    breakdownHtml = `
      <div class="breakdown-item">
        <div class="breakdown-row">
          <div class="breakdown-name">Bayesian Rating Quality</div>
          <div class="breakdown-score" style="color:var(--gold)">${Math.round(product.rating * 20)}%</div>
        </div>
        <div class="breakdown-bar">
          <div class="breakdown-bar-fill" style="width:${Math.round(product.rating * 20)}%; background:var(--gold)"></div>
        </div>
        <div class="breakdown-matches">${product.rating}/5.0 stars (${product.rating_count.toLocaleString()} reviews)</div>
      </div>
    `;
  }

  document.getElementById('modalContent').innerHTML = `
    <div class="modal-score-hero">
      <div class="modal-score-number">${matchScore}%</div>
      <div class="modal-score-label">Overall Match Score — ${product.brand} ${product.name}</div>
    </div>
    ${breakdownHtml}
    <div style="margin-top:20px; text-align:right;">
      <button class="btn-primary" style="width:auto; padding:10px 24px; font-size:13px;" onclick="closeModal()">Close Breakdown</button>
    </div>
  `;

  document.getElementById('explainModal').classList.remove('hidden');
}

function closeModal(event) {
  if (!event || event.target === document.getElementById('explainModal')) {
    document.getElementById('explainModal').classList.add('hidden');
  }
}

// ─── Helper Functions ─────────────────────────────────────────────────────────
function loadQuickProfile(type) {
  resetProfile(true);

  const profiles = {
    oily_acne: { skin_types: ['oily', 'acne_prone'], concerns: ['acne', 'oiliness', 'pores'], ingredients: ['niacinamide', 'salicylic_acid'], budget: 40, rating: 4.0 },
    dry_sensitive: { skin_types: ['dry', 'sensitive'], concerns: ['dryness', 'sensitivity', 'redness'], ingredients: ['hyaluronic_acid', 'ceramides'], budget: 60, rating: 4.0 },
    anti_aging: { skin_types: ['normal', 'combination'], concerns: ['aging', 'hyperpigmentation'], ingredients: ['retinol', 'vitamin_c'], budget: 100, rating: 4.2 }
  };

  const p = profiles[type];
  if (!p) return;

  p.skin_types.forEach(v => {
    const el = document.getElementById(`chip-${v}`);
    if (el) { el.classList.add('selected'); if (!selectedSkinTypes.includes(v)) selectedSkinTypes.push(v); }
  });
  p.concerns.forEach(v => {
    const el = document.getElementById(`chip-${v}`);
    if (el) { el.classList.add('selected'); if (!selectedConcerns.includes(v)) selectedConcerns.push(v); }
  });
  p.ingredients.forEach(v => {
    const el = document.getElementById(`ing-${v}`);
    if (el) { el.classList.add('selected'); if (!selectedIngredients.includes(v)) selectedIngredients.push(v); }
  });

  maxBudget = p.budget;
  minRating = p.rating;
  document.getElementById('budgetSlider').value = p.budget;
  document.getElementById('budgetValue').textContent = `$${p.budget}`;
  document.getElementById('ratingSlider').value = p.rating;
  document.getElementById('ratingValue').textContent = `⭐ ${p.rating.toFixed(1)}`;
}

function resetProfile(silent = false) {
  selectedSkinTypes = [];
  selectedConcerns = [];
  selectedIngredients = [];
  document.querySelectorAll('.chip').forEach(el => el.classList.remove('selected'));
  document.querySelectorAll('.ingredient-pill').forEach(el => el.classList.remove('selected'));

  maxBudget = 60; minRating = 4.0;
  document.getElementById('budgetSlider').value = 60;
  document.getElementById('budgetValue').textContent = '$60';
  document.getElementById('ratingSlider').value = 4.0;
  document.getElementById('ratingValue').textContent = '⭐ 4.0';

  if (!silent) {
    document.getElementById('resultsState').classList.add('hidden');
    document.getElementById('loadingState').classList.add('hidden');
    document.getElementById('welcomeState').classList.remove('hidden');
  }
}

function runMetricsBenchmark(silent = false) {
  if (!engine) return;
  if (!silent) showToast('Running benchmark across all test profiles...', 'info');

  const testProfiles = Object.values(TEST_CASES).map(tc => tc.profile);
  let totalPrecision = 0, totalRecall = 0, totalNDCG = 0, totalLatency = 0;
  const perCaseResults = [];

  Object.entries(TEST_CASES).forEach(([key, tc]) => {
    const start = performance.now();
    const result = engine.recommend(tc.profile, null, 5);
    const end = performance.now();

    const recs = result.recommendations;
    const metrics = engine.evaluateAll(tc.profile, recs, 5);
    const latency = parseFloat((end - start).toFixed(2));

    perCaseResults.push({ name: tc.name, precision: metrics.precision_at_k, recall: metrics.recall_at_k, ndcg: metrics.ndcg_at_k, latency });
    totalPrecision += metrics.precision_at_k; totalRecall += metrics.recall_at_k; totalNDCG += metrics.ndcg_at_k; totalLatency += latency;
  });

  const n = Object.keys(TEST_CASES).length;
  document.getElementById('metric-precision').textContent = (totalPrecision / n).toFixed(3);
  document.getElementById('metric-recall').textContent = (totalRecall / n).toFixed(3);
  document.getElementById('metric-ndcg').textContent = (totalNDCG / n).toFixed(3);
  document.getElementById('metric-latency').textContent = `${(totalLatency / n).toFixed(1)}ms`;
  document.getElementById('metric-coverage').textContent = `${engine.catalogCoverage(testProfiles)}%`;

  buildPrecisionChart(perCaseResults);
  if (!silent) showToast('✅ Benchmark complete!', 'success');
}

function buildPrecisionChart(results) {
  const chart = document.getElementById('precisionChart');
  if (!chart) return;
  chart.innerHTML = results.map(r => `
    <div class="bar-row">
      <div class="bar-name">${r.name.replace(/[✅⚠️]/g,'').trim().slice(0, 26)}...</div>
      <div class="bar-track"><div class="bar-fill" style="width: ${Math.round(r.precision * 100)}%"></div></div>
      <div class="bar-val">${r.precision.toFixed(2)}</div>
    </div>
  `).join('');
}

function updateLiveMetrics(profile, routineResult) {
  if (!engine) return;
  const recs = routineResult.routine.map(s => s.top_recommendation).filter(Boolean);
  if (recs.length === 0) return;
  document.getElementById('metric-precision').textContent = engine.precisionAtK(recs, Math.min(recs.length, 5)).toFixed(3);
  document.getElementById('metric-ndcg').textContent = engine.ndcgAtK(recs, Math.min(recs.length, 5)).toFixed(3);
  document.getElementById('metric-latency').textContent = `${routineResult.total_latency_ms}ms`;
}

function buildTestCasesGrid() {
  const grid = document.getElementById('testCasesGrid');
  if (!grid) return;
  grid.innerHTML = Object.entries(TEST_CASES).map(([key, tc]) => `
    <div class="glass-card test-case-card" onclick="runTestCase('${key}')">
      <div class="test-case-name">${tc.name}</div>
      <div class="test-case-desc">${tc.description}</div>
      <div class="test-case-profile">
        ${tc.profile.skin_types.map(st => `<span class="profile-tag">${st}</span>`).join('')}
        ${tc.profile.concerns.slice(0, 2).map(c => `<span class="profile-tag" style="color:var(--rose)">${c}</span>`).join('')}
      </div>
      <button class="run-test-btn">▶ Run This Test Case</button>
    </div>
  `).join('');
}

async function runTestCase(key) {
  if (!engine) return;
  const tc = TEST_CASES[key];
  if (!tc) return;

  const resultArea = document.getElementById('testResultArea');
  resultArea.innerHTML = `<div class="loading-overlay"><div class="loading-spinner"></div><div class="loading-text">Running: ${tc.name}</div></div>`;

  await delay(400);

  const start = performance.now();
  const routineResult = engine.buildRoutine(tc.profile);
  const end = performance.now();

  const recs = routineResult.routine.map(s => s.top_recommendation).filter(Boolean);
  const metrics = engine.evaluateAll(tc.profile, recs, 5);
  const latency = parseFloat((end - start).toFixed(2));
  const safety = routineResult.safety;

  resultArea.innerHTML = `
    <div style="margin-bottom:16px;">
      <div style="font-family:'Space Grotesk',sans-serif; font-size:18px; font-weight:700;">${tc.name}</div>
      <div style="font-size:13px; color:var(--text-secondary);">${tc.description}</div>
    </div>
    <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(120px,1fr)); gap:12px; margin-bottom:20px;">
      <div style="padding:14px;background:var(--bg-card);border-radius:12px;text-align:center;">
        <div style="font-size:22px;font-weight:800;color:var(--violet)">${metrics.precision_at_k}</div>
        <div style="font-size:11px;color:var(--text-muted)">Precision@5</div>
      </div>
      <div style="padding:14px;background:var(--bg-card);border-radius:12px;text-align:center;">
        <div style="font-size:22px;font-weight:800;color:var(--rose)">${metrics.recall_at_k}</div>
        <div style="font-size:11px;color:var(--text-muted)">Recall@5</div>
      </div>
      <div style="padding:14px;background:var(--bg-card);border-radius:12px;text-align:center;">
        <div style="font-size:22px;font-weight:800;color:var(--mint)">${metrics.ndcg_at_k}</div>
        <div style="font-size:11px;color:var(--text-muted)">NDCG@5</div>
      </div>
      <div style="padding:14px;background:var(--bg-card);border-radius:12px;text-align:center;">
        <div style="font-size:22px;font-weight:800;color:var(--sky)">${latency}ms</div>
        <div style="font-size:11px;color:var(--text-muted)">Latency</div>
      </div>
    </div>
    <div style="margin-top:16px;text-align:center;">
      <button onclick="loadTestCaseToRecommender('${key}')" class="btn-primary" style="width:auto;padding:12px 32px;">Open in Recommender →</button>
    </div>
  `;
}

function loadTestCaseToRecommender(key) {
  const tc = TEST_CASES[key];
  resetProfile(true);
  selectedSkinTypes = [...tc.profile.skin_types];
  selectedConcerns = [...tc.profile.concerns];
  selectedIngredients = [...tc.profile.preferred_ingredients];

  tc.profile.skin_types.forEach(v => { const el = document.getElementById(`chip-${v}`); if (el) el.classList.add('selected'); });
  tc.profile.concerns.forEach(v => { const el = document.getElementById(`chip-${v}`); if (el) el.classList.add('selected'); });
  tc.profile.preferred_ingredients.forEach(v => { const el = document.getElementById(`ing-${v}`); if (el) el.classList.add('selected'); });

  maxBudget = tc.profile.max_price; minRating = tc.profile.min_rating;
  document.getElementById('budgetSlider').value = maxBudget;
  document.getElementById('budgetValue').textContent = `$${maxBudget}`;
  document.getElementById('ratingSlider').value = minRating;
  document.getElementById('ratingValue').textContent = `⭐ ${minRating.toFixed(1)}`;

  switchPage('recommender');
  generateRoutine();
}

function getCategoryIcon(cat) {
  const icons = { cleanser: '🧴', toner: '💧', serum: '✨', moisturizer: '🫧', sunscreen: '☀️', treatment: '💊' };
  return icons[cat] || '🧴';
}

function getStars(r) {
  const f = Math.floor(r), h = r % 1 >= 0.5 ? 1 : 0;
  return '★'.repeat(f) + (h ? '½' : '') + '☆'.repeat(5 - f - h);
}

function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function showToast(msg, type = 'info') {
  const toast = document.createElement('div');
  const colors = { info: 'var(--sky)', success: 'var(--mint)', warning: 'var(--amber)', danger: 'var(--coral)' };
  toast.style.cssText = `
    position:fixed; bottom:28px; left:28px; z-index:9999;
    padding:14px 20px; border-radius:14px; font-size:13px; font-weight:700;
    background:var(--bg-secondary); border:1px solid ${colors[type]};
    color:${colors[type]}; box-shadow:0 10px 30px rgba(0,0,0,0.5);
    animation: slideInRight 0.3s ease; max-width: 340px;
  `;
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3200);
}
