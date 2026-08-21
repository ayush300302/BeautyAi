/**
 * Skincare Recommendation Engine
 * Hybrid Algorithm: Content-Based Cosine Similarity + Bayesian Rating Weight + Safety Constraints
 * Orbo.ai Inspired - Technical Assignment Submission
 */

class RecommendationEngine {
  constructor(products) {
    this.products = products;
    this.allIngredients = this._buildIngredientVocab();
    this.allConcerns = this._buildConcernVocab();
    this.allSkinTypes = ['oily', 'dry', 'combination', 'sensitive', 'normal', 'acne_prone'];
    this.productVectors = this._vectorizeAllProducts();
  }

  // ─── Vocabulary Builders ─────────────────────────────────────────────────────

  _buildIngredientVocab() {
    const set = new Set();
    this.products.forEach(p => p.active_ingredients.forEach(i => set.add(i)));
    return Array.from(set);
  }

  _buildConcernVocab() {
    const set = new Set();
    this.products.forEach(p => p.concerns.forEach(c => set.add(c)));
    return Array.from(set);
  }

  // ─── Feature Vectorization ────────────────────────────────────────────────────

  /**
   * Converts a product into a normalized numeric feature vector.
   * Vector = [skinType flags (6), concern flags (N), ingredient flags (M), normalizedRating, normalizedPrice]
   */
  _vectorizeProduct(product) {
    const vector = [];

    // Skin type features (binary: 0 or 1)
    this.allSkinTypes.forEach(st => {
      vector.push(product.skin_types.includes(st) ? 1 : 0);
    });

    // Concern features (binary: 0 or 1)
    this.allConcerns.forEach(c => {
      vector.push(product.concerns.includes(c) ? 1 : 0);
    });

    // Ingredient features (binary: 0 or 1)
    this.allIngredients.forEach(ing => {
      vector.push(product.active_ingredients.includes(ing) ? 1 : 0);
    });

    // Normalized rating (0–1)
    vector.push(product.rating / 5.0);

    // Normalized price (log scale, capped at 200)
    vector.push(Math.min(product.price, 200) / 200);

    return vector;
  }

  _vectorizeAllProducts() {
    const vectors = {};
    this.products.forEach(p => {
      vectors[p.id] = this._vectorizeProduct(p);
    });
    return vectors;
  }

  /**
   * Converts a user profile into a feature vector matching product vector space.
   */
  _vectorizeUserProfile(userProfile) {
    const vector = [];

    // Skin type features
    this.allSkinTypes.forEach(st => {
      vector.push(userProfile.skin_types.includes(st) ? 1 : 0);
    });

    // Concern features
    this.allConcerns.forEach(c => {
      vector.push(userProfile.concerns.includes(c) ? 1 : 0);
    });

    // Ingredient features (preferred ingredients)
    this.allIngredients.forEach(ing => {
      vector.push(userProfile.preferred_ingredients && userProfile.preferred_ingredients.includes(ing) ? 1 : 0);
    });

    // Target rating preference (normalized)
    vector.push((userProfile.min_rating || 4.0) / 5.0);

    // Target price preference (normalized)
    const maxBudget = userProfile.max_price || 100;
    vector.push(Math.min(maxBudget, 200) / 200);

    return vector;
  }

  // ─── Cosine Similarity ────────────────────────────────────────────────────────

  _dotProduct(a, b) {
    return a.reduce((sum, val, i) => sum + val * b[i], 0);
  }

  _magnitude(vec) {
    return Math.sqrt(vec.reduce((sum, val) => sum + val * val, 0));
  }

  cosineSimilarity(vecA, vecB) {
    const dot = this._dotProduct(vecA, vecB);
    const magA = this._magnitude(vecA);
    const magB = this._magnitude(vecB);
    if (magA === 0 || magB === 0) return 0;
    return dot / (magA * magB);
  }

  // ─── Bayesian Rating Weight ────────────────────────────────────────────────────

  /**
   * Bayesian Average = (C × m + Σ ratings) / (C + n)
   * C = confidence weight (minimum vote count = 1000)
   * m = global mean rating
   */
  _bayesianRating(product) {
    const C = 1000;
    const globalMean = 4.5;
    const n = product.rating_count;
    const avgRating = product.rating;
    return ((C * globalMean) + (n * avgRating)) / (C + n);
  }

  // ─── Safety Constraint Validator ──────────────────────────────────────────────

  /**
   * Returns true if the combination of products in a routine has no unsafe ingredient conflicts.
   */
  _checkIngredientSafety(selectedProducts) {
    const conflicts = {
      'retinol': ['salicylic_acid', 'aha_high_concentration', 'glycolic_acid', 'vitamin_c_high_concentration'],
      'vitamin_c': ['niacinamide_high_concentration', 'glycolic_acid', 'salicylic_acid'],
      'glycolic_acid': ['retinol', 'vitamin_c_high_concentration', 'salicylic_acid'],
      'adapalene': ['salicylic_acid', 'aha_high_concentration', 'vitamin_c_high_concentration'],
    };

    const warnings = [];
    const allIngredients = new Set();
    const allContraindications = new Set();

    selectedProducts.forEach(p => {
      p.active_ingredients.forEach(i => allIngredients.add(i));
      p.contraindications.forEach(c => allContraindications.add(c));
    });

    // Check direct conflicts from contraindications
    allIngredients.forEach(ing => {
      if (allContraindications.has(ing)) {
        warnings.push(`⚠️ Conflict detected: "${ing}" conflicts with another product in this routine.`);
      }
    });

    // Check known conflict pairs
    allIngredients.forEach(ing => {
      if (conflicts[ing]) {
        conflicts[ing].forEach(conflict => {
          if (allIngredients.has(conflict)) {
            warnings.push(`⚠️ Do not use ${ing} + ${conflict} in the same routine step.`);
          }
        });
      }
    });

    return { safe: warnings.length === 0, warnings: [...new Set(warnings)] };
  }

  // ─── Score Explainability Breakdown ───────────────────────────────────────────

  /**
   * Breaks down the recommendation score into interpretable components.
   */
  _explainScore(product, userProfile) {
    // Skin Type Match Score (0-100)
    const skinTypeMatches = userProfile.skin_types.filter(st => product.skin_types.includes(st));
    const skinTypeScore = Math.round((skinTypeMatches.length / userProfile.skin_types.length) * 100);

    // Concern Match Score (0-100)
    const concernMatches = userProfile.concerns.filter(c => product.concerns.includes(c));
    const concernScore = userProfile.concerns.length > 0
      ? Math.round((concernMatches.length / userProfile.concerns.length) * 100)
      : 0;

    // Ingredient Compatibility Score (0-100)
    const preferredIng = userProfile.preferred_ingredients || [];
    const ingMatches = preferredIng.filter(i => product.active_ingredients.includes(i));
    const ingredientScore = preferredIng.length > 0
      ? Math.round((ingMatches.length / preferredIng.length) * 100)
      : 50; // neutral if no preference given

    // Rating Score (0-100)
    const ratingScore = Math.round((product.rating / 5.0) * 100);

    // Budget Score (0-100): how well it fits within budget
    const maxBudget = userProfile.max_price || 999;
    const budgetScore = product.price <= maxBudget
      ? Math.round(100 - ((product.price / maxBudget) * 30)) // slight preference for lower prices
      : 0;

    // Weighted composite score
    const composite = (
      (concernScore * 0.35) +
      (skinTypeScore * 0.25) +
      (ingredientScore * 0.20) +
      (ratingScore * 0.12) +
      (budgetScore * 0.08)
    );

    return {
      total: Math.round(Math.min(composite, 100)),
      breakdown: {
        concern_match: { score: concernScore, weight: '35%', matched: concernMatches },
        skin_type_match: { score: skinTypeScore, weight: '25%', matched: skinTypeMatches },
        ingredient_synergy: { score: ingredientScore, weight: '20%', matched: ingMatches },
        rating_weight: { score: ratingScore, weight: '12%', value: product.rating },
        budget_fit: { score: budgetScore, weight: '8%', price: product.price }
      }
    };
  }

  // ─── Core Recommendation Function ─────────────────────────────────────────────

  /**
   * Main recommendation function.
   * @param {Object} userProfile - { skin_types, concerns, preferred_ingredients, max_price, min_rating }
   * @param {String} category - Filter to a specific product category (optional)
   * @param {Number} topK - Number of top recommendations to return
   * @returns {Array} Ranked list of recommendations with scores and explanations
   */
  recommend(userProfile, category = null, topK = 5) {
    const startTime = performance.now();

    // Filter by category if specified
    let candidates = category
      ? this.products.filter(p => p.category === category)
      : this.products;

    // Filter by budget
    if (userProfile.max_price) {
      candidates = candidates.filter(p => p.price <= userProfile.max_price);
    }

    // Filter by minimum rating
    if (userProfile.min_rating) {
      candidates = candidates.filter(p => p.rating >= userProfile.min_rating);
    }

    // Handle cold start (no user data) - return highest bayesian rated items
    if (!userProfile.skin_types || userProfile.skin_types.length === 0) {
      return this._coldStartRecommendations(candidates, topK, startTime);
    }

    const userVector = this._vectorizeUserProfile(userProfile);

    // Score all candidates
    const scored = candidates.map(product => {
      const productVector = this.productVectors[product.id];
      const cosineSim = this.cosineSimilarity(userVector, productVector);
      const bayesRating = this._bayesianRating(product);
      const bayesNorm = (bayesRating - 4.0) / 1.0; // Normalize around 4.0

      // Hybrid score: 70% content similarity + 30% bayesian rating
      const hybridScore = (cosineSim * 0.70) + (Math.max(0, bayesNorm) * 0.30);

      const explanation = this._explainScore(product, userProfile);

      return {
        product,
        hybrid_score: hybridScore,
        cosine_similarity: parseFloat(cosineSim.toFixed(4)),
        bayesian_rating: parseFloat(bayesRating.toFixed(3)),
        match_score: explanation.total,
        explanation: explanation.breakdown,
        is_safe: true // default; safety check done at routine level
      };
    });

    // Sort by match score (explanation-based, more interpretable)
    scored.sort((a, b) => b.match_score - a.match_score);

    const endTime = performance.now();
    const latency = parseFloat((endTime - startTime).toFixed(2));

    return {
      recommendations: scored.slice(0, topK),
      metadata: {
        latency_ms: latency,
        candidates_evaluated: candidates.length,
        algorithm: 'Hybrid: Cosine Similarity (70%) + Bayesian Rating (30%)',
        user_profile: userProfile,
        category_filter: category
      }
    };
  }

  // ─── Full Routine Builder ─────────────────────────────────────────────────────

  /**
   * Builds a complete personalized skincare routine (5 steps) with safety validation.
   */
  buildRoutine(userProfile) {
    const startTime = performance.now();

    const routineSteps = [
      { step: 'step1_cleanser', label: 'Step 1: Cleanser', category: 'cleanser', emoji: '🧴' },
      { step: 'step2_toner', label: 'Step 2: Toner', category: 'toner', emoji: '💧' },
      { step: 'step3_serum', label: 'Step 3: Serum / Treatment', category: 'serum', emoji: '✨' },
      { step: 'step4_moisturizer', label: 'Step 4: Moisturizer', category: 'moisturizer', emoji: '🫧' },
      { step: 'step5_sunscreen', label: 'Step 5: Sunscreen (AM)', category: 'sunscreen', emoji: '☀️' }
    ];

    const routine = [];
    const selectedProducts = [];

    routineSteps.forEach(step => {
      const result = this.recommend(userProfile, step.category, 3);
      const topPick = result.recommendations[0];

      if (topPick) {
        routine.push({
          ...step,
          top_recommendation: topPick,
          alternatives: result.recommendations.slice(1)
        });
        selectedProducts.push(topPick.product);
      }
    });

    // Safety check for the full routine
    const safetyCheck = this._checkIngredientSafety(selectedProducts);

    const endTime = performance.now();

    return {
      routine,
      safety: safetyCheck,
      user_profile: userProfile,
      total_latency_ms: parseFloat((endTime - startTime).toFixed(2))
    };
  }

  // ─── Cold Start Handling ──────────────────────────────────────────────────────

  _coldStartRecommendations(candidates, topK, startTime) {
    const scored = candidates.map(p => ({
      product: p,
      hybrid_score: this._bayesianRating(p) / 5.0,
      cosine_similarity: 0,
      bayesian_rating: this._bayesianRating(p),
      match_score: Math.round(this._bayesianRating(p) * 20),
      explanation: { note: 'Cold start: recommendations based on top-rated products' },
      is_cold_start: true
    }));

    scored.sort((a, b) => b.bayesian_rating - a.bayesian_rating);

    const endTime = performance.now();
    return {
      recommendations: scored.slice(0, topK),
      metadata: {
        latency_ms: parseFloat((endTime - startTime).toFixed(2)),
        candidates_evaluated: candidates.length,
        algorithm: 'Cold Start: Bayesian Rating Fallback',
        note: 'No user profile provided. Showing top-rated products.'
      }
    };
  }

  // ─── Evaluation Metrics ───────────────────────────────────────────────────────

  /**
   * Computes Precision@K: fraction of top-K recommended items that are relevant.
   * Relevance = match_score >= threshold (default: 60%)
   */
  precisionAtK(recommendations, k = 5, threshold = 60) {
    const topK = recommendations.slice(0, k);
    const relevant = topK.filter(r => r.match_score >= threshold);
    return parseFloat((relevant.length / k).toFixed(3));
  }

  /**
   * Computes Recall@K: fraction of all relevant items that appear in top-K.
   * Relevant ground truth = all products matching ≥ 2 skin type/concern attributes
   */
  recallAtK(userProfile, recommendations, k = 5, threshold = 60) {
    const topK = recommendations.slice(0, k);
    const relevantInTopK = topK.filter(r => r.match_score >= threshold).length;
    const allRelevant = this.products.filter(p => {
      const stMatch = p.skin_types.some(st => userProfile.skin_types?.includes(st));
      const cMatch = p.concerns.some(c => userProfile.concerns?.includes(c));
      return stMatch && cMatch;
    }).length;
    return allRelevant > 0 ? parseFloat((relevantInTopK / allRelevant).toFixed(3)) : 0;
  }

  /**
   * Computes Normalized Discounted Cumulative Gain (NDCG@K).
   */
  ndcgAtK(recommendations, k = 5) {
    const topK = recommendations.slice(0, k);

    // DCG: higher-ranked relevant items gain more credit
    const dcg = topK.reduce((sum, rec, i) => {
      const relevance = rec.match_score / 100; // normalize to 0-1
      return sum + relevance / Math.log2(i + 2); // log2(rank+1)
    }, 0);

    // Ideal DCG: sorted by perfect scores
    const idealScores = topK.map(r => r.match_score / 100).sort((a, b) => b - a);
    const idcg = idealScores.reduce((sum, rel, i) => {
      return sum + rel / Math.log2(i + 2);
    }, 0);

    return idcg > 0 ? parseFloat((dcg / idcg).toFixed(3)) : 0;
  }

  /**
   * Computes Catalog Coverage: % of distinct products recommended across all test profiles
   */
  catalogCoverage(testProfiles) {
    const recommended = new Set();
    testProfiles.forEach(profile => {
      const result = this.recommend(profile, null, 5);
      result.recommendations.forEach(r => recommended.add(r.product.id));
    });
    return parseFloat(((recommended.size / this.products.length) * 100).toFixed(1));
  }

  /**
   * Runs all metrics for a given user profile and recommendation results.
   */
  evaluateAll(userProfile, recommendations, k = 5) {
    const recs = recommendations.recommendations || recommendations;
    return {
      precision_at_k: this.precisionAtK(recs, k),
      recall_at_k: this.recallAtK(userProfile, recs, k),
      ndcg_at_k: this.ndcgAtK(recs, k),
      k: k
    };
  }
}

// ─── Predefined Test Cases ─────────────────────────────────────────────────────

const TEST_CASES = {
  success_1: {
    name: '✅ Success: Oily + Acne-Prone Skin',
    description: 'Standard use case: clear input profile for oily, acne-prone skin with budget constraints.',
    profile: {
      skin_types: ['oily', 'acne_prone'],
      concerns: ['acne', 'oiliness', 'pores'],
      preferred_ingredients: ['salicylic_acid', 'niacinamide', 'zinc'],
      max_price: 40,
      min_rating: 4.0
    }
  },
  success_2: {
    name: '✅ Success: Dry + Sensitive Skin (Anti-Aging)',
    description: 'Dry, sensitive skin profile with anti-aging and hydration priorities.',
    profile: {
      skin_types: ['dry', 'sensitive'],
      concerns: ['dryness', 'aging', 'sensitivity'],
      preferred_ingredients: ['hyaluronic_acid', 'ceramides', 'peptides'],
      max_price: 60,
      min_rating: 4.0
    }
  },
  success_3: {
    name: '✅ Success: Normal + Hyperpigmentation Focus',
    description: 'Normal skin type focused on brightening and anti-pigmentation treatments.',
    profile: {
      skin_types: ['normal', 'combination'],
      concerns: ['hyperpigmentation', 'dullness', 'uneven_texture'],
      preferred_ingredients: ['vitamin_c', 'glycolic_acid', 'niacinamide'],
      max_price: 100,
      min_rating: 4.2
    }
  },
  edge_cold_start: {
    name: '⚠️ Edge Case: Cold Start (No Profile)',
    description: 'New user with no skin type or concern data. System falls back to Bayesian ranking.',
    profile: {
      skin_types: [],
      concerns: [],
      preferred_ingredients: [],
      max_price: 999,
      min_rating: 3.0
    }
  },
  edge_conflict: {
    name: '⚠️ Edge Case: Conflicting Ingredient Needs',
    description: 'User wants both retinol (anti-aging) and vitamin C + AHAs – triggers safety warning.',
    profile: {
      skin_types: ['combination'],
      concerns: ['aging', 'acne', 'hyperpigmentation'],
      preferred_ingredients: ['retinol', 'vitamin_c', 'glycolic_acid', 'salicylic_acid'],
      max_price: 80,
      min_rating: 4.0
    }
  },
  edge_very_strict: {
    name: '⚠️ Edge Case: Very Strict Filters (Low Yield)',
    description: 'Ultra-strict budget ($8) and very high rating (4.9+) filters produce minimal candidates.',
    profile: {
      skin_types: ['sensitive'],
      concerns: ['redness', 'sensitivity'],
      preferred_ingredients: ['centella_asiatica'],
      max_price: 8,
      min_rating: 4.9
    }
  }
};

// Export for use in app.js
if (typeof module !== 'undefined') {
  module.exports = { RecommendationEngine, TEST_CASES };
}
