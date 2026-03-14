"""
MAINTAIN AI — RAG Knowledge Base (Retrieval-Augmented Generation)

Provides domain-specific knowledge retrieval for infrastructure agents.
This module implements a lightweight RAG pipeline that:

1. Maintains a curated knowledge base of municipal codes, repair standards,
   safety regulations, and Lake Forest-specific policies
2. Performs semantic similarity search using embeddings
3. Augments agent prompts with relevant context before LLM calls

Architecture:
    ┌──────────────────────────────────────────────────────────┐
    │                   RAG PIPELINE                            │
    │                                                          │
    │   Query ──► Embed ──► Search ──► Top-K ──► Augment      │
    │                                                          │
    │   ┌───────────────────────────────────────────────────┐  │
    │   │  Knowledge Chunks (pre-embedded)                  │  │
    │   │  • Municipal codes & ordinances                   │  │
    │   │  • APWA repair standards                          │  │
    │   │  • ADA compliance requirements                     │  │
    │   │  • Lake Forest-specific policies                   │  │
    │   │  • Safety buffer zones (schools, hospitals)        │  │
    │   │  • Weather impact guidelines                       │  │
    │   │  • Budget & procurement thresholds                 │  │
    │   └───────────────────────────────────────────────────┘  │
    │                                                          │
    │   Embedding: text-similarity via cosine distance          │
    │   Fallback: keyword TF-IDF matching                      │
    └──────────────────────────────────────────────────────────┘

For the hackathon, we use an in-memory vector store with pre-embedded
knowledge chunks. In production, this would connect to Azure AI Search.
"""

import os
import json
import math
import hashlib
import time
from pathlib import Path
from datetime import datetime
from typing import Any, Optional
from dataclasses import dataclass, field

from dotenv import load_dotenv

_env_path = Path(__file__).resolve().parent / ".env"
load_dotenv(_env_path)

from model_router import chat_completion, route, FOUNDRY_ENDPOINT, FOUNDRY_API_KEY

# ── Foundry Embeddings (azure-ai-inference SDK) ──
try:
    from azure.ai.inference import EmbeddingsClient
    from azure.core.credentials import AzureKeyCredential
    _embeddings_available = True
except ImportError:
    _embeddings_available = False
    print("⚠️  azure-ai-inference EmbeddingsClient not available — using TF-IDF fallback")

EMBEDDING_MODEL = "text-embedding-3-small"  # 1536 dims, free on Foundry
_embeddings_client: Optional["EmbeddingsClient"] = None
_embeddings_ok: Optional[bool] = None  # None = untested, True/False = tested

# ============================================
# Knowledge Documents
# ============================================

KNOWLEDGE_BASE: list[dict[str, str]] = [
    # ── Municipal Codes & Ordinances ──
    {
        "id": "mc-001",
        "category": "municipal_code",
        "title": "Lake Forest Municipal Code §7-3-1: Street Maintenance",
        "content": """Lake Forest Municipal Code §7-3-1 requires the City to maintain all public 
streets, alleys, and rights-of-way in safe condition. Potholes exceeding 2 inches in depth 
or 6 inches in diameter must be repaired within 48 hours of report for arterial streets, 
and within 7 days for residential streets. Failure to meet these timelines creates liability 
exposure under the Illinois Local Governmental and Governmental Employees Tort Immunity Act 
(745 ILCS 10/). Critical defects near schools require same-day response.""",
    },
    {
        "id": "mc-002",
        "category": "municipal_code",
        "title": "Lake Forest Ordinance §7-3-4: Sidewalk Repair Responsibility",
        "content": """Per Ordinance §7-3-4, properties adjacent to public sidewalks share 
responsibility for sidewalk maintenance. The City repairs trip hazards exceeding 1/2 inch 
vertical displacement or cracks wider than 1 inch. Cost-sharing: City pays 50% for 
residential properties, 100% for commercial districts and school zones. ADA compliance 
requires all sidewalks to maintain minimum 36-inch clear width and maximum 2% cross-slope. 
Emergency repairs (>2 inch displacement) are 100% city-funded.""",
    },
    {
        "id": "mc-003",
        "category": "municipal_code",
        "title": "Illinois Highway Code (605 ILCS 5/): State Requirements",
        "content": """Illinois municipalities must maintain roads to IDOT standards. Annual 
pavement condition index (PCI) surveys required. Roads below PCI 40 classified as 'poor' 
and eligible for state MFT (Motor Fuel Tax) funding. Lake Forest allocates approximately 
$2.4M annually from MFT for street maintenance. Federal aid routes must meet FHWA minimum 
standards for surface condition, signing, and striping.""",
    },
    # ── APWA Repair Standards ──
    {
        "id": "rs-001",
        "category": "repair_standards",
        "title": "APWA Pothole Repair Standards",
        "content": """American Public Works Association (APWA) pothole repair standards:
- Throw-and-roll: Temporary patch, lasts 1-3 months. Cost: $30-50 per pothole. Use for 
  low-severity, low-traffic areas.
- Semi-permanent: Clean, fill, compact. Lasts 1-3 years. Cost: $150-400. Standard for 
  medium severity.
- Full-depth repair: Saw-cut, excavate, base repair, hot-mix fill. Lasts 10+ years. 
  Cost: $800-2500. Required for critical/recurring potholes.
- Infrared repair: Heat existing asphalt, add new material, compact. Lasts 5-7 years. 
  Cost: $400-800. Best for cluster repairs.
Response time targets: Critical = same day, High = 3 days, Medium = 7 days, Low = 14 days.""",
    },
    {
        "id": "rs-002",
        "category": "repair_standards",
        "title": "APWA Sidewalk Repair Standards",
        "content": """APWA sidewalk repair classification:
- Class A: Minor cracks (<1/4 inch). Seal with routing and crack filler. $5-15/linear foot.
- Class B: Moderate displacement (1/4 - 1 inch). Mud-jack or foam-lift. $200-600/panel.
- Class C: Major displacement (>1 inch). Panel removal and replacement. $800-1500/panel.
- Class D: Structural failure. Full reconstruction including sub-base. $2000-4500/section.
ADA ramp installation: $1500-3500 per corner. Required at every intersection with 
pedestrian crossing. Priority zones: school routes, hospital access, transit stops.""",
    },
    # ── Safety & School Zones ──
    {
        "id": "sf-001",
        "category": "safety",
        "title": "School Zone Safety Buffer Requirements",
        "content": """Illinois School Code (105 ILCS 5/) and Lake Forest policy require:
- 1,500 ft safety buffer around all K-12 schools for infrastructure prioritization
- Walk-to-school routes inspected monthly during school year (Sep-Jun)
- Sidewalk defects on designated Safe Routes to School paths: 24-hour repair window
- Speed humps, crosswalk markings, and signage maintained to MUTCD standards
- Lake Forest schools requiring buffers: Deer Path Middle School, Cherokee Elementary, 
  Everett Elementary, Sheridan Elementary, Lake Forest High School, School of St. Mary
- All infrastructure work near schools requires traffic control plan and flaggers during 
  school hours (7:30 AM - 3:30 PM school days).""",
    },
    {
        "id": "sf-002",
        "category": "safety",
        "title": "ADA Compliance Requirements for Infrastructure",
        "content": """Americans with Disabilities Act (ADA) requirements for municipal infrastructure:
- Sidewalks: minimum 36" clear width, max 2% cross-slope, max 5% running slope
- Curb ramps: required at all intersections, detectable warning surfaces (truncated domes)
- Surface: stable, firm, slip-resistant. No gaps >1/2 inch, no vertical changes >1/4 inch
- Accessible pedestrian signals at signalized intersections
- Violations can trigger DOJ enforcement, private lawsuits, and federal funding loss
- Lake Forest ADA Transition Plan requires all non-compliant infrastructure addressed by 2028
- Priority: routes to public facilities, schools, transit, medical facilities""",
    },
    # ── Weather Impact Guidelines ──
    {
        "id": "wi-001",
        "category": "weather",
        "title": "Weather Impact on Infrastructure Repairs",
        "content": """Chicago-region weather impact guidelines for Lake Forest:
- Freeze-thaw cycles (Nov-Mar): Primary cause of pothole formation. Water enters cracks, 
  freezes (expands 9%), thaws, creating voids. Average 30-50 freeze-thaw cycles per winter.
- Cold weather restrictions: Hot-mix asphalt requires >40°F ambient and rising. Below 40°F, 
  use cold-mix (temporary) or infrared methods.
- Rain delays: Cannot pave in active rain. 24-hour cure time for patch material.
- Extreme heat (>95°F): Asphalt softens, reducing compaction effectiveness. Schedule paving 
  for early morning. Concrete curing requires additional moisture control.
- Snow/ice: All non-emergency repairs suspended. Crews shift to snow removal.
- Spring thaw (Mar-Apr): Peak pothole season. Expect 200-300% increase in reports.
- Optimal repair window: Late April through October for permanent repairs.""",
    },
    # ── Budget & Procurement ──
    {
        "id": "bp-001",
        "category": "budget",
        "title": "Lake Forest Infrastructure Budget Guidelines",
        "content": """Lake Forest FY2025-2026 infrastructure budget allocation:
- Total public works budget: ~$12.5M
- Street maintenance (MFT + general fund): $3.8M
- Sidewalk program: $800K
- Emergency repairs reserve: $400K
- Capital improvement projects: $4.2M
- Equipment/fleet: $1.8M

Procurement thresholds (IL Municipal Code):
- Under $10K: Department head approval, informal quotes
- $10K-$25K: Three written quotes required
- $25K-$50K: Competitive bidding, City Manager approval
- Over $50K: Formal sealed bid, City Council approval
- Emergency exception: City Manager can authorize up to $50K without bidding for 
  immediate safety hazards (requires post-facto Council ratification)""",
    },
    {
        "id": "bp-002",
        "category": "budget",
        "title": "Cost-of-Inaction Analysis for Infrastructure",
        "content": """Infrastructure decay cost multipliers (ASCE standards):
- Deferred pothole repair: Cost increases 5-8x if left >6 months (base failure)
- Deferred sidewalk repair: Cost increases 3-5x, plus liability from trip/fall claims
  (average trip/fall settlement: $25K-$150K)
- Road reconstruction vs. maintenance: $1 in timely maintenance prevents $6-14 in 
  reconstruction costs
- Pavement lifecycle: Preventive maintenance at PCI 70+ costs $2-5/sq yd. 
  Reconstruction at PCI <25 costs $30-60/sq yd.
- ADA non-compliance litigation: Average defense cost $50K-200K per case
- Lake Forest risk exposure: Estimated $180K annual liability savings from proactive 
  maintenance program vs. reactive-only approach""",
    },
    # ── Crew & Resource Management ──
    {
        "id": "cr-001",
        "category": "crew_management",
        "title": "Crew Deployment Best Practices",
        "content": """Municipal crew deployment optimization (APWA guidelines):
- Optimal crew size: 3-5 workers per crew for pothole repair, 4-6 for sidewalk
- Equipment per crew: 1 dump truck, 1 roller/compactor, hand tools
- Daily capacity: 8-12 potholes (throw-and-roll), 4-6 potholes (semi-permanent), 
  3-4 sidewalk panels
- Route optimization: Cluster nearby work orders to minimize travel time (>15% efficiency gain)
- Specialization premium: Dedicated crews are 20-35% more efficient than generalists
- Weather standby: Crews on standby during inclement weather should perform equipment 
  maintenance, material staging, or indoor training
- Safety briefing: Required at start of each shift. Minimum 15 minutes.
- School zone work: Requires additional flagger, reduced hours (no work 7-8:30AM, 2:30-3:30PM)""",
    },
]


# ============================================
# Foundry Embedding Functions
# ============================================

def _get_embeddings_client() -> Optional["EmbeddingsClient"]:
    """Get or create the Foundry EmbeddingsClient singleton."""
    global _embeddings_client, _embeddings_ok
    if not _embeddings_available or not FOUNDRY_ENDPOINT:
        _embeddings_ok = False
        return None
    if _embeddings_client is not None:
        return _embeddings_client
    try:
        _embeddings_client = EmbeddingsClient(
            endpoint=FOUNDRY_ENDPOINT,
            credential=AzureKeyCredential(FOUNDRY_API_KEY),
        )
        _embeddings_ok = True
        return _embeddings_client
    except Exception as e:
        print(f"⚠️  Failed to create EmbeddingsClient: {e}")
        _embeddings_ok = False
        return None


def _embed_texts(texts: list[str]) -> Optional[list[list[float]]]:
    """Embed a batch of texts via Foundry text-embedding-3-small."""
    global _embeddings_ok
    client = _get_embeddings_client()
    if client is None:
        return None
    try:
        resp = client.embed(input=texts, model=EMBEDDING_MODEL)
        return [item.embedding for item in resp.data]
    except Exception as e:
        print(f"⚠️  Foundry embedding call failed: {e}")
        _embeddings_ok = False
        return None


def _cosine_sim_vectors(a: list[float], b: list[float]) -> float:
    """Cosine similarity between two dense embedding vectors."""
    dot = sum(x * y for x, y in zip(a, b))
    mag_a = math.sqrt(sum(x * x for x in a))
    mag_b = math.sqrt(sum(x * x for x in b))
    if mag_a == 0 or mag_b == 0:
        return 0.0
    return dot / (mag_a * mag_b)


# Pre-computed document embeddings (dense vectors from Foundry)
_DOC_EMBEDDINGS: dict[str, list[float]] = {}
_EMBEDDINGS_INITIALIZED = False


def _ensure_embeddings():
    """Lazily embed all knowledge base documents via Foundry."""
    global _EMBEDDINGS_INITIALIZED
    if _EMBEDDINGS_INITIALIZED:
        return
    _EMBEDDINGS_INITIALIZED = True

    texts = []
    doc_ids = []
    for doc in KNOWLEDGE_BASE:
        texts.append(f"{doc['title']}\n{doc['content']}")
        doc_ids.append(doc["id"])

    embeddings = _embed_texts(texts)
    if embeddings and len(embeddings) == len(doc_ids):
        for doc_id, emb in zip(doc_ids, embeddings):
            _DOC_EMBEDDINGS[doc_id] = emb
        print(f"✅ RAG: Embedded {len(doc_ids)} knowledge docs via Foundry ({EMBEDDING_MODEL}, {len(embeddings[0])} dims)")
    else:
        print("⚠️  RAG: Foundry embedding failed — will fall back to TF-IDF per query")


# ============================================
# TF-IDF Fallback (lightweight, no network)
# ============================================

def _text_to_terms(text: str) -> dict[str, float]:
    """Convert text to weighted term frequency vector (TF-IDF-like)."""
    import re
    words = re.findall(r'\b[a-z][a-z0-9]+\b', text.lower())
    stops = {'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
             'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
             'has', 'have', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
             'should', 'may', 'might', 'can', 'this', 'that', 'these', 'those',
             'it', 'its', 'not', 'no', 'all', 'per', 'each', 'any', 'if', 'than'}
    terms: dict[str, float] = {}
    for w in words:
        if w not in stops and len(w) > 2:
            terms[w] = terms.get(w, 0) + 1.0
    domain_boost = {
        'pothole': 3.0, 'sidewalk': 3.0, 'concrete': 2.5, 'repair': 2.0,
        'safety': 2.5, 'school': 3.0, 'ada': 3.0, 'budget': 2.0, 'cost': 2.0,
        'crew': 2.0, 'critical': 2.5, 'emergency': 2.5, 'weather': 2.0,
        'freeze': 2.0, 'thaw': 2.0, 'liability': 2.0, 'compliance': 2.0,
        'ordinance': 2.5, 'municipal': 2.0, 'apwa': 3.0, 'severity': 2.0,
        'priority': 2.0, 'dispatch': 2.0, 'inspection': 2.0,
    }
    for term, boost in domain_boost.items():
        if term in terms:
            terms[term] *= boost
    return terms


def _cosine_similarity_tfidf(a: dict[str, float], b: dict[str, float]) -> float:
    """Cosine similarity between two sparse TF-IDF term vectors."""
    common = set(a.keys()) & set(b.keys())
    if not common:
        return 0.0
    dot = sum(a[k] * b[k] for k in common)
    mag_a = math.sqrt(sum(v * v for v in a.values()))
    mag_b = math.sqrt(sum(v * v for v in b.values()))
    if mag_a == 0 or mag_b == 0:
        return 0.0
    return dot / (mag_a * mag_b)


_DOC_VECTORS: dict[str, dict[str, float]] = {}

def _ensure_tfidf_vectors():
    """Lazily compute TF-IDF vectors (fallback when embeddings unavailable)."""
    if _DOC_VECTORS:
        return
    for doc in KNOWLEDGE_BASE:
        text = f"{doc['title']} {doc['content']} {doc['category']}"
        _DOC_VECTORS[doc["id"]] = _text_to_terms(text)


# ============================================
# Retrieval
# ============================================

@dataclass
class RetrievalResult:
    """A retrieved knowledge chunk with relevance score."""
    doc_id: str
    title: str
    content: str
    category: str
    score: float
    

def retrieve(query: str, top_k: int = 3, min_score: float = 0.05) -> list[RetrievalResult]:
    """
    Retrieve the most relevant knowledge chunks for a query.
    
    Primary: Foundry text-embedding-3-small (dense vector cosine similarity).
    Fallback: TF-IDF weighted term vectors (no network needed).
    
    Args:
        query: Natural language query
        top_k: Number of results to return
        min_score: Minimum similarity threshold
    
    Returns:
        List of RetrievalResult sorted by relevance
    """
    # Try Foundry embeddings first
    _ensure_embeddings()
    if _DOC_EMBEDDINGS:
        return _retrieve_with_embeddings(query, top_k, min_score)
    
    # Fallback to TF-IDF
    return _retrieve_with_tfidf(query, top_k, min_score)


def _retrieve_with_embeddings(query: str, top_k: int, min_score: float) -> list[RetrievalResult]:
    """Retrieve using Foundry dense embeddings (text-embedding-3-small)."""
    query_emb = _embed_texts([query])
    if not query_emb:
        # Embedding call failed — fall back to TF-IDF for this query
        return _retrieve_with_tfidf(query, top_k, min_score)
    
    q_vec = query_emb[0]
    scored = []
    for doc in KNOWLEDGE_BASE:
        doc_emb = _DOC_EMBEDDINGS.get(doc["id"])
        if not doc_emb:
            continue
        score = _cosine_sim_vectors(q_vec, doc_emb)
        if score >= min_score:
            scored.append(RetrievalResult(
                doc_id=doc["id"],
                title=doc["title"],
                content=doc["content"],
                category=doc["category"],
                score=round(score, 4),
            ))
    scored.sort(key=lambda r: r.score, reverse=True)
    return scored[:top_k]


def _retrieve_with_tfidf(query: str, top_k: int, min_score: float) -> list[RetrievalResult]:
    """Retrieve using TF-IDF term vectors (fallback, no network)."""
    _ensure_tfidf_vectors()
    query_vec = _text_to_terms(query)
    scored = []
    for doc in KNOWLEDGE_BASE:
        doc_vec = _DOC_VECTORS.get(doc["id"], {})
        score = _cosine_similarity_tfidf(query_vec, doc_vec)
        if score >= min_score:
            scored.append(RetrievalResult(
                doc_id=doc["id"],
                title=doc["title"],
                content=doc["content"],
                category=doc["category"],
                score=round(score, 4),
            ))
    scored.sort(key=lambda r: r.score, reverse=True)
    return scored[:top_k]


# ============================================
# RAG-Augmented Chat
# ============================================

def rag_augmented_chat(
    query: str,
    context: str = "",
    agent: str = "rag",
    top_k: int = 3,
) -> dict[str, Any]:
    """
    Answer a query using RAG-augmented generation.
    
    1. Retrieve relevant knowledge chunks
    2. Build augmented prompt with retrieved context
    3. Generate answer via Model Router
    
    Args:
        query: User's question
        context: Additional context (e.g., current work order data)
        agent: Agent name for model routing
        top_k: Number of knowledge chunks to retrieve
    
    Returns:
        {
            answer: str,
            sources: [{doc_id, title, category, score}],
            model: str,
            tokens: int,
            latency_ms: float,
        }
    """
    import time
    start = time.time()
    
    # Step 1: Retrieve
    results = retrieve(query, top_k=top_k)
    
    # Step 2: Build augmented prompt
    knowledge_context = "\n\n".join([
        f"### {r.title}\n{r.content}"
        for r in results
    ])
    
    system_prompt = """You are MAINTAIN AI, an expert infrastructure advisor for Lake Forest, IL.

You have access to a knowledge base of municipal codes, repair standards, safety regulations, 
and budget guidelines. Use the provided knowledge to give accurate, policy-compliant answers.

RULES:
- Cite specific codes, standards, or policies when applicable (e.g., "Per §7-3-1...")
- If the knowledge base doesn't cover the question, say so and provide general best practices
- Be concise but authoritative
- Include cost estimates when relevant
- Flag safety or compliance concerns prominently
"""
    
    user_content = f"""Question: {query}

{f"Current Data Context: {context}" if context else ""}

Relevant Knowledge Base:
{knowledge_context if knowledge_context else "No directly relevant knowledge found. Use general infrastructure best practices."}

Provide a comprehensive answer citing relevant standards and policies."""

    # Step 3: Generate via Model Router
    resp = chat_completion(
        agent=agent,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
        ],
        max_tokens=2048,
        temperature=0.3,
    )
    
    latency = (time.time() - start) * 1000
    
    return {
        "answer": resp.content,
        "sources": [
            {
                "doc_id": r.doc_id,
                "title": r.title,
                "category": r.category,
                "score": r.score,
            }
            for r in results
        ],
        "model": resp.model,
        "model_display": resp.model_display,
        "tokens": resp.total_tokens,
        "latency_ms": round(latency, 1),
        "retrieval_count": len(results),
    }


# ============================================
# Knowledge Base Stats
# ============================================

def get_rag_status() -> dict[str, Any]:
    """Return RAG pipeline status and knowledge base stats."""
    _ensure_embeddings()
    categories = {}
    for doc in KNOWLEDGE_BASE:
        cat = doc["category"]
        categories[cat] = categories.get(cat, 0) + 1

    using_foundry = bool(_DOC_EMBEDDINGS)
    return {
        "enabled": True,
        "knowledge_base": {
            "total_documents": len(KNOWLEDGE_BASE),
            "categories": categories,
            "embedding_method": f"Foundry {EMBEDDING_MODEL} (1536 dims)" if using_foundry else "TF-IDF fallback",
            "embedding_model": EMBEDDING_MODEL if using_foundry else None,
            "embedded_count": len(_DOC_EMBEDDINGS),
            "vector_dims": 1536 if using_foundry else None,
        },
        "retrieval": {
            "method": "dense_vector_cosine" if using_foundry else "tfidf_cosine",
            "default_top_k": 3,
            "min_score_threshold": 0.05,
            "foundry_embeddings": using_foundry,
        },
        "model_route": route("rag").model_id,
    }


# ============================================
# CLI Test
# ============================================

if __name__ == "__main__":
    import sys
    
    query = sys.argv[1] if len(sys.argv) > 1 else "What are the repair standards for critical potholes near schools?"
    
    print(f"\n🔍 RAG Knowledge Base Query")
    print(f"=" * 55)
    print(f"Query: {query}\n")
    
    # Show retrieval results
    results = retrieve(query, top_k=5)
    print(f"📚 Retrieved {len(results)} knowledge chunks:")
    for r in results:
        print(f"   [{r.score:.4f}] {r.title} ({r.category})")
    
    print(f"\n🤖 Generating RAG-augmented answer...")
    response = rag_augmented_chat(query)
    
    print(f"\n📝 Answer:")
    print(response["answer"])
    print(f"\n📊 Sources: {len(response['sources'])}")
    for s in response["sources"]:
        print(f"   • {s['title']} (score: {s['score']})")
    print(f"⚡ Model: {response['model']} | Tokens: {response['tokens']} | Latency: {response['latency_ms']:.0f}ms")
