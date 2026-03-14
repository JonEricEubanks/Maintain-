"""
MAINTAIN AI — MCP Client Unit Tests

Tests the shared MCP client module: request ID generation,
mcp_call error handling, and convenience helpers.
Pure logic — no network calls (all HTTP mocked).
"""

import sys
from pathlib import Path
from unittest.mock import patch, MagicMock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import mcp_client
from mcp_client import mcp_call, fetch_all_data, get_work_orders, get_schools, _next_request_id


# ============================================
# Request ID Generation
# ============================================


class TestRequestId:
    """Thread-safe request ID counter."""

    def test_increments(self):
        a = _next_request_id()
        b = _next_request_id()
        assert b == a + 1

    def test_returns_int(self):
        assert isinstance(_next_request_id(), int)


# ============================================
# mcp_call — Error Paths
# ============================================


class TestMcpCallErrors:
    """Test mcp_call when the MCP endpoint is empty or unreachable."""

    def test_returns_error_when_endpoint_empty(self):
        with patch.object(mcp_client, "MCP_ENDPOINT", ""):
            result = mcp_call("get_work_orders")
            assert "error" in result
            assert "not configured" in result["error"]

    @patch("mcp_client.requests.post")
    def test_returns_error_on_timeout(self, mock_post):
        import requests as _req
        mock_post.side_effect = _req.Timeout("timed out")
        with patch.object(mcp_client, "MCP_ENDPOINT", "http://fake"):
            result = mcp_call("get_work_orders")
            assert "error" in result

    @patch("mcp_client.requests.post")
    def test_returns_error_on_exception(self, mock_post):
        mock_post.side_effect = ConnectionError("refused")
        with patch.object(mcp_client, "MCP_ENDPOINT", "http://fake"):
            result = mcp_call("get_work_orders")
            assert "error" in result


# ============================================
# mcp_call — Success Path
# ============================================


class TestMcpCallSuccess:

    @patch("mcp_client.requests.post")
    def test_parses_valid_response(self, mock_post):
        mock_resp = MagicMock()
        mock_resp.json.return_value = {
            "jsonrpc": "2.0",
            "id": 1,
            "result": {
                "content": [{"type": "text", "text": '{"work_orders": [{"id": "WO-1"}]}'}]
            },
        }
        mock_post.return_value = mock_resp
        with patch.object(mcp_client, "MCP_ENDPOINT", "http://fake"):
            result = mcp_call("get_work_orders")
            assert "work_orders" in result
            assert result["work_orders"][0]["id"] == "WO-1"

    @patch("mcp_client.requests.post")
    def test_handles_jsonrpc_error(self, mock_post):
        mock_resp = MagicMock()
        mock_resp.json.return_value = {
            "jsonrpc": "2.0",
            "id": 1,
            "error": {"code": -32600, "message": "Invalid request"},
        }
        mock_post.return_value = mock_resp
        with patch.object(mcp_client, "MCP_ENDPOINT", "http://fake"):
            result = mcp_call("get_work_orders")
            assert "error" in result
            assert "Invalid request" in result["error"]

    @patch("mcp_client.requests.post")
    def test_sends_correct_jsonrpc_payload(self, mock_post):
        mock_resp = MagicMock()
        mock_resp.json.return_value = {
            "jsonrpc": "2.0", "id": 1,
            "result": {"content": [{"type": "text", "text": "{}"}]},
        }
        mock_post.return_value = mock_resp
        with patch.object(mcp_client, "MCP_ENDPOINT", "http://fake"):
            mcp_call("get_schools", {"limit": 10})
            call_args = mock_post.call_args
            body = call_args.kwargs.get("json") or call_args[1].get("json")
            assert body["jsonrpc"] == "2.0"
            assert body["method"] == "tools/call"
            assert body["params"]["name"] == "get_schools"
            assert body["params"]["arguments"] == {"limit": 10}


# ============================================
# Convenience Helpers
# ============================================


class TestGetWorkOrders:

    @patch("mcp_client.mcp_call")
    def test_extracts_work_orders_key(self, mock_call):
        mock_call.return_value = {"work_orders": [{"id": "WO-1"}, {"id": "WO-2"}]}
        result = get_work_orders()
        assert len(result) == 2

    @patch("mcp_client.mcp_call")
    def test_returns_empty_on_error(self, mock_call):
        mock_call.return_value = {"error": "fail"}
        result = get_work_orders()
        assert result == []

    @patch("mcp_client.mcp_call")
    def test_handles_list_response(self, mock_call):
        mock_call.return_value = [{"id": "WO-1"}]
        result = get_work_orders()
        assert len(result) == 1


class TestGetSchools:

    @patch("mcp_client.mcp_call")
    def test_extracts_schools_key(self, mock_call):
        mock_call.return_value = {"schools": [{"name": "School A"}]}
        result = get_schools()
        assert len(result) == 1

    @patch("mcp_client.mcp_call")
    def test_handles_list_response(self, mock_call):
        mock_call.return_value = [{"name": "School B"}]
        result = get_schools()
        assert len(result) == 1


class TestFetchAllData:

    @patch("mcp_client.mcp_call")
    def test_fetches_all_four_tools(self, mock_call):
        mock_call.return_value = {"data": []}
        result = fetch_all_data()
        assert mock_call.call_count == 4
        assert "get_work_orders" in result
        assert "get_potholes" in result
        assert "get_sidewalk_issues" in result
        assert "get_schools" in result
