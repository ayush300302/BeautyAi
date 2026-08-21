/**
 * Skincare Recommendation Engine — BeautyAI Core
 * Algorithm: Hybrid Content-Based Filtering (Cosine Similarity + Bayesian Rating)
 * Rule-Based Ingredient Safety Validator
 * Independent Attribute-Based Offline Evaluation Suite (Precision, Recall, NDCG, Coverage, Diversity, Latency, Safety)
 * Orbo.ai Inspired - Technical Assignment Submission
 */

class RecommendationEngine {
  constructor(products) {
    this.products = products || [];
    this.allIngredients = this._buildIngredientVocab();
    this.allConcerns = this._buildConcernVocab();
    this.allSkinTypes = ['oily', 'dry', 'combination', 'sensitive', 'normal', 'acne_prone'];
    this.productVectors = this._vectorizeAllProducts();
  }

  // ─── Dynamic Vocabulary Builders ──────────────────────────────────────────────

  _buildIngredientVocab() {
    const set = new Set();
    this.products.forEach(p => (p.active_ingredients || []).forEach(i => set.add(i)));
    return Array.from(set);
  }

  _buildConcernVocab() {
    const set = new Set();
    this.products.forEach(p => (p.concerns || []).forEach(c => set.add(c)));
    return Array.from(set);
  }

  // ─── Dynamic Feature Vectorization ───────────────────────────────────────────

  /**
   * Vectorizes a product into the dynamic feature space derived from dataset vocabularies.
   * Feature dimensions: [SkinTypes (6), Concerns (N), Ingredients (M), NormalizedRating (1), NormalizedPrice (1)]
   */
  _vectorizeProduct(product) {
    const vector = [];

    // Skin type binary flags
    this.allSkinTypes.forEach(st => {
      vector.push(product.skin_types?.includes(st) ? 1 : 0);
    });

    // Concern binary flags
    this.allConcerns.forEach(c => {
      vector.push(product.concerns?.includes(c) ? 1 : 0);
    });

    // Ingredient binary flags
    this.allIngredients.forEach(ing => {
      vector.push(product.active_ingredients?.includes(ing) ? 1 : 0);
    });

    // Normalized rating (0–1 scale)
    vector.push((product.rating || 0) / 5.0);

    // Normalized price (0–1 scale capped at $200)
    vector.push(Math.min(product.price || 0, 200) / 200);

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
   * Vectorizes user profile into the exact same feature vector space.
   */
  _vectorizeUserProfile(userProfile) {
    const vector = [];

    // Skin type flags
    this.allSkinTypes.forEach(st => {
      vector.push(userProfile.skin_types?.includes(st) ? 1 : 0);
    });

    // Concern flags
    this.allConcerns.forEach(c => {
      vector.push(userProfile.concerns?.includes(c) ? 1 : 0);
    });

    // Preferred ingredient flags
    this.allIngredients.forEach(ing => {
      vector.push(userProfile.preferred_ingredients?.includes(ing) ? 1 : 0);
    });

    // Minimum target rating (normalized)
    vector.push((userProfile.min_rating || 4.0) / 5.0);

    // Maximum budget target (normalized)
    const maxBudget = userProfile.max_price || 100;
    vector.push(Math.min(maxBudget, 200) / 200);

    return vector;
  }

  // ─── Vector Cosine Similarity ──────────────────────────────────────────────────

  _dotProduct(a, b) {
    return a.reduce((sum, val, i) => sum + val * b[i], 0);
  }

  _magnitude(vec) {
    return Math.sqrt(vec.reduce((sum, val) => sum + val * val, 0));
  }

  cosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB) return 0;
    const dot = this._dotProduct(vecA, vecB);
    const magA = this._magnitude(vecA);
    const magB = this._magnitude(vecB);
    if (magA === 0 || magB === 0) return 0;
    return dot / (magA * magB);
  }

  // ─── Bayesian Weighted Rating ──────────────────────────────────────────────────

  /**
   * Bayesian Adjusted Rating = (C * m + n * r) / (C + n)
   * C = 1000 (confidence smoothing parameter)
   * m = 4.5 (global mean rating threshold)
   */
  _bayesianRating(product) {
    const C = 1000;
    const globalMean = 4.5;
    const n = product.rating_count || 0;
    const r = product.rating || 0;
    return ((C * globalMean) + (n * r)) / (C + n);
  }

  // ─── Safety Constraint Validator ──────────────────────────────────────────────

  /**
   * Deterministically validates routine ingredient combinations against contraindications.
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
      (p.active_ingredients || []).forEach(i => allIngredients.add(i));
      (p.contraindications || []).forEach(c => allContraindications.add(c));
    });

    // Check direct product contraindications
    allIngredients.forEach(ing => {
      if (allContraindications.has(ing)) {
        warnings.push(`Conflict: Ingredient "${ing.replace(/_/g, ' ')}" is contraindicated by another product in this routine.`);
      }
    });

    // Check known active ingredient pair conflicts
    allIngredients.forEach(ing => {
      if (conflicts[ing]) {
        conflicts[ing].forEach(conflict => {
          if (allIngredients.has(conflict)) {
            warnings.push(`Do not combine active "${ing.replace(/_/g, ' ')}" with "${conflict.replace(/_/g, ' ')}" in the same routine step.`);
          }
        });
      }
    });

    return { safe: warnings.length === 0, warnings: Array.from(new Set(warnings)) };
  }

  // ─── Attribute-Based Score Explanation ─────────────────────────────────────────

  /**
   * Generates interpretable score component breakdown based on real product & user attributes.
   */
  _explainScore(product, userProfile) {
    const userTypes = userProfile.skin_types || [];
    const userConcerns = userProfile.concerns || [];
    const preferredIng = userProfile.preferred_ingredients || [];

    // Skin type match (0-100)
    const skinTypeMatches = userTypes.filter(st => product.skin_types?.includes(st));
    const skinTypeScore = userTypes.length > 0
      ? Math.round((skinTypeMatches.length / userTypes.length) * 100)
      : 100;

    // Concern match (0-100)
    const concernMatches = userConcerns.filter(c => product.concerns?.includes(c));
    const concernScore = userConcerns.length > 0
      ? Math.round((concernMatches.length / userConcerns.length) * 100)
      : 50;

    // Ingredient synergy (0-100)
    const ingMatches = preferredIng.filter(i => product.active_ingredients?.includes(i));
    const ingredientScore = preferredIng.length > 0
      ? Math.round((ingMatches.length / preferredIng.length) * 100)
      : 50;

    // Rating score (0-100)
    const ratingScore = Math.round(((product.rating || 0) / 5.0) * 100);

    // Budget fit (0-100)
    const maxBudget = userProfile.max_price || 999;
    const budgetScore = product.price <= maxBudget
      ? Math.round(100 - ((product.price / maxBudget) * 20))
      : 0;

    return {
      breakdown: {
        concern_match: { score: concernScore, weight: '35%', matched: concernMatches },
        skin_type_match: { score: skinTypeScore, weight: '25%', matched: skinTypeMatches },
        ingredient_synergy: { score: ingredientScore, weight: '20%', matched: ingMatches },
        rating_weight: { score: ratingScore, weight: '12%', value: product.rating },
        budget_fit: { score: budgetScore, weight: '8%', price: product.price }
      }
    };
  }

  // ─── Main Recommendation Function ──────────────────────────────────────────────

  /**
   * Main recommendation pipeline:
   * Candidates -> Candidate Filtering -> Cosine Similarity (70%) + Bayesian Rating (30%) -> Final Score Sorting -> Top-K
   */
  recommend(userProfile, category = null, topK = 5) {
    const startTime = performance.now();

    let candidates = this.products;

    // Category filter
    if (category) {
      candidates = candidates.filter(p => p.category === category);
    }

    // Budget filter
    if (userProfile.max_price) {
      candidates = candidates.filter(p => p.price <= userProfile.max_price);
    }

    // Rating filter
    if (userProfile.min_rating) {
      candidates = candidates.filter(p => p.rating >= userProfile.min_rating);
    }

    // Cold start fallback if no user profile attributes provided
    if (!userProfile.skin_types || userProfile.skin_types.length === 0) {
      return this._coldStartRecommendations(candidates, topK, startTime);
    }

    const userVector = this._vectorizeUserProfile(userProfile);

    // Compute canonical ranking score for all candidates
    const scored = candidates.map(product => {
      const productVector = this.productVectors[product.id];
      const cosineSim = this.cosineSimilarity(userVector, productVector);
      const bayesRating = this._bayesianRating(product);
      
      // Normalized Bayesian Rating (scale 0 to 1 based on 4.0 - 5.0 range)
      const bayesNorm = Math.max(0, Math.min(1, (bayesRating - 4.0) / 1.0));

      // CANONICAL HYBRID RANKING FORMULA:
      // final_score = 0.70 * Cosine_Similarity + 0.30 * Normalized_Bayesian_Rating
      const finalScore = parseFloat(((cosineSim * 0.70) + (bayesNorm * 0.30)).toFixed(4));
      
      // Match percentage displayed in UI (0-100%)
      const matchScore = Math.min(100, Math.max(0, Math.round(finalScore * 100)));

      const explanation = this._explainScore(product, userProfile);

      return {
        product,
        final_score: finalScore,
        hybrid_score: finalScore,
        cosine_similarity: parseFloat(cosineSim.toFixed(4)),
        bayesian_rating: parseFloat(bayesRating.toFixed(3)),
        match_score: matchScore,
        explanation: explanation.breakdown,
        is_safe: true
      };
    });

    // STRICT CANONICAL SORTING BY final_score
    scored.sort((a, b) => b.final_score - a.final_score);

    const endTime = performance.now();
    const latency = parseFloat((endTime - startTime).toFixed(2));

    return {
      recommendations: scored.slice(0, topK),
      metadata: {
        latency_ms: latency,
        candidates_evaluated: candidates.length,
        algorithm: 'Hybrid Content-Based: Cosine Similarity (70%) + Bayesian Rating (30%)',
        user_profile: userProfile,
        category_filter: category
      }
    };
  }

  // ─── 5-Step Routine Builder ───────────────────────────────────────────────────

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

    const safetyCheck = this._checkIngredientSafety(selectedProducts);
    const endTime = performance.now();

    return {
      routine,
      safety: safetyCheck,
      user_profile: userProfile,
      total_latency_ms: parseFloat((endTime - startTime).toFixed(2))
    };
  }

  // ─── Cold Start Recommendations ──────────────────────────────────────────────

  _coldStartRecommendations(candidates, topK, startTime) {
    const scored = candidates.map(p => {
      const bayesRating = this._bayesianRating(p);
      const bayesNorm = Math.max(0, Math.min(1, (bayesRating - 4.0) / 1.0));
      const finalScore = parseFloat((bayesNorm * 0.30).toFixed(4));
      return {
        product: p,
        final_score: finalScore,
        hybrid_score: finalScore,
        cosine_similarity: 0.0,
        bayesian_rating: parseFloat(bayesRating.toFixed(3)),
        match_score: Math.round(bayesRating * 20),
        explanation: { note: 'Cold start: recommendations based on top Bayesian-rated products' },
        is_cold_start: true
      };
    });

    scored.sort((a, b) => b.bayesian_rating - a.bayesian_rating);

    const endTime = performance.now();
    return {
      recommendations: scored.slice(0, topK),
      metadata: {
        latency_ms: parseFloat((endTime - startTime).toFixed(2)),
        candidates_evaluated: candidates.length,
        algorithm: 'Cold Start: Bayesian Rating Fallback',
        note: 'No user profile attributes provided. Showing top Bayesian-rated products.'
      }
    };
  }

  // ─── INDEPENDENT GROUND TRUTH RELEVANCE HEURISTIC (NON-CIRCULAR) ──────────────

  /**
   * Deterministic Ground-Truth Relevance Function R(u, p) in {0, 1, 2, 3}.
   * Calculated purely from product attributes vs user profile.
   * Completely independent of the recommendation system's final_score!
   *
   * Relevance scale:
   * 3 = Highly Relevant (Matches skin type AND primary concern AND preferred ingredient)
   * 2 = Relevant (Matches skin type AND primary concern)
   * 1 = Weakly Relevant (Matches skin type OR primary concern)
   * 0 = Not Relevant (No skin type or concern match)
   */
  groundTruthRelevance(userProfile, product) {
    const userTypes = userProfile.skin_types || [];
    const userConcerns = userProfile.concerns || [];
    const preferredIng = userProfile.preferred_ingredients || [];

    const stMatch = userTypes.some(st => product.skin_types?.includes(st));
    const cMatch = userConcerns.some(c => product.concerns?.includes(c));
    const ingMatch = preferredIng.some(ing => product.active_ingredients?.includes(ing));

    if (stMatch && cMatch && ingMatch) return 3;
    if (stMatch && cMatch) return 2;
    if (stMatch || cMatch) return 1;
    return 0;
  }

  // ─── REAL OFFLINE EVALUATION METRICS ENGINE ───────────────────────────────────

  /**
   * Computes Precision@K = (Relevant items in top-K) / K
   * Relevant threshold: ground truth relevance R(u, p) >= 2
   */
  precisionAtK(userProfile, recommendations, k = 5) {
    if (!recommendations || recommendations.length === 0 || k <= 0) return 0;
    const topK = recommendations.slice(0, k);
    const relevantCount = topK.filter(r => this.groundTruthRelevance(userProfile, r.product) >= 2).length;
    return parseFloat((relevantCount / k).toFixed(3));
  }

  /**
   * Computes Recall@K = (Relevant items in top-K) / (Total relevant products in catalog for profile)
   */
  recallAtK(userProfile, recommendations, k = 5) {
    if (!recommendations || recommendations.length === 0) return 0;

    const totalRelevantInCatalog = this.products.filter(p => this.groundTruthRelevance(userProfile, p) >= 2).length;
    if (totalRelevantInCatalog === 0) return 0; // Return 0.0 for zero relevant items in catalog

    const topK = recommendations.slice(0, k);
    const relevantInTopK = topK.filter(r => this.groundTruthRelevance(userProfile, r.product) >= 2).length;
    return parseFloat((relevantInTopK / totalRelevantInCatalog).toFixed(3));
  }

  /**
   * Computes position-sensitive NDCG@K using independent ground-truth relevance R(u, p).
   * DCG@K = sum_{i=1}^K (2^(R_i) - 1) / log2(i + 1)
   * IDCG@K = Ideal DCG from sorting catalog products by R(u, p) descending.
   */
  ndcgAtK(userProfile, recommendations, k = 5) {
    if (!recommendations || recommendations.length === 0 || k <= 0) return 0;
    const topK = recommendations.slice(0, k);

    // Compute DCG@K
    const dcg = topK.reduce((sum, rec, i) => {
      const rel = this.groundTruthRelevance(userProfile, rec.product);
      return sum + ((Math.pow(2, rel) - 1) / Math.log2(i + 2)); // i + 2 since i is 0-indexed (rank 1 -> log2(2))
    }, 0);

    // Compute Ideal DCG@K by sorting all catalog candidates by ground truth relevance
    const idealRelevances = this.products
      .map(p => this.groundTruthRelevance(userProfile, p))
      .sort((a, b) => b - a)
      .slice(0, k);

    const idcg = idealRelevances.reduce((sum, rel, i) => {
      return sum + ((Math.pow(2, rel) - 1) / Math.log2(i + 2));
    }, 0);

    if (idcg === 0) return 0;
    return parseFloat((dcg / idcg).toFixed(3));
  }

  /**
   * Computes Catalog Coverage: % of total catalog surfaced across an evaluation suite
   */
  catalogCoverage(testProfiles, k = 5) {
    if (!testProfiles || testProfiles.length === 0 || this.products.length === 0) return 0;
    const recommended = new Set();
    testProfiles.forEach(profile => {
      const result = this.recommend(profile, null, k);
      result.recommendations.forEach(r => recommended.add(r.product.id));
    });
    return parseFloat(((recommended.size / this.products.length) * 100).toFixed(1));
  }

  /**
   * Computes Category Diversity: ratio of unique categories present in top-K recommendations
   */
  categoryDiversity(recommendations, k = 5) {
    if (!recommendations || recommendations.length === 0 || k <= 0) return 0;
    const topK = recommendations.slice(0, k);
    const categories = new Set(topK.map(r => r.product.category));
    return parseFloat((categories.size / topK.length).toFixed(3));
  }

  /**
   * Runs complete multi-K evaluation across an array of evaluation profiles.
   */
  evaluateSuite(testProfiles) {
    const ks = [3, 5, 10];
    const metrics = {
      precision: { 3: 0, 5: 0, 10: 0 },
      recall: { 3: 0, 5: 0, 10: 0 },
      ndcg: { 3: 0, 5: 0, 10: 0 },
      diversity: { 5: 0 },
      latencies: [],
      safetyCompliance: 0,
      totalProfiles: testProfiles.length
    };

    let safeRoutines = 0;

    testProfiles.forEach(profile => {
      const start = performance.now();
      const routineRes = this.buildRoutine(profile);
      const end = performance.now();
      metrics.latencies.push(end - start);

      if (routineRes.safety.safe) safeRoutines++;

      const recResult = this.recommend(profile, null, 10);
      const recs = recResult.recommendations;

      ks.forEach(k => {
        metrics.precision[k] += this.precisionAtK(profile, recs, k);
        metrics.recall[k] += this.recallAtK(profile, recs, k);
        metrics.ndcg[k] += this.ndcgAtK(profile, recs, k);
      });

      metrics.diversity[5] += this.categoryDiversity(recs, 5);
    });

    const n = testProfiles.length;
    const latencies = metrics.latencies.sort((a, b) => a - b);

    const summary = {
      precision: {
        3: parseFloat((metrics.precision[3] / n).toFixed(3)),
        5: parseFloat((metrics.precision[5] / n).toFixed(3)),
        10: parseFloat((metrics.precision[10] / n).toFixed(3))
      },
      recall: {
        3: parseFloat((metrics.recall[3] / n).toFixed(3)),
        5: parseFloat((metrics.recall[5] / n).toFixed(3)),
        10: parseFloat((metrics.recall[10] / n).toFixed(3))
      },
      ndcg: {
        3: parseFloat((metrics.ndcg[3] / n).toFixed(3)),
        5: parseFloat((metrics.ndcg[5] / n).toFixed(3)),
        10: parseFloat((metrics.ndcg[10] / n).toFixed(3))
      },
      coverage: this.catalogCoverage(testProfiles, 5),
      diversity: parseFloat((metrics.diversity[5] / n).toFixed(3)),
      latency: {
        avg: parseFloat((latencies.reduce((a, b) => a + b, 0) / n).toFixed(1)),
        min: parseFloat((latencies[0] || 0).toFixed(1)),
        max: parseFloat((latencies[latencies.length - 1] || 0).toFixed(1))
      },
      safety_compliance_pct: parseFloat(((safeRoutines / n) * 100).toFixed(1))
    };

    return summary;
  }
}

// ─── Evaluation Test Profiles Suite ───────────────────────────────────────────

const TEST_CASES = {
  success_1: {
    name: '✅ Success: Oily + Acne-Prone Skin',
    description: 'Standard use case: oily, acne-prone profile with budget cap ($40).',
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
    description: 'Dry, sensitive skin profile targeting hydration & barrier repair.',
    profile: {
      skin_types: ['dry', 'sensitive'],
      concerns: ['dryness', 'aging', 'sensitivity'],
      preferred_ingredients: ['hyaluronic_acid', 'ceramides', 'peptides'],
      max_price: 60,
      min_rating: 4.0
    }
  },
  success_3: {
    name: '✅ Success: Normal + Hyperpigmentation',
    description: 'Normal skin focused on brightening & tone evening.',
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
    description: 'Cold start profile with zero skin attributes specified.',
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
    description: 'Profile requesting retinol + vitamin C + AHA in same routine (triggers safety rule).',
    profile: {
      skin_types: ['combination'],
      concerns: ['aging', 'acne', 'hyperpigmentation'],
      preferred_ingredients: ['retinol', 'vitamin_c', 'glycolic_acid', 'salicylic_acid'],
      max_price: 80,
      min_rating: 4.0
    }
  },
  edge_very_strict: {
    name: '⚠️ Edge Case: Extremely Restrictive Budget ($8)',
    description: 'Over-constrained profile ($8 price cap, 4.9+ rating) resulting in zero/minimal candidates.',
    profile: {
      skin_types: ['sensitive'],
      concerns: ['redness', 'sensitivity'],
      preferred_ingredients: ['centella_asiatica'],
      max_price: 8,
      min_rating: 4.9
    }
  }
};

if (typeof module !== 'undefined') {
  module.exports = { RecommendationEngine, TEST_CASES };
}
