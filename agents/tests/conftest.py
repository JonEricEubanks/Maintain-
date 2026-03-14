"""
MAINTAIN AI — Pytest Configuration & Shared Fixtures

Sets up sys.path so tests can import agent modules,
and provides common fixtures (mock data, FastAPI test client, etc.).
"""

import sys
import os
from pathlib import Path

import pytest

# Add the agents/ directory to sys.path so tests can import modules directly
AGENTS_DIR = Path(__file__).resolve().parent.parent
if str(AGENTS_DIR) not in sys.path:
    sys.path.insert(0, str(AGENTS_DIR))

# Ensure a .env file exists (test modules may call load_dotenv)
os.environ.setdefault("AZURE_AI_API_KEY", "test-key-placeholder")
os.environ.setdefault(
    "AZURE_OPENAI_ENDPOINT",
    "https://test-placeholder.openai.azure.com",
)


# ── Shared Fixtures ──────────────────────────────────────────────

@pytest.fixture
def sample_work_orders() -> list[dict]:
    """A handful of realistic work orders for testing."""
    return [
        {
            "id": "WO-2001",
            "title": "Pothole on Main St",
            "description": "Large pothole near school zone, 4 inches deep",
            "issueType": "Pothole",
            "priority": "Critical",
            "severity": "critical",
            "status": "Open",
            "neighborhood": "Downtown",
            "estimatedCost": 1200,
            "assignedTo": "Crew Alpha",
            "location": {"lat": 42.234, "lng": -87.841},
        },
        {
            "id": "WO-2002",
            "title": "Cracked sidewalk on Elm Ave",
            "description": "1-inch trip hazard near hospital entrance",
            "issueType": "Sidewalk",
            "priority": "High",
            "severity": "high",
            "status": "Open",
            "neighborhood": "West Side",
            "estimatedCost": 800,
            "assignedTo": "Crew Beta",
            "location": {"lat": 42.236, "lng": -87.838},
        },
        {
            "id": "WO-2003",
            "title": "Storm drain clog on Oak Rd",
            "description": "Minor debris accumulation causing slow drain",
            "issueType": "Drainage",
            "priority": "Medium",
            "severity": "medium",
            "status": "Open",
            "neighborhood": "North End",
            "estimatedCost": 400,
            "assignedTo": "Crew Alpha",
            "location": {"lat": 42.239, "lng": -87.843},
        },
    ]


@pytest.fixture
def fastapi_client():
    """
    Return an httpx AsyncClient wired to the FastAPI app.
    Lazy-imports api_server to avoid heavy startup during unit tests.
    """
    import httpx
    from api_server import app

    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://testserver",
    )
