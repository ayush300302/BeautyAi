# BeautyAI — Personalized Skincare Recommendation Engine
> **Technical Assignment Submission** | Inspired by **[Orbo.ai](https://orbo.ai/)** & **Nykaa**
>
> 🌐 **Live Azure Deployment**: [https://beautyai-recommender-app.azurewebsites.net](https://beautyai-recommender-app.azurewebsites.net)  
> 📦 **GitHub Repository**: [https://github.com/ayush300302/BeautyAi](https://github.com/ayush300302/BeautyAi)

BeautyAI is a personalized 5-step skincare routine recommendation system designed to match users with optimal product routines based on skin type, primary concerns, maximum budget, target rating, and active ingredient preferences.

---

## 📖 1. Problem Statement & Motivation

Selecting skincare products is challenging due to complex active ingredients (Retinol, Vitamin C, Salicylic Acid, Niacinamide), varying skin types, and potential ingredient contraindications that can cause skin irritation. BeautyAI solves this by providing:
- **Canonical Hybrid Scoring**: Combining user-item content compatibility (70%) with Bayesian-weighted product quality (30%).
- **Deterministic Routine Safety**: Rule-based contraindication checking to prevent dangerous active ingredient pairings.
- **Explainable Scores**: Transparent component score breakdown for every recommendation.
- **Conversational Assistant**: BeautyGPT advisor backed by server-side LLM proxy & local guardrails fallback.

---

## 🛠️ 2. Quick Start & Running Locally

### Option 1: Live Azure Cloud Deployment
Access the live application anywhere:  
👉 **[https://beautyai-recommender-app.azurewebsites.net](https://beautyai-recommender-app.azurewebsites.net)**

### Option 2: Node.js Express Server (Secure Production Setup)
```bash
npm install
npm start
```
Open **`http://localhost:8000`** in your browser. (Configure server-side LLM using `set OPENROUTER_API_KEY=sk-or-v1-...` before starting).

### Option 3: Reproducible Python Evaluation Benchmark
Run the standalone CLI benchmark suite:
```bash
python recommendation_engine.py --benchmark
```

---

## 📐 3. Recommendation Architecture & Pipeline

BeautyAI follows a multi-stage deterministic recommendation pipeline:

```
┌────────────────────────────────┐
│      User Skin Profile Input   │ (Skin Type, Concerns, Ingredients, Budget, Rating)
└───────────────┬────────────────┘
                │
                ▼
┌────────────────────────────────┐
│     Candidate Filtering        │ Filter by category, max price ($), min rating (⭐)
└───────────────┬────────────────┘
                │
                ▼
┌────────────────────────────────┐
│  Dynamic Feature Vector Space  │ Encode binary flags & normalized rating/price
└───────────────┬────────────────┘
                │
        ┌───────┴────────────────────────┐
        ▼                                ▼
┌───────────────────────────┐  ┌───────────────────────────┐
│ Cosine Similarity (70%)   │  │ Bayesian Rating (30%)     │
│ Sim(U, P) = (U · P)/(|U||P|) │  │ (C*m + n*r) / (C + n)   │
└───────────────┬───────────┘  └───────────┬───────────┘
                │                          │
                └───────────┬──────────────┘
                            │
                            ▼
┌────────────────────────────────┐
│ Canonical Score Computation    │ final_score = 0.70 * Cosine + 0.30 * Bayesian_Norm
└───────────────┬────────────────┘
                │
                ▼
┌────────────────────────────────┐
│     Strict Sorting & Ranking   │ Rank candidates descending by final_score
└───────────────┬────────────────┘
                │
                ▼
┌────────────────────────────────┐
│  Safety Constraint Validator   │ Validate active ingredient contraindication rules
└───────────────┬────────────────┘
                │
                ▼
┌────────────────────────────────┐
│ 5-Step Routine Recommendation  │ Top-K items for Cleanser, Toner, Serum,
└────────────────────────────────┘ Moisturizer, and Sunscreen
```

### Mathematical Formulation

1. **Dynamic Feature Vector Representation**:
   Every product $P$ and user profile $U$ is encoded in a dynamic vector space constructed from dataset vocabularies:
   $$V = [\text{SkinTypes}_{1..6}, \text{Concerns}_{1..N}, \text{Ingredients}_{1..M}, \text{RatingNorm}, \text{PriceNorm}]$$

2. **Cosine Similarity**:
   $$\text{Sim}(U, P) = \frac{U \cdot P}{\|U\| \|P\|} = \frac{\sum_{i} U_i P_i}{\sqrt{\sum_{i} U_i^2} \sqrt{\sum_{i} P_i^2}}$$

3. **Bayesian Adjusted Rating**:
   $$R_{\text{Bayes}}(P) = \frac{C \cdot m + n \cdot r}{C + n}$$
   Where $C = 1000$ (confidence vote threshold), $m = 4.5$ (global mean rating), $n$ is review count, and $r$ is raw rating.

4. **Canonical Ranking Formula**:
   $$\text{final\_score} = 0.70 \times \text{Sim}(U, P) + 0.30 \times \text{Norm}(R_{\text{Bayes}}(P))$$
   All product candidate lists are sorted strictly descending by $\text{final\_score}$.

5. **Ingredient Safety Layer**:
   Deterministic rule check intercepting conflicting active ingredient pairs (e.g. `Retinol` + `High AHA/BHA`).

---

## 🔒 4. Server-Side Security & BeautyGPT Architecture

```
Frontend (Browser)  ───(POST /api/chat)───>  Node.js Backend (server.js)  ───(Bearer OPENROUTER_API_KEY)───>  OpenRouter API (Gemini 2.5)
                                                      │
                                            (If API unconfigured or fails)
                                                      │
                                                      ▼
                                           Local Guardrails Engine
```

- **Zero Client Secret Exposure**: `OPENROUTER_API_KEY` is strictly managed server-side via environment variables (`process.env.OPENROUTER_API_KEY`). No secrets are present in frontend bundles.
- **Graceful Deterministic Fallback**: If OpenRouter API is unconfigured or offline, `server.js` and `app.js` fallback to local Beauty Advisor rules without crashing.
- **Ranking Isolation**: The LLM is strictly a conversational advisor and does NOT influence candidate filtering or product ranking.

---

## 📊 5. Offline Evaluation & Independent Ground Truth

To evaluate recommendation performance without circular reasoning, BeautyAI implements an **independent attribute-based ground-truth relevance function $R(u, p) \in \{0, 1, 2, 3\}$ calculated purely from product metadata vs user profiles**, completely independent of the model's `final_score`:
- **3 (Highly Relevant)**: Product satisfies skin type AND matches primary concern AND contains preferred ingredient.
- **2 (Relevant)**: Product satisfies skin type AND matches primary concern.
- **1 (Weakly Relevant)**: Product satisfies skin type OR primary concern.
- **0 (Not Relevant)**: Incompatible skin type and no concern match.

### Evaluation Metrics Summary (Calculated Live across Evaluation Suite)

| Category | Metric | Score (K=3) | Score (K=5) | Score (K=10) | Description |
| :--- | :--- | :---: | :---: | :---: | :--- |
| **Ranking Quality** | **Precision@K** | **0.667** | **0.633** | **0.633** | Fraction of top-K recommendations relevant ($R \ge 2$) |
| | **Recall@K** | **0.096** | **0.151** | **0.305** | Fraction of all catalog relevant products surfaced in top-K |
| | **NDCG@K** | **0.638** | **0.600** | **0.599** | Normalized Discounted Cumulative Gain with ideal IDCG |
| **Catalog & Diversity** | **Catalog Coverage** | — | **40.0%** | — | % of distinct catalog products surfaced |
| | **Category Diversity** | — | **0.633** | — | Intra-list category dissimilarity ratio |
| **Performance & Safety** | **Average Latency** | — | **0.6 ms** | — | Pure execution latency (Min: 0.1ms, Max: 1.1ms) |
| | **Safety Compliance** | — | **66.7%** | — | % of routines with zero contraindication warnings |

---

## 🧪 6. Test Cases & Validation Suite

1. **✅ Success: Oily + Acne-Prone Skin**
   - *Input*: Oily skin, Acne/Pores concerns, Salicylic Acid & Niacinamide, Max Price $40.
   - *Behavior*: Precision@5 = 1.000, Top picks: *CeraVe Foaming Cleanser* & *The Ordinary Niacinamide*.
2. **✅ Success: Dry + Sensitive Skin (Anti-Aging)**
   - *Input*: Dry/Sensitive skin, Aging/Dryness concerns, Ceramides & Hyaluronic Acid, Max Price $60.
   - *Behavior*: Precision@5 = 1.000, Top picks: *CeraVe Moisturizing Cream* & *La Roche-Posay Toleriane*.
3. **✅ Success: Normal + Hyperpigmentation**
   - *Input*: Normal skin, Pigmentation concern, Vitamin C & Glycolic Acid, Max Price $100.
   - *Behavior*: Precision@5 = 0.600, NDCG@5 = 0.600.
4. **⚠️ Edge: Cold Start (No User Profile)**
   - *Behavior*: Graceful fallback to top Bayesian-rated products.
5. **⚠️ Edge: Conflicting Ingredient Needs**
   - *Behavior*: Safety validator intercepts Retinol + AHA/BHA combination and displays warning.
6. **⚠️ Edge: Extremely Restrictive Budget ($8)**
   - *Behavior*: Over-constrained profile yields 0 candidates cleanly without UI crash.

---

## 🔬 7. Benchmark & Comparison Matrix

| Dimension | BeautyAI (Ours) | Orbo.ai | Nykaa |
| :--- | :---: | :---: | :---: |
| **Recommendation Engine** | Hybrid Content-Based + Bayesian Rating | LLM + Computer Vision + Content | Collaborative Filtering |
| **Skin Diagnostic Flow** | Form + AI Scan Simulator | Live Camera AR/CV Scan | Manual Quiz |
| **Ingredient Safety Validator** | Deterministic Rule Engine | Dermatologist DB | None |
| **Score Explainability** | Full Breakdown Modal | Partial in BeautyGPT | None |
| **Offline Evaluation Suite** | Precision, Recall, NDCG @ 3, 5, 10 | Proprietary | Proprietary |
| **Conversational Assistant** | BeautyGPT Server Proxy | BeautyGPT Platform | Search Filter Only |

---

## ⚠️ 8. Known Limitations & Future Work

### Current Limitations
- **No User Interaction History**: Recommendations rely on content metadata without user-item click/purchase logs.
- **Attribute-Based Heuristic Ground Truth**: Offline evaluation uses heuristic ground truth $R(u,p)$ due to lack of real user rating matrices.
- **Simulated Diagnostic Flow**: AI Skin Scan Simulator simulates diagnostic parameter selection without real computer vision.

### Future Scope
- **User Interaction Logging & Collaborative Filtering**: Incorporate user click matrices & matrix factorization (SVD/ALS).
- **Learning-to-Rank (LTR)**: Train pairwise/listwise ranking models on user conversion data.
- **WebAR Computer Vision**: Integrate real-time facial landmark mesh scanning via MediaPipe.

---

## 📁 9. Project Directory Structure

```
├── dataset.json                 # 45 curated skincare products with complete metadata
├── index.html                   # Evaluator Web UI (Recommender, Metrics, Test Cases, Benchmark)
├── style.css                    # Dark Glassmorphism CSS design system
├── app.js                       # UI controller, scanner simulator, BeautyGPT client & metrics dashboard
├── recommendation_engine.js     # JavaScript recommendation engine & evaluation suite
├── recommendation_engine.py     # Standalone Python CLI engine & evaluation benchmark
├── server.js                    # Node.js Express server & secure LLM proxy endpoint
└── README.md                    # System documentation & setup guide
```
