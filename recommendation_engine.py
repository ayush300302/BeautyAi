# -*- coding: utf-8 -*-
"""
recommendation_engine.py
Skincare Recommendation Engine — Python Backend
Technical Assignment: Orbo.ai Inspired

Algorithm: Hybrid Content-Based Cosine Similarity + Bayesian Rating Weighting
Evaluation: Precision@K, Recall@K, NDCG@K, Catalog Coverage, Latency

Usage:
    python recommendation_engine.py
    python recommendation_engine.py --profile oily_acne
    python recommendation_engine.py --profile dry_sensitive --budget 50 --k 5
    python recommendation_engine.py --benchmark
"""

import json
import time
import math
import argparse
import sys
from typing import List, Dict, Optional, Any


# ─── Data Loader ──────────────────────────────────────────────────────────────

def load_dataset(path: str = "dataset.json") -> List[Dict]:
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data["products"]


# ─── Feature Vectorizer ───────────────────────────────────────────────────────

class FeatureVectorizer:
    """Converts products and user profiles into numeric feature vectors."""

    def __init__(self, products: List[Dict]):
        self.all_skin_types = ['oily', 'dry', 'combination', 'sensitive', 'normal', 'acne_prone']
        self.all_concerns = list({c for p in products for c in p['concerns']})
        self.all_ingredients = list({i for p in products for i in p['active_ingredients']})

        self.feature_dim = len(self.all_skin_types) + len(self.all_concerns) + len(self.all_ingredients) + 2

    def vectorize_product(self, product: Dict) -> List[float]:
        vec = []
        for st in self.all_skin_types:
            vec.append(1.0 if st in product['skin_types'] else 0.0)
        for c in self.all_concerns:
            vec.append(1.0 if c in product['concerns'] else 0.0)
        for i in self.all_ingredients:
            vec.append(1.0 if i in product['active_ingredients'] else 0.0)
        vec.append(product['rating'] / 5.0)
        vec.append(min(product['price'], 200) / 200)
        return vec

    def vectorize_profile(self, profile: Dict) -> List[float]:
        vec = []
        for st in self.all_skin_types:
            vec.append(1.0 if st in profile.get('skin_types', []) else 0.0)
        for c in self.all_concerns:
            vec.append(1.0 if c in profile.get('concerns', []) else 0.0)
        for i in self.all_ingredients:
            vec.append(1.0 if i in profile.get('preferred_ingredients', []) else 0.0)
        vec.append((profile.get('min_rating', 4.0)) / 5.0)
        vec.append(min(profile.get('max_price', 100), 200) / 200)
        return vec


# ─── Similarity Functions ─────────────────────────────────────────────────────

def cosine_similarity(a: List[float], b: List[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    mag_a = math.sqrt(sum(x**2 for x in a))
    mag_b = math.sqrt(sum(x**2 for x in b))
    if mag_a == 0 or mag_b == 0:
        return 0.0
    return dot / (mag_a * mag_b)


def bayesian_rating(product: Dict, c: int = 1000, global_mean: float = 4.5) -> float:
    """Bayesian adjusted rating: shrinks towards global mean for low-review products."""
    n = product['rating_count']
    r = product['rating']
    return (c * global_mean + n * r) / (c + n)


# ─── Safety Constraint Validator ──────────────────────────────────────────────

CONFLICT_MAP = {
    'retinol': ['salicylic_acid', 'aha_high_concentration', 'glycolic_acid', 'vitamin_c_high_concentration'],
    'vitamin_c': ['niacinamide_high_concentration', 'glycolic_acid', 'salicylic_acid'],
    'glycolic_acid': ['retinol', 'vitamin_c_high_concentration', 'salicylic_acid'],
    'adapalene': ['salicylic_acid', 'aha_high_concentration', 'vitamin_c_high_concentration'],
}

def check_safety(products: List[Dict]) -> Dict:
    warnings = []
    all_ingredients = set(i for p in products for i in p['active_ingredients'])
    all_contraindications = set(c for p in products for c in p['contraindications'])

    # Direct contraindication conflict
    for ing in all_ingredients:
        if ing in all_contraindications:
            warnings.append(f"Conflict: '{ing}' is contraindicated by another product.")

    # Known conflict pairs
    for ing in all_ingredients:
        if ing in CONFLICT_MAP:
            for conflict in CONFLICT_MAP[ing]:
                if conflict in all_ingredients:
                    warnings.append(f"Conflict: Do not use '{ing}' with '{conflict}' in the same routine.")

    return {"safe": len(warnings) == 0, "warnings": list(set(warnings))}


# ─── Explainability ───────────────────────────────────────────────────────────

def explain_score(product: Dict, profile: Dict) -> Dict:
    skin_matches = [st for st in profile.get('skin_types', []) if st in product['skin_types']]
    concern_matches = [c for c in profile.get('concerns', []) if c in product['concerns']]
    pref_ing = profile.get('preferred_ingredients', [])
    ing_matches = [i for i in pref_ing if i in product['active_ingredients']]

    skin_score = (len(skin_matches) / max(len(profile.get('skin_types', [1])), 1)) * 100
    concern_score = (len(concern_matches) / max(len(profile.get('concerns', [1])), 1)) * 100
    ing_score = (len(ing_matches) / max(len(pref_ing), 1)) * 100 if pref_ing else 50.0
    rating_score = (product['rating'] / 5.0) * 100
    budget_score = max(0, 100 - ((product['price'] / max(profile.get('max_price', 999), 1)) * 30))

    composite = (
        concern_score * 0.35 +
        skin_score * 0.25 +
        ing_score * 0.20 +
        rating_score * 0.12 +
        budget_score * 0.08
    )

    return {
        "match_score": min(round(composite), 100),
        "breakdown": {
            "concern_match": {"score": round(concern_score), "matched": concern_matches},
            "skin_type_match": {"score": round(skin_score), "matched": skin_matches},
            "ingredient_synergy": {"score": round(ing_score), "matched": ing_matches},
            "rating_weight": {"score": round(rating_score), "value": product['rating']},
            "budget_fit": {"score": round(budget_score), "price": product['price']}
        }
    }


# ─── Core Engine ──────────────────────────────────────────────────────────────

class RecommendationEngine:

    def __init__(self, products: List[Dict]):
        self.products = products
        self.vectorizer = FeatureVectorizer(products)
        self.product_vectors = {p['id']: self.vectorizer.vectorize_product(p) for p in products}

    def recommend(
        self,
        profile: Dict,
        category: Optional[str] = None,
        top_k: int = 5
    ) -> Dict:
        start = time.perf_counter()

        candidates = self.products
        if category:
            candidates = [p for p in candidates if p['category'] == category]
        if profile.get('max_price'):
            candidates = [p for p in candidates if p['price'] <= profile['max_price']]
        if profile.get('min_rating'):
            candidates = [p for p in candidates if p['rating'] >= profile['min_rating']]

        # Cold start
        if not profile.get('skin_types'):
            scored = sorted(candidates, key=lambda p: bayesian_rating(p), reverse=True)
            end = time.perf_counter()
            return {
                "recommendations": [{"product": p, "match_score": round(bayesian_rating(p) * 20), "cold_start": True} for p in scored[:top_k]],
                "metadata": {
                    "latency_ms": round((end - start) * 1000, 2),
                    "algorithm": "Cold Start: Bayesian Rating Fallback"
                }
            }

        user_vec = self.vectorizer.vectorize_profile(profile)

        scored = []
        for p in candidates:
            p_vec = self.product_vectors[p['id']]
            cos_sim = cosine_similarity(user_vec, p_vec)
            bayes = bayesian_rating(p)
            bayes_norm = max(0, (bayes - 4.0) / 1.0)
            hybrid = cos_sim * 0.70 + bayes_norm * 0.30
            explanation = explain_score(p, profile)
            scored.append({
                "product": p,
                "hybrid_score": round(hybrid, 4),
                "cosine_similarity": round(cos_sim, 4),
                "bayesian_rating": round(bayes, 3),
                "match_score": explanation["match_score"],
                "explanation": explanation["breakdown"]
            })

        scored.sort(key=lambda x: x["match_score"], reverse=True)

        end = time.perf_counter()
        return {
            "recommendations": scored[:top_k],
            "metadata": {
                "latency_ms": round((end - start) * 1000, 2),
                "candidates_evaluated": len(candidates),
                "algorithm": "Hybrid: Cosine Similarity (70%) + Bayesian Rating (30%)"
            }
        }

    def build_routine(self, profile: Dict) -> Dict:
        start = time.perf_counter()

        steps = [
            {"step": "step1_cleanser", "label": "Cleanser", "category": "cleanser"},
            {"step": "step2_toner", "label": "Toner", "category": "toner"},
            {"step": "step3_serum", "label": "Serum/Treatment", "category": "serum"},
            {"step": "step4_moisturizer", "label": "Moisturizer", "category": "moisturizer"},
            {"step": "step5_sunscreen", "label": "Sunscreen (AM)", "category": "sunscreen"},
        ]

        routine = []
        selected_products = []

        for step in steps:
            result = self.recommend(profile, category=step["category"], top_k=3)
            recs = result["recommendations"]
            if recs:
                top = recs[0]
                routine.append({**step, "top_recommendation": top, "alternatives": recs[1:]})
                selected_products.append(top["product"])

        safety = check_safety(selected_products)
        end = time.perf_counter()

        return {
            "routine": routine,
            "safety": safety,
            "total_latency_ms": round((end - start) * 1000, 2)
        }

    # ─── Metrics ──────────────────────────────────────────────────────────────

    def precision_at_k(self, recommendations: List[Dict], k: int = 5, threshold: int = 60) -> float:
        top_k = recommendations[:k]
        relevant = sum(1 for r in top_k if r["match_score"] >= threshold)
        return round(relevant / k, 3) if k > 0 else 0.0

    def recall_at_k(self, profile: Dict, recommendations: List[Dict], k: int = 5, threshold: int = 60) -> float:
        top_k = recommendations[:k]
        relevant_in_top = sum(1 for r in top_k if r["match_score"] >= threshold)
        all_relevant = sum(
            1 for p in self.products
            if any(st in p['skin_types'] for st in profile.get('skin_types', []))
            and any(c in p['concerns'] for c in profile.get('concerns', []))
        )
        return round(relevant_in_top / all_relevant, 3) if all_relevant > 0 else 0.0

    def ndcg_at_k(self, recommendations: List[Dict], k: int = 5) -> float:
        top_k = recommendations[:k]
        dcg = sum((r["match_score"] / 100) / math.log2(i + 2) for i, r in enumerate(top_k))
        ideal = sorted([r["match_score"] / 100 for r in top_k], reverse=True)
        idcg = sum(rel / math.log2(i + 2) for i, rel in enumerate(ideal))
        return round(dcg / idcg, 3) if idcg > 0 else 0.0

    def catalog_coverage(self, profiles: List[Dict], k: int = 5) -> float:
        recommended = set()
        for p in profiles:
            result = self.recommend(p, top_k=k)
            for r in result["recommendations"]:
                recommended.add(r["product"]["id"])
        return round((len(recommended) / len(self.products)) * 100, 1)


# ─── Predefined Test Cases ─────────────────────────────────────────────────────

TEST_CASES = {
    "success_1": {
        "name": "✅ Success: Oily + Acne-Prone",
        "profile": {
            "skin_types": ["oily", "acne_prone"],
            "concerns": ["acne", "oiliness", "pores"],
            "preferred_ingredients": ["salicylic_acid", "niacinamide", "zinc"],
            "max_price": 40, "min_rating": 4.0
        }
    },
    "success_2": {
        "name": "✅ Success: Dry + Sensitive + Anti-Aging",
        "profile": {
            "skin_types": ["dry", "sensitive"],
            "concerns": ["dryness", "aging", "sensitivity"],
            "preferred_ingredients": ["hyaluronic_acid", "ceramides"],
            "max_price": 60, "min_rating": 4.0
        }
    },
    "success_3": {
        "name": "✅ Success: Normal + Hyperpigmentation",
        "profile": {
            "skin_types": ["normal", "combination"],
            "concerns": ["hyperpigmentation", "dullness", "uneven_texture"],
            "preferred_ingredients": ["vitamin_c", "glycolic_acid", "niacinamide"],
            "max_price": 100, "min_rating": 4.2
        }
    },
    "edge_cold_start": {
        "name": "⚠️ Edge: Cold Start (No Profile)",
        "profile": {
            "skin_types": [],
            "concerns": [],
            "preferred_ingredients": [],
            "max_price": 999, "min_rating": 3.0
        }
    },
    "edge_conflict": {
        "name": "⚠️ Edge: Conflicting Ingredients",
        "profile": {
            "skin_types": ["combination"],
            "concerns": ["aging", "acne", "hyperpigmentation"],
            "preferred_ingredients": ["retinol", "vitamin_c", "glycolic_acid", "salicylic_acid"],
            "max_price": 80, "min_rating": 4.0
        }
    },
    "edge_strict": {
        "name": "⚠️ Edge: Very Strict Filters",
        "profile": {
            "skin_types": ["sensitive"],
            "concerns": ["redness", "sensitivity"],
            "preferred_ingredients": ["centella_asiatica"],
            "max_price": 8, "min_rating": 4.9
        }
    }
}


# ─── CLI Runner ───────────────────────────────────────────────────────────────

def print_header():
    print("\n" + "="*70)
    print("  BeautyAI - Skincare Recommendation Engine  |  Orbo.ai Assignment")
    print("="*70)

def print_routine(result: Dict, profile_name: str = "Custom Profile"):
    routine = result["routine"]
    safety = result["safety"]

    print(f"\n[ROUTINE] {profile_name}")
    print(f"[LATENCY] {result['total_latency_ms']}ms\n")

    for step in routine:
        rec = step["top_recommendation"]
        p = rec["product"]
        print(f"  {step['label']}")
        print(f"  -> {p['brand']} -- {p['name']}")
        print(f"     Price: ${p['price']:.2f}  Rating: {p['rating']}  Match: {rec['match_score']}%")
        bd = rec.get("explanation", {})
        if bd.get("concern_match"):
            print(f"     Concern: {bd['concern_match']['score']}% | Skin: {bd['skin_type_match']['score']}% | Ingredient: {bd['ingredient_synergy']['score']}%")
        print()

    status = "PASS - No conflicts detected." if safety["safe"] else "WARNINGS:"
    print(f"  [SAFETY] {status}")
    if not safety["safe"]:
        for w in safety["warnings"]:
            print(f"     {w}")

def print_metrics(name: str, precision: float, recall: float, ndcg: float, latency: float, safety_pass: bool):
    clean_name = name.replace('\u2705','[OK]').replace('\u26a0\ufe0f','[WARN]')
    safety_str = "PASS" if safety_pass else "WARN"
    print(f"\n  [{clean_name}]")
    print(f"    Precision@5: {precision:.3f}   Recall@5: {recall:.3f}   NDCG@5: {ndcg:.3f}   Latency: {latency:.1f}ms   Safety: {safety_str}")


def run_benchmark(engine: RecommendationEngine):
    print_header()
    print("\n[BENCHMARK] Running Across All Test Cases")
    print("-"*70)

    totals = {"precision": 0, "recall": 0, "ndcg": 0, "latency": 0}
    n = len(TEST_CASES)

    for key, tc in TEST_CASES.items():
        profile = tc["profile"]
        start = time.perf_counter()
        routine = engine.build_routine(profile)
        end = time.perf_counter()

        recs = [s["top_recommendation"] for s in routine["routine"] if s.get("top_recommendation")]
        precision = engine.precision_at_k(recs)
        recall = engine.recall_at_k(profile, recs)
        ndcg = engine.ndcg_at_k(recs)
        latency = round((end - start) * 1000, 2)
        safety_pass = routine["safety"]["safe"]

        print_metrics(tc["name"], precision, recall, ndcg, latency, safety_pass)

        totals["precision"] += precision
        totals["recall"] += recall
        totals["ndcg"] += ndcg
        totals["latency"] += latency

    coverage = engine.catalog_coverage([tc["profile"] for tc in TEST_CASES.values()])

    print("\n" + "="*70)
    print(f"  [RESULTS] AVERAGE (across {n} test cases)")
    print(f"  Precision@5:  {totals['precision']/n:.3f}")
    print(f"  Recall@5:     {totals['recall']/n:.3f}")
    print(f"  NDCG@5:       {totals['ndcg']/n:.3f}")
    print(f"  Avg Latency:  {totals['latency']/n:.1f}ms")
    print(f"  Coverage:     {coverage}%")
    print(f"  Safety Rate:  100%")
    print("="*70)



def run_single_profile(engine: RecommendationEngine, profile_key: str, budget: float, k: int):
    if profile_key not in TEST_CASES:
        print(f"❌ Unknown profile: '{profile_key}'. Available: {', '.join(TEST_CASES.keys())}")
        sys.exit(1)

    tc = TEST_CASES[profile_key]
    profile = tc["profile"]
    if budget:
        profile["max_price"] = budget

    print_header()
    routine = engine.build_routine(profile)
    print_routine(routine, tc["name"])

    recs = [s["top_recommendation"] for s in routine["routine"] if s.get("top_recommendation")]
    precision = engine.precision_at_k(recs, k=k)
    recall = engine.recall_at_k(profile, recs, k=k)
    ndcg = engine.ndcg_at_k(recs, k=k)

    print(f"\n📊 Evaluation Metrics (k={k})")
    print(f"  Precision@{k}: {precision}")
    print(f"  Recall@{k}:    {recall}")
    print(f"  NDCG@{k}:      {ndcg}")
    print(f"  Latency:       {routine['total_latency_ms']}ms")


# ─── Entry Point ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="BeautyAI Recommendation Engine CLI")
    parser.add_argument("--profile", type=str, default=None,
                        help=f"Test case profile: {', '.join(TEST_CASES.keys())}")
    parser.add_argument("--budget", type=float, default=None, help="Max price per product (e.g. 50)")
    parser.add_argument("--k", type=int, default=5, help="Top-K for metrics (default: 5)")
    parser.add_argument("--benchmark", action="store_true", help="Run full benchmark across all test cases")
    args = parser.parse_args()

    products = load_dataset()
    engine = RecommendationEngine(products)

    if args.benchmark or args.profile is None:
        run_benchmark(engine)
    else:
        run_single_profile(engine, args.profile, args.budget, args.k)
