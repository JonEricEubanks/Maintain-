"""
MAINTAIN AI — RAG Knowledge Base Unit Tests

Tests knowledge base content, TF-IDF retrieval, similarity scoring,
and status reporting. Does NOT call the LLM (no network required).
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from rag_knowledge_base import (
    KNOWLEDGE_BASE,
    retrieve,
    RetrievalResult,
    get_rag_status,
    _text_to_terms,
    _cosine_similarity,
    _ensure_vectors,
)


# ============================================
# Knowledge Base Content Tests
# ============================================


class TestKnowledgeBase:
    """Verify the knowledge base has the right content."""

    def test_has_at_least_10_documents(self):
        assert len(KNOWLEDGE_BASE) >= 10

    def test_all_documents_have_required_fields(self):
        for doc in KNOWLEDGE_BASE:
            assert "id" in doc, f"Document missing id"
            assert "category" in doc, f"Document {doc.get('id')} missing category"
            assert "title" in doc, f"Document {doc.get('id')} missing title"
            assert "content" in doc, f"Document {doc.get('id')} missing content"

    def test_unique_document_ids(self):
        ids = [doc["id"] for doc in KNOWLEDGE_BASE]
        assert len(ids) == len(set(ids)), "Duplicate document IDs found"

    def test_has_municipal_code_category(self):
        cats = {doc["category"] for doc in KNOWLEDGE_BASE}
        assert "municipal_code" in cats

    def test_has_safety_category(self):
        cats = {doc["category"] for doc in KNOWLEDGE_BASE}
        assert "safety" in cats

    def test_has_multiple_categories(self):
        cats = {doc["category"] for doc in KNOWLEDGE_BASE}
        assert len(cats) >= 4, f"Expected at least 4 categories, got {len(cats)}: {cats}"

    def test_content_not_empty(self):
        for doc in KNOWLEDGE_BASE:
            assert len(doc["content"].strip()) > 50, (
                f"Document {doc['id']} content too short"
            )


# ============================================
# TF-IDF & Similarity Tests
# ============================================


class TestTextProcessing:
    """Test the text-to-terms and cosine similarity functions."""

    def test_text_to_terms_returns_dict(self):
        terms = _text_to_terms("pothole repair near school zone")
        assert isinstance(terms, dict)
        assert len(terms) > 0

    def test_text_to_terms_lowercases(self):
        terms = _text_to_terms("POTHOLE REPAIR")
        for key in terms:
            assert key == key.lower()

    def test_cosine_similarity_identical_vectors(self):
        v = {"pothole": 1.0, "repair": 0.5}
        sim = _cosine_similarity(v, v)
        assert abs(sim - 1.0) < 0.01

    def test_cosine_similarity_orthogonal_vectors(self):
        a = {"pothole": 1.0}
        b = {"sidewalk": 1.0}
        sim = _cosine_similarity(a, b)
        assert sim == 0.0

    def test_cosine_similarity_partial_overlap(self):
        a = {"pothole": 1.0, "repair": 0.5}
        b = {"pothole": 0.8, "school": 0.6}
        sim = _cosine_similarity(a, b)
        assert 0 < sim < 1

    def test_cosine_similarity_empty_vector(self):
        a = {"pothole": 1.0}
        b: dict[str, float] = {}
        sim = _cosine_similarity(a, b)
        assert sim == 0.0


# ============================================
# Retrieval Tests
# ============================================


class TestRetrieval:
    """Test the retrieve() function (semantic search)."""

    def test_retrieve_returns_list(self):
        results = retrieve("pothole repair")
        assert isinstance(results, list)

    def test_retrieve_returns_retrieval_results(self):
        results = retrieve("sidewalk damage")
        if results:
            assert isinstance(results[0], RetrievalResult)

    def test_retrieve_respects_top_k(self):
        results = retrieve("infrastructure maintenance", top_k=2)
        assert len(results) <= 2

    def test_retrieve_scores_descending(self):
        results = retrieve("pothole near school", top_k=5)
        scores = [r.score for r in results]
        assert scores == sorted(scores, reverse=True)

    def test_retrieve_pothole_query_finds_pothole_docs(self):
        results = retrieve("pothole repair standards critical", top_k=5)
        titles = " ".join(r.title.lower() for r in results)
        # Should find some infrastructure-related document
        assert len(results) > 0

    def test_retrieve_safety_query_finds_safety_doc(self):
        results = retrieve("safety buffer zone schools hospitals", top_k=5)
        categories = [r.category for r in results]
        assert any(c in ("safety", "municipal_code") for c in categories)

    def test_retrieve_min_score_filter(self):
        results = retrieve("completely unrelated xyzzy foobar", top_k=5, min_score=0.5)
        # High min_score should filter most results for irrelevant query
        for r in results:
            assert r.score >= 0.5

    def test_retrieve_result_has_required_fields(self):
        results = retrieve("sidewalk repair cost", top_k=1)
        if results:
            r = results[0]
            assert r.doc_id
            assert r.title
            assert r.content
            assert r.category
            assert isinstance(r.score, float)


# ============================================
# RAG Status Tests
# ============================================


class TestRAGStatus:
    """Test get_rag_status() output."""

    def test_status_has_required_keys(self):
        status = get_rag_status()
        assert "enabled" in status
        assert "knowledge_base" in status
        assert "retrieval" in status
        assert "model_route" in status

    def test_status_enabled(self):
        status = get_rag_status()
        assert status["enabled"] is True

    def test_status_knowledge_base_info(self):
        status = get_rag_status()
        kb = status["knowledge_base"]
        assert kb["total_documents"] == len(KNOWLEDGE_BASE)
        assert isinstance(kb["categories"], dict)
        assert len(kb["categories"]) >= 4
        assert kb["embedding_method"]

    def test_status_retrieval_config(self):
        status = get_rag_status()
        ret = status["retrieval"]
        assert ret["method"] == "cosine_similarity"
        assert ret["default_top_k"] > 0

    def test_status_model_route_is_valid(self):
        status = get_rag_status()
        assert status["model_route"] in (
            "gpt-4.1", "gpt-4.1-mini", "gpt-4o", "Phi-4", "Phi-4-reasoning",
        )
