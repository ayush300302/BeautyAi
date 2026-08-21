/**
 * app.js — BeautyAI Recommendation System Controller
 * UI State Manager, Scanner Simulator, BeautyGPT Proxy Client, Metrics Dashboard
 * Orbo.ai Technical Assignment
 */

// ─── Global Application State ──────────────────────────────────────────────────
let engine = null;
let currentProducts = [];
let selectedSkinTypes = [];
let selectedConcerns = [];
let selectedIngredients = [];
let maxBudget = 60;
let minRating = 4.0;
let lastRoutineResult = null;
let lastMetricsResult = null;

// ─── Application Initialization ───────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const resp = await fetch('./dataset.json');
    const data = await resp.json();
    currentProducts = data.products || [];
    engine = new RecommendationEngine(currentProducts);

    buildTestCasesGrid();
    setTimeout(() => runMetricsBenchmark(true), 400);

    console.log(`✅ BeautyAI Engine initialized with ${currentProducts.length} products.`);
  } catch (err) {
    console.error('Failed to load product dataset:', err);
    showToast('⚠️ Failed to load product database.', 'danger');
  }
});

// ─── AI Skin Scan Simulator (Orbo.ai Inspired Demonstration Flow) ──────────────
async function runSkinScan() {
  showToast('📷 Running AI Skin Scan Simulator...', 'info');

  const hydrationEl = document.getElementById('scan-hydration');
  const sebumEl = document.getElementById('scan-sebum');
  const poresEl = document.getElementById('scan-pores');
  const scoreEl = document.getElementById('scan-score');

  if (hydrationEl) hydrationEl.textContent = 'Scanning...';
  if (sebumEl) sebumEl.textContent = 'Analyzing...';
  if (poresEl) poresEl.textContent = 'Detecting...';
  if (scoreEl) scoreEl.textContent = 'Calculating...';

  await delay(750);

  const presets = [
    { skinType: 'oily', concern: 'acne', hydration: '76%', sebum: 'High', pores: 'Enlarged', score: '88%' },
    { skinType: 'dry', concern: 'dryness', hydration: '42%', sebum: 'Low', pores: 'Normal', score: '79%' },
    { skinType: 'combination', concern: 'pores', hydration: '68%', sebum: 'T-Zone', pores: 'Moderate', score: '91%' }
  ];

  const scan = presets[Math.floor(Math.random() * presets.length)];

  if (hydrationEl) hydrationEl.textContent = scan.hydration;
  if (sebumEl) sebumEl.textContent = scan.sebum;
  if (poresEl) poresEl.textContent = scan.pores;
  if (scoreEl) scoreEl.textContent = scan.score;

  loadQuickProfile(scan.skinType === 'oily' ? 'oily_acne' : 'dry_sensitive');

  showToast(`✅ Scan Complete (Simulated): ${scan.skinType.toUpperCase()} skin + ${scan.concern.toUpperCase()}`, 'success');
  generateRoutine();
}

// ─── BeautyGPT Assistant (Secure Server Proxy + Local Recommendation Engine) ───
function toggleGptModal() {
  const modal = document.getElementById('gptModal');
  if (modal) modal.classList.toggle('hidden');
}

function handleGptKey(e) {
  if (e.key === 'Enter') sendGptMsg();
}

async function sendGptMsg() {
  const input = document.getElementById('gptInput');
  const txt = input ? input.value.trim() : '';
  if (!txt) return;

  const msgs = document.getElementById('gptMessages');
  if (!msgs) return;

  // Render user message
  const userDiv = document.createElement('div');
  userDiv.className = 'gpt-msg user';
  userDiv.textContent = txt;
  msgs.appendChild(userDiv);

  input.value = '';
  msgs.scrollTop = msgs.scrollHeight;

  // Render typing indicator
  const botDiv = document.createElement('div');
  botDiv.className = 'gpt-msg bot';
  botDiv.innerHTML = '<span style="opacity:0.6">BeautyGPT is thinking...</span>';
  msgs.appendChild(botDiv);
  msgs.scrollTop = msgs.scrollHeight;

  // STEP 1: Strict Out-of-Scope & Special Intent Pre-Check
  const preCheckReply = checkPreRoutingIntents(txt);
  if (preCheckReply) {
    setTimeout(() => {
      botDiv.innerHTML = preCheckReply;
      msgs.scrollTop = msgs.scrollHeight;
    }, 250);
    return;
  }

  // STEP 2: Product Catalog Recommendation Intent Check (Uses BeautyAI Engine)
  if (isCatalogRecommendationIntent(txt)) {
    setTimeout(() => {
      const recReply = handleProductRecommendationQuery(txt);
      botDiv.innerHTML = recReply;
      msgs.scrollTop = msgs.scrollHeight;
    }, 350);
    return;
  }

  // STEP 3: Conversational Skincare Query -> OpenRouter Server Proxy (Gemini 2.5)
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: txt })
    });

    if (res.ok) {
      const data = await res.json();
      if (data.status === 'success' && data.message) {
        let reply = data.message.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        botDiv.innerHTML = reply;
        msgs.scrollTop = msgs.scrollHeight;
        return;
      }
    }
  } catch (err) {
    console.warn('Server LLM Proxy request failed:', err.message);
  }

  // STEP 4: Honest Fallback when OpenRouter API is unavailable / offline
  setTimeout(() => {
    botDiv.innerHTML = `⚠️ <strong>AI Connection Temporarily Unavailable</strong><br/>I couldn't reach the OpenRouter AI service right now. You can try asking again in a moment, or use the interactive <strong>Recommender</strong> panel on the left to generate personalized product routines!`;
    msgs.scrollTop = msgs.scrollHeight;
  }, 350);
}

/**
 * Pre-Routing Intent Check (Greetings, Gratitude, Affection, Out-of-Scope)
 */
function checkPreRoutingIntents(userQuery) {
  const q = userQuery.toLowerCase().trim();

  // Affection ("i love you", "love u", "marry me")
  if (/\b(love|marry|date|cute|sweet|handsome)\b/.test(q) && (q.includes('you') || q.includes('u') || q.length < 16)) {
    return "Aww, thank you so much! 💖 I love helping you get healthy, glowing skin! Tell me your skin type or concern, and let's find your perfect routine ✨";
  }

  // Greetings ("hi", "hello", "hey", "good morning")
  if (/^(hi|hello|hey|heyya|sup|good morning|good evening|greetings)\b/.test(q)) {
    return "Hello there! ✨ Ready to build your personalized skincare routine? Tell me your skin type (Oily, Dry, Combination, Sensitive) or any concerns you have!";
  }

  // Gratitude ("thanks", "thank you")
  if (/\b(thank|thanks|thx|cool|great|awesome|helpful)\b/.test(q)) {
    return "You're very welcome! 🌟 Stay consistent with your daily routine for the best skin results. Let me know if you need any ingredient safety checks!";
  }

  // Out-of-Scope Non-Skincare Query (math, coding, politics, capital of France)
  if (/\b(python|javascript|code|math|calculate|capital of france|president|recipe|weather|politics|football|cricket match score)\b/.test(q) && !/\b(skin|skincare|sckincare|face|cream|acne|serum|sunscreen|routine|moisturizer|cleanser)\b/.test(q)) {
    return "I am specialized strictly as your **AI Beauty Advisor** 🧴. I can only assist with skincare routines, skin types, product matching, ingredients, and dermatological safety!";
  }

  return null;
}

/**
 * Product Catalog Recommendation Intent Classifier
 */
function isCatalogRecommendationIntent(userQuery) {
  const q = userQuery.toLowerCase().trim();
  const recKeywords = /\b(recommend|recommendation|catalog|product for|buy|under my budget|under \$\d+|best product|pick a cleanser|pick a moisturizer|top product)\b/;
  return recKeywords.test(q);
}

/**
 * Executes Recommendation Engine for Product Recommendation Queries
 */
function handleProductRecommendationQuery(userQuery) {
  if (!engine) return "BeautyAI Recommendation Engine is initializing. Please try again in a moment!";

  const q = userQuery.toLowerCase().trim();
  let skinType = selectedSkinTypes[0] || 'oily';
  if (q.includes('dry')) skinType = 'dry';
  if (q.includes('combination')) skinType = 'combination';
  if (q.includes('sensitive')) skinType = 'sensitive';
  if (q.includes('oily')) skinType = 'oily';

  let category = null;
  if (q.includes('cleanser')) category = 'cleanser';
  if (q.includes('toner')) category = 'toner';
  if (q.includes('serum')) category = 'serum';
  if (q.includes('moisturizer')) category = 'moisturizer';
  if (q.includes('sunscreen') || q.includes('spf')) category = 'sunscreen';

  const userProfile = {
    skin_types: [skinType],
    concerns: [...selectedConcerns],
    preferred_ingredients: [...selectedIngredients],
    max_price: maxBudget,
    min_rating: minRating
  };

  const res = engine.recommend(userProfile, category, 3);
  if (!res.recommendations || res.recommendations.length === 0) {
    return `I searched our catalog for **${skinType}** skin, but no products matched your budget ($${maxBudget}) or rating constraints. Try increasing your max budget!`;
  }

  const top = res.recommendations[0];
  const p = top.product;

  return `Based on our **BeautyAI Hybrid Engine** (Canonical Score: <strong>${top.match_score}%</strong>):<br/><br/>
  🌟 <strong>${p.brand} ${p.name}</strong> ($${p.price.toFixed(2)})<br/>
  ⭐ Rating: <strong>${p.rating} / 5.0</strong> (${p.rating_count.toLocaleString()} reviews)<br/>
  ✨ Active Ingredients: <strong>${p.active_ingredients.join(', ')}</strong><br/><br/>
  <em>${p.description}</em>`;
}

// ─── Page Switching ────────────────────────────────────────────────────────────
function switchPage(page) {
  document.querySelectorAll('.page-section').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(el => el.classList.remove('active'));

  const targetPage = document.getElementById(`page-${page}`);
  if (targetPage) targetPage.classList.add('active');

  const navEl = document.getElementById(`nav-${page}`);
  if (navEl) navEl.classList.add('active');
}

// ─── UI Filter Toggles & Sliders ───────────────────────────────────────────────
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

function updateBudget(val) {
  maxBudget = parseFloat(val);
  const el = document.getElementById('budgetValue');
  if (el) el.textContent = `$${val}`;
}

function updateRating(val) {
  minRating = parseFloat(val);
  const el = document.getElementById('ratingValue');
  if (el) el.textContent = `⭐ ${parseFloat(val).toFixed(1)}`;
}

// ─── Recommendation Generation ─────────────────────────────────────────────────
async function generateRoutine() {
  if (!engine) { showToast('Engine initializing...', 'warning'); return; }

  const welcomeState = document.getElementById('welcomeState');
  const resultsState = document.getElementById('resultsState');
  const loadingState = document.getElementById('loadingState');

  if (welcomeState) welcomeState.classList.add('hidden');
  if (resultsState) resultsState.classList.add('hidden');
  if (loadingState) loadingState.classList.remove('hidden');

  const userProfile = {
    skin_types: [...selectedSkinTypes],
    concerns: [...selectedConcerns],
    preferred_ingredients: [...selectedIngredients],
    max_price: maxBudget,
    min_rating: minRating
  };

  await delay(450);

  const routineResult = engine.buildRoutine(userProfile);
  lastRoutineResult = routineResult;

  if (loadingState) loadingState.classList.add('hidden');
  if (resultsState) resultsState.classList.remove('hidden');

  renderRoutine(routineResult);
  updateLiveMetrics(userProfile, routineResult);
}

// ─── Routine Output Rendering ──────────────────────────────────────────────────
function renderRoutine(routineResult) {
  const { routine, safety, total_latency_ms } = routineResult;

  const metaEl = document.getElementById('routineMeta');
  if (metaEl) {
    const safeClass = safety.safe ? '' : 'warning';
    metaEl.innerHTML = `
      <div class="meta-badge">${routine.length} steps</div>
      <div class="meta-badge ${safeClass}">${safety.safe ? '✅ Routine Safe' : '⚠️ Check Warnings'}</div>
      <div class="meta-badge">${total_latency_ms}ms</div>
    `;
  }

  const safetyEl = document.getElementById('safetyBanner');
  if (safetyEl) {
    if (safety.safe) {
      safetyEl.className = 'safety-banner';
      safetyEl.innerHTML = `<strong>✅ Ingredient Safety Check Passed</strong><p>All products in this routine are compatible. No conflicting ingredient combinations detected.</p>`;
    } else {
      safetyEl.className = 'safety-banner has-warnings';
      safetyEl.innerHTML = `<strong>⚠️ Ingredient Conflict Detected</strong><p>${safety.warnings.join('<br>')}</p>`;
    }
  }

  const stepsEl = document.getElementById('routineSteps');
  if (!stepsEl) return;
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
      <div class="product-swatch" style="background: ${product.image_color || '#333'}25; border: 1px solid ${product.image_color || '#555'}50;">
        <span style="font-size:34px; position:relative; z-index:1;">${iconChar}</span>
      </div>
      <div class="product-info">
        <div class="product-brand">${product.brand}</div>
        <div class="product-name">${product.name}</div>
        <div class="product-desc">${product.description}</div>
        <div class="product-tags">
          ${(product.tags || []).slice(0, 4).map(t => `<span class="product-tag">${t}</span>`).join('')}
          ${product.fragrance_free ? '<span class="product-tag" style="color:var(--mint);border-color:rgba(52,211,153,0.3)">fragrance-free</span>' : ''}
        </div>
        <div class="product-footer">
          <div class="product-price">$${(product.price || 0).toFixed(2)} <span>per unit</span></div>
          <div class="product-rating">
            <span class="rating-stars">${getStars(product.rating || 0)}</span>
            ${product.rating} (${(product.rating_count || 0).toLocaleString()} reviews)
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
        ${bd && bd.concern_match ? `
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

// ─── Score Explanation Breakdown Modal ─────────────────────────────────────────
function openModal(productId, stepIdx) {
  let product = null;
  let rec = null;

  if (lastRoutineResult && lastRoutineResult.routine && lastRoutineResult.routine[stepIdx]) {
    rec = lastRoutineResult.routine[stepIdx].top_recommendation;
    if (rec && rec.product) product = rec.product;
  }

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

  const matchScore = rec ? rec.match_score : Math.round((product.rating || 0) * 20);
  const bd = (rec && rec.explanation) ? rec.explanation : null;

  const titleEl = document.getElementById('modalTitle');
  if (titleEl) titleEl.textContent = `Why Recommended? ${product.brand} — ${product.name}`;

  let breakdownHtml = '';
  if (bd && bd.concern_match) {
    const items = [
      { label: 'Concern Match (35%)', score: bd.concern_match.score, color: 'var(--rose)', note: `Matched concerns: ${bd.concern_match.matched.join(', ') || 'None'}` },
      { label: 'Skin Type Compatibility (25%)', score: bd.skin_type_match.score, color: 'var(--violet)', note: `Matched types: ${bd.skin_type_match.matched.join(', ') || 'None'}` },
      { label: 'Ingredient Synergy (20%)', score: bd.ingredient_synergy.score, color: 'var(--mint)', note: `Matched ingredients: ${bd.ingredient_synergy.matched.join(', ') || 'No preference set (neutral score)'}` },
      { label: 'Rating Weight (12%)', score: bd.rating_weight.score, color: 'var(--gold)', note: `${product.rating}/5.0 stars (${(product.rating_count || 0).toLocaleString()} reviews)` },
      { label: 'Budget Fit (8%)', score: bd.budget_fit.score, color: 'var(--sky)', note: `$${(product.price || 0).toFixed(2)} vs. $${maxBudget} budget limit` }
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
          <div class="breakdown-score" style="color:var(--gold)">${Math.round((product.rating || 0) * 20)}%</div>
        </div>
        <div class="breakdown-bar">
          <div class="breakdown-bar-fill" style="width:${Math.round((product.rating || 0) * 20)}%; background:var(--gold)"></div>
        </div>
        <div class="breakdown-matches">${product.rating}/5.0 stars (${(product.rating_count || 0).toLocaleString()} reviews)</div>
      </div>
    `;
  }

  const contentEl = document.getElementById('modalContent');
  if (contentEl) {
    contentEl.innerHTML = `
      <div class="modal-score-hero">
        <div class="modal-score-number">${matchScore}%</div>
        <div class="modal-score-label">Canonical Final Ranking Score — ${product.brand} ${product.name}</div>
        <div style="font-size:12px; opacity:0.8; margin-top:4px;">Formula: 0.70 × Cosine Similarity + 0.30 × Bayesian Rating</div>
      </div>
      ${breakdownHtml}
      <div style="margin-top:20px; text-align:right;">
        <button class="btn-primary" style="width:auto; padding:10px 24px; font-size:13px;" onclick="closeModal()">Close Breakdown</button>
      </div>
    `;
  }

  const modal = document.getElementById('explainModal');
  if (modal) modal.classList.remove('hidden');
}

function closeModal(event) {
  if (!event || event.target === document.getElementById('explainModal')) {
    const modal = document.getElementById('explainModal');
    if (modal) modal.classList.add('hidden');
  }
}

// ─── Real Offline Evaluation Dashboard Controller (Phases 12-24) ───────────────
function runMetricsBenchmark(silent = false) {
  if (!engine) return;
  if (!silent) showToast('Running offline evaluation suite...', 'info');

  const testProfiles = Object.values(TEST_CASES).map(tc => tc.profile);
  const suiteResults = engine.evaluateSuite(testProfiles);

  lastMetricsResult = suiteResults;

  // Safe Metric Renderer Utility: guarantees Number.isFinite to prevent NaN / Infinity / rendering errors
  const safeVal = (val, dec = 3, fallback = 'N/A') => {
    return Number.isFinite(val) ? val.toFixed(dec) : fallback;
  };

  // Populate Dashboard Metric Cards
  setElText('metric-p3', safeVal(suiteResults.precision[3], 3));
  setElText('metric-p5', safeVal(suiteResults.precision[5], 3));
  setElText('metric-p10', safeVal(suiteResults.precision[10], 3));

  setElText('metric-r3', safeVal(suiteResults.recall[3], 3));
  setElText('metric-r5', safeVal(suiteResults.recall[5], 3));
  setElText('metric-r10', safeVal(suiteResults.recall[10], 3));

  setElText('metric-ndcg3', safeVal(suiteResults.ndcg[3], 3));
  setElText('metric-ndcg5', safeVal(suiteResults.ndcg[5], 3));
  setElText('metric-ndcg10', safeVal(suiteResults.ndcg[10], 3));

  setElText('metric-coverage', Number.isFinite(suiteResults.coverage) ? `${suiteResults.coverage}%` : 'N/A');
  setElText('metric-diversity', safeVal(suiteResults.diversity, 3));
  setElText('metric-latency-avg', Number.isFinite(suiteResults.latency.avg) ? `${suiteResults.latency.avg}ms` : 'N/A');
  setElText('metric-safety-pct', Number.isFinite(suiteResults.safety_compliance_pct) ? `${suiteResults.safety_compliance_pct}%` : 'N/A');

  // Build Precision@5 Chart
  buildPrecisionChart(suiteResults.precision[5]);

  if (!silent) showToast('✅ Offline evaluation suite executed cleanly!', 'success');
}

function setElText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function buildPrecisionChart(precision5Avg) {
  const chart = document.getElementById('precisionChart');
  if (!chart) return;

  const perCaseResults = Object.entries(TEST_CASES).map(([key, tc]) => {
    const p = engine.precisionAtK(tc.profile, engine.recommend(tc.profile, null, 5).recommendations, 5);
    return { name: tc.name, precision: Number.isFinite(p) ? p : 0 };
  });

  chart.innerHTML = perCaseResults.map(r => `
    <div class="bar-row">
      <div class="bar-name">${r.name.replace(/[✅⚠️]/g, '').trim().slice(0, 28)}...</div>
      <div class="bar-track"><div class="bar-fill" style="width: ${Math.round(r.precision * 100)}%"></div></div>
      <div class="bar-val">${r.precision.toFixed(2)}</div>
    </div>
  `).join('');
}

function updateLiveMetrics(profile, routineResult) {
  if (!engine) return;
  const recs = routineResult.routine.map(s => s.top_recommendation).filter(Boolean);
  if (recs.length === 0) return;

  const p5 = engine.precisionAtK(profile, recs, 5);
  const ndcg5 = engine.ndcgAtK(profile, recs, 5);

  setElText('metric-p5', Number.isFinite(p5) ? p5.toFixed(3) : 'N/A');
  setElText('metric-ndcg5', Number.isFinite(ndcg5) ? ndcg5.toFixed(3) : 'N/A');
  setElText('metric-latency-avg', `${routineResult.total_latency_ms}ms`);
}

// ─── Test Cases Grid Controller (Phase 25) ────────────────────────────────────
function buildTestCasesGrid() {
  const grid = document.getElementById('testCasesGrid');
  if (!grid) return;
  grid.innerHTML = Object.entries(TEST_CASES).map(([key, tc]) => `
    <div class="glass-card test-case-card" onclick="runTestCase('${key}')">
      <div class="test-case-name">${tc.name}</div>
      <div class="test-case-desc">${tc.description}</div>
      <div class="test-case-profile">
        ${(tc.profile.skin_types || []).map(st => `<span class="profile-tag">${st}</span>`).join('')}
        ${(tc.profile.concerns || []).slice(0, 2).map(c => `<span class="profile-tag" style="color:var(--rose)">${c}</span>`).join('')}
      </div>
      <button class="run-test-btn">▶ Run Test Case Execution</button>
    </div>
  `).join('');
}

async function runTestCase(key) {
  if (!engine) return;
  const tc = TEST_CASES[key];
  if (!tc) return;

  const resultArea = document.getElementById('testResultArea');
  if (resultArea) {
    resultArea.innerHTML = `<div class="loading-overlay"><div class="loading-spinner"></div><div class="loading-text">Executing Test Case: ${tc.name}</div></div>`;
  }

  await delay(350);

  const start = performance.now();
  const routineResult = engine.buildRoutine(tc.profile);
  const end = performance.now();

  const recs = routineResult.routine.map(s => s.top_recommendation).filter(Boolean);
  const p5 = engine.precisionAtK(tc.profile, recs, 5);
  const r5 = engine.recallAtK(tc.profile, recs, 5);
  const ndcg5 = engine.ndcgAtK(tc.profile, recs, 5);
  const latency = parseFloat((end - start).toFixed(2));
  const safety = routineResult.safety;

  if (resultArea) {
    resultArea.innerHTML = `
      <div style="margin-bottom:16px;">
        <div style="font-family:'Space Grotesk',sans-serif; font-size:18px; font-weight:700;">${tc.name}</div>
        <div style="font-size:13px; color:var(--text-secondary); margin-top:4px;">${tc.description}</div>
      </div>
      <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(120px,1fr)); gap:12px; margin-bottom:20px;">
        <div style="padding:14px;background:var(--bg-card);border-radius:12px;text-align:center;">
          <div style="font-size:22px;font-weight:800;color:var(--violet)">${Number.isFinite(p5) ? p5.toFixed(3) : 'N/A'}</div>
          <div style="font-size:11px;color:var(--text-muted)">Precision@5</div>
        </div>
        <div style="padding:14px;background:var(--bg-card);border-radius:12px;text-align:center;">
          <div style="font-size:22px;font-weight:800;color:var(--rose)">${Number.isFinite(r5) ? r5.toFixed(3) : 'N/A'}</div>
          <div style="font-size:11px;color:var(--text-muted)">Recall@5</div>
        </div>
        <div style="padding:14px;background:var(--bg-card);border-radius:12px;text-align:center;">
          <div style="font-size:22px;font-weight:800;color:var(--mint)">${Number.isFinite(ndcg5) ? ndcg5.toFixed(3) : 'N/A'}</div>
          <div style="font-size:11px;color:var(--text-muted)">NDCG@5</div>
        </div>
        <div style="padding:14px;background:var(--bg-card);border-radius:12px;text-align:center;">
          <div style="font-size:22px;font-weight:800;color:var(--sky)">${latency}ms</div>
          <div style="font-size:11px;color:var(--text-muted)">Latency</div>
        </div>
      </div>
      ${!safety.safe ? `
        <div style="padding:14px; background:rgba(251,191,36,0.1); border:1px solid rgba(251,191,36,0.3); border-radius:12px; margin-bottom:16px;">
          <div style="font-size:13px; font-weight:700; color:var(--amber); margin-bottom:4px;">⚠️ Safety Warning Interception</div>
          <div style="font-size:12px; color:var(--text-secondary);">${safety.warnings.join('<br>')}</div>
        </div>
      ` : ''}
      <div style="margin-top:16px;text-align:center;">
        <button onclick="loadTestCaseToRecommender('${key}')" class="btn-primary" style="width:auto;padding:12px 32px;">Load & Run in Recommender →</button>
      </div>
    `;
  }
}

function loadTestCaseToRecommender(key) {
  const tc = TEST_CASES[key];
  resetProfile(true);

  selectedSkinTypes = [...tc.profile.skin_types];
  selectedConcerns = [...tc.profile.concerns];
  selectedIngredients = [...(tc.profile.preferred_ingredients || [])];

  tc.profile.skin_types.forEach(v => { const el = document.getElementById(`chip-${v}`); if (el) el.classList.add('selected'); });
  tc.profile.concerns.forEach(v => { const el = document.getElementById(`chip-${v}`); if (el) el.classList.add('selected'); });
  (tc.profile.preferred_ingredients || []).forEach(v => { const el = document.getElementById(`ing-${v}`); if (el) el.classList.add('selected'); });

  maxBudget = tc.profile.max_price || 60;
  minRating = tc.profile.min_rating || 4.0;

  const bSlider = document.getElementById('budgetSlider');
  if (bSlider) bSlider.value = maxBudget;
  const bVal = document.getElementById('budgetValue');
  if (bVal) bVal.textContent = `$${maxBudget}`;

  const rSlider = document.getElementById('ratingSlider');
  if (rSlider) rSlider.value = minRating;
  const rVal = document.getElementById('ratingValue');
  if (rVal) rVal.textContent = `⭐ ${minRating.toFixed(1)}`;

  switchPage('recommender');
  generateRoutine();
}

function loadQuickProfile(type) {
  resetProfile(true);

  const profiles = {
    oily_acne: { skin_types: ['oily', 'acne_prone'], concerns: ['acne', 'oiliness', 'pores'], ingredients: ['niacinamide', 'salicylic_acid'], budget: 40, rating: 4.0 },
    dry_sensitive: { skin_types: ['dry', 'sensitive'], concerns: ['dryness', 'sensitivity', 'redness'], ingredients: ['hyaluronic_acid', 'ceramides'], budget: 60, rating: 4.0 },
    anti_aging: { skin_types: ['normal', 'combination'], concerns: ['aging', 'hyperpigmentation'], ingredients: ['retinol', 'vitamin_c'], budget: 100, rating: 4.2 }
  };

  const p = profiles[type];
  if (!p) return;

  p.skin_types.forEach(v => { const el = document.getElementById(`chip-${v}`); if (el) { el.classList.add('selected'); if (!selectedSkinTypes.includes(v)) selectedSkinTypes.push(v); } });
  p.concerns.forEach(v => { const el = document.getElementById(`chip-${v}`); if (el) { el.classList.add('selected'); if (!selectedConcerns.includes(v)) selectedConcerns.push(v); } });
  p.ingredients.forEach(v => { const el = document.getElementById(`ing-${v}`); if (el) { el.classList.add('selected'); if (!selectedIngredients.includes(v)) selectedIngredients.push(v); } });

  maxBudget = p.budget; minRating = p.rating;
  const bSlider = document.getElementById('budgetSlider'); if (bSlider) bSlider.value = p.budget;
  const bVal = document.getElementById('budgetValue'); if (bVal) bVal.textContent = `$${p.budget}`;
  const rSlider = document.getElementById('ratingSlider'); if (rSlider) rSlider.value = p.rating;
  const rVal = document.getElementById('ratingValue'); if (rVal) rVal.textContent = `⭐ ${p.rating.toFixed(1)}`;
}

function resetProfile(silent = false) {
  selectedSkinTypes = [];
  selectedConcerns = [];
  selectedIngredients = [];
  document.querySelectorAll('.chip').forEach(el => el.classList.remove('selected'));
  document.querySelectorAll('.ingredient-pill').forEach(el => el.classList.remove('selected'));

  maxBudget = 60; minRating = 4.0;
  const bSlider = document.getElementById('budgetSlider'); if (bSlider) bSlider.value = 60;
  const bVal = document.getElementById('budgetValue'); if (bVal) bVal.textContent = '$60';
  const rSlider = document.getElementById('ratingSlider'); if (rSlider) rSlider.value = 4.0;
  const rVal = document.getElementById('ratingValue'); if (rVal) rVal.textContent = '⭐ 4.0';

  if (!silent) {
    const resState = document.getElementById('resultsState'); if (resState) resState.classList.add('hidden');
    const loadState = document.getElementById('loadingState'); if (loadState) loadState.classList.add('hidden');
    const welState = document.getElementById('welcomeState'); if (welState) welState.classList.remove('hidden');
  }
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
    background:var(--bg-secondary); border:1px solid ${colors[type] || colors.info};
    color:${colors[type] || colors.info}; box-shadow:0 10px 30px rgba(0,0,0,0.5);
    animation: slideInRight 0.3s ease; max-width: 340px;
  `;
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3200);
}
