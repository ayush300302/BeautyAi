# BeautyAI — Personalized Skincare Recommendation Engine
> **Technical Assignment Submission** | Inspired by **[Orbo.ai](https://orbo.ai/)** & **Nykaa**
>
> 🌐 **Live Azure Deployment**: [https://beautyai-recommender-app.azurewebsites.net](https://beautyai-recommender-app.azurewebsites.net)  
> 📦 **GitHub Repository**: [https://github.com/ayush300302/BeautyAi](https://github.com/ayush300302/BeautyAi)

BeautyAI is an intelligent, full-stack recommendation system designed to match users with personalized 5-step skincare routines based on their unique skin type, skin concerns, budget, and ingredient preferences.

---

## 🌟 Quick Start & Running Locally

### Option 1: Live Azure Deployment (Cloud Hosted)
Access the live deployed application anywhere at:  
**[https://beautyai-recommender-app.azurewebsites.net](https://beautyai-recommender-app.azurewebsites.net)**

### Option 2: Web Interface (Local HTTP Server)
Run a local HTTP server in the project directory:
```bash
python -m http.server 8000
```
Open **[http://localhost:8000](http://localhost:8000)** in your browser to interact with the full UI.

### Option 2: Python CLI & Benchmark Suite
Run the Python recommendation engine and evaluation benchmark directly from the terminal:
```bash
python recommendation_engine.py --benchmark
```
To run a specific test case:
```bash
python recommendation_engine.py --profile oily_acne --budget 40
```

---

## 📐 System Architecture & Algorithm Logic

The system uses a **Hybrid Recommendation Architecture** combining Content-Based Filtering, Bayesian Rating Weighting, and Dermatological Safety Constraint Validation.

```
┌─────────────────────────┐
│     User Skin Profile   │ (Skin Type, Concerns, Preferred Ingredients, Budget, Rating)
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│  Feature Vectorization  │ Binary/Normalized Feature Vectors (Dim: 45)
└────────────┬────────────┘
             │
      ┌──────┴──────────────────────────┐
      ▼                                 ▼
┌───────────────────────────┐ ┌───────────────────────────┐
│ Cosine Similarity (70%)   │ │ Bayesian Rating (30%)     │
│ Match profile to products │ │ Shrinks towards global    │
│ feature vector space      │ │ mean based on review count│
└────────────┬──────────────┘ └────────────┬──────────────┘
             │                             │
             └──────────────┬──────────────┘
                            ▼
             ┌─────────────────────────────┐
             │ Hybrid Score Computation    │
             └──────────────┬──────────────┘
                            │
                            ▼
             ┌─────────────────────────────┐
             │ Safety Constraint Validator │ (Ingredient conflict checks)
             └──────────────┬──────────────┘
                            │
                            ▼
             ┌─────────────────────────────┐
             │ 5-Step Routine Builder      │ (Cleanser -> Toner -> Serum ->
             └─────────────────────────────┘  Moisturizer -> Sunscreen)
```

### Mathematical Formulation

1. **Feature Vector Representation**:
   Every product $P$ and user profile $U$ is mapped to a vector in $\mathbb{R}^N$:
   $$V = [\text{SkinTypes}_{1..6}, \text{Concerns}_{1..16}, \text{Ingredients}_{1..10}, \text{RatingNorm}, \text{PriceNorm}]$$

2. **Cosine Similarity**:
   $$\text{Sim}(U, P) = \frac{U \cdot P}{\|U\| \|P\|} = \frac{\sum_{i=1}^N U_i P_i}{\sqrt{\sum_{i=1}^N U_i^2} \sqrt{\sum_{i=1}^N P_i^2}}$$

3. **Bayesian Weighted Rating**:
   $$R_{\text{Bayes}}(P) = \frac{C \cdot m + n \cdot r}{C + n}$$
   Where $C = 1000$ (confidence vote threshold), $m = 4.5$ (global mean rating), $n$ is review count, and $r$ is raw rating.

4. **Hybrid Score**:
   $$\text{Score}_{\text{Hybrid}} = 0.70 \times \text{Sim}(U, P) + 0.30 \times \text{Norm}(R_{\text{Bayes}}(P))$$

5. **Dermatological Safety Check**:
   Rules check contraindication sets for incompatibilities (e.g. `Retinol` + `High-concentration AHA/BHA`).

---

## 📊 Evaluation Metrics

Measured across all 6 test cases:

| Metric | Score | Description |
| :--- | :--- | :--- |
| **Precision@5** | **0.700** | Fraction of top-5 recommended items relevant to user profile (≥60% match). |
| **Recall@5** | **0.129** | Fraction of all relevant products in dataset surfaced in top-5. |
| **NDCG@5** | **0.810** | Normalized Discounted Cumulative Gain — measures ranking quality. |
| **Latency** | **1.8 ms** | Average recommendation generation time per routine. |
| **Catalog Coverage** | **37.8%** | % of total product catalog recommended across test profiles. |
| **Safety Pass Rate** | **100%** | % of routines with zero ingredient safety conflicts. |

---

## 🧪 Test Cases (Successful & Edge Scenarios)

1. **✅ Success: Oily + Acne-Prone Skin**
   - *Input*: Oily skin, Acne/Pores concerns, Salicylic Acid & Niacinamide.
   - *Result*: Precision@5 = 1.00, Latency = 1.5ms. Top pick: *CeraVe Foaming Cleanser* & *The Ordinary Niacinamide*.
2. **✅ Success: Dry + Sensitive + Anti-Aging**
   - *Input*: Dry/Sensitive skin, Aging/Dryness concerns, Ceramides & Hyaluronic Acid.
   - *Result*: Precision@5 = 1.00. Top pick: *La Roche-Posay Toleriane* & *CeraVe Cream*.
3. **✅ Success: Normal + Hyperpigmentation**
   - *Input*: Normal skin, Pigmentation concern, Vitamin C & Glycolic Acid.
   - *Result*: Precision@5 = 0.60, NDCG@5 = 0.931.
4. **⚠️ Edge: Cold Start (No User Profile)**
   - *Behavior*: Graceful fallback to Bayesian-ranked bestsellers (*CeraVe Cream*, *Paula's Choice BHA*).
5. **⚠️ Edge: Conflicting Ingredients**
   - *Behavior*: Safety validator flags warning for Retinol + AHA/BHA combination.
6. **⚠️ Edge: Ultra-Strict Filters**
   - *Behavior*: Strict price ($8) + rating (4.9+) returns empty set cleanly without crashing.

---

## 🔬 Orbo.ai Benchmark & Comparison

| Feature | BeautyAI (Ours) | Orbo.ai | Nykaa |
| :--- | :---: | :---: | :---: |
| **Recommendation Engine** | Hybrid (Content + Bayes) | LLM + CV + Content | Collaborative Filtering |
| **Skin Type Input** | Form / Quiz | Camera AI Scan | Quiz |
| **Explainability ("Why Recommended")** | Full Score Breakdown | Partial | None |
| **Safety Validator** | Rule-Based Engine | Dermatologist DB | None |
| **Evaluation Metrics Dashboard** | Precision, Recall, NDCG | Internal Only | None |
| **Latency** | < 2 ms | 200–500 ms | 300–800 ms |

---

## 📁 File Structure

- **`index.html`**: Evaluator Web Interface with 4 interactive tabs (Recommender, Metrics, Test Cases, Benchmark).
- **`style.css`**: Glassmorphism design system inspired by Orbo.ai & Nykaa.
- **`dataset.json`**: 45 curated beauty products with complete metadata.
- **`recommendation_engine.js`**: Core JavaScript recommendation algorithm.
- **`app.js`**: Web UI state manager & renderer.
- **`recommendation_engine.py`**: Standalone Python CLI engine & benchmark runner.
- **`README.md`**: Complete assignment documentation.
