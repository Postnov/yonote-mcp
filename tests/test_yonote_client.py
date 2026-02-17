import json
from unittest.mock import patch, MagicMock
import pytest
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from yonote_client import YonoteClient
from ai_agent import AIAgent


@pytest.fixture
def client():
    return YonoteClient("test-token", "https://app.yonote.ru/api")


@pytest.fixture
def mock_response():
    def _make(data, status=200):
        resp = MagicMock()
        resp.status_code = status
        resp.json.return_value = data
        resp.raise_for_status.return_value = None
        return resp
    return _make


class TestYonoteClientInit:
    def test_init_default_url(self):
        c = YonoteClient("my-token")
        assert c.api_token == "my-token"
        assert c.base_url == "https://app.yonote.ru/api"
        assert c.headers["Authorization"] == "Bearer my-token"

    def test_init_custom_url(self):
        c = YonoteClient("tok", "https://custom.yonote.ru/api/")
        assert c.base_url == "https://custom.yonote.ru/api"

    def test_headers(self, client):
        assert client.headers["Content-Type"] == "application/json"
        assert client.headers["Accept"] == "application/json"
        assert client.headers["Authorization"] == "Bearer test-token"

    def test_workspace_url_cached(self, client):
        assert client._workspace_url is None

    def test_full_url_with_http(self, client):
        client._workspace_url = "https://test.yonote.ru"
        assert client.full_url("https://already.full.url/doc") == "https://already.full.url/doc"

    def test_full_url_relative(self, client):
        client._workspace_url = "https://test.yonote.ru"
        assert client.full_url("/doc/my-doc-123") == "https://test.yonote.ru/doc/my-doc-123"

    def test_full_url_empty(self, client):
        client._workspace_url = "https://test.yonote.ru"
        assert client.full_url("") == ""

    @patch("yonote_client.requests.post")
    def test_get_workspace_url(self, mock_post, client, mock_response):
        mock_post.return_value = mock_response({"data": {"team": {"url": "https://myteam.yonote.ru"}}})
        url = client.get_workspace_url()
        assert url == "https://myteam.yonote.ru"
        # Second call should be cached
        url2 = client.get_workspace_url()
        assert url2 == "https://myteam.yonote.ru"
        mock_post.assert_called_once()


class TestCollections:
    @patch("yonote_client.requests.post")
    def test_collections_list(self, mock_post, client, mock_response):
        mock_post.return_value = mock_response({"data": [{"id": "c1", "name": "Col1"}]})
        result = client.collections_list(limit=10, offset=0)
        mock_post.assert_called_once_with(
            "https://app.yonote.ru/api/collections.list",
            headers=client.headers,
            json={"limit": 10, "offset": 0},
            timeout=30,
        )
        assert result["data"][0]["name"] == "Col1"

    @patch("yonote_client.requests.post")
    def test_collection_info(self, mock_post, client, mock_response):
        mock_post.return_value = mock_response({"data": {"id": "c1", "name": "Col1"}})
        result = client.collection_info("c1")
        mock_post.assert_called_once()
        assert result["data"]["id"] == "c1"

    @patch("yonote_client.requests.post")
    def test_collection_documents(self, mock_post, client, mock_response):
        mock_post.return_value = mock_response({"data": [{"id": "d1"}]})
        result = client.collection_documents("c1")
        call_args = mock_post.call_args
        assert call_args[1]["json"] == {"id": "c1"}


class TestDocuments:
    @patch("yonote_client.requests.post")
    def test_documents_list(self, mock_post, client, mock_response):
        mock_post.return_value = mock_response({"data": [{"id": "d1", "title": "Doc1"}]})
        result = client.documents_list(limit=5)
        call_json = mock_post.call_args[1]["json"]
        assert call_json["limit"] == 5
        assert "collectionId" not in call_json

    @patch("yonote_client.requests.post")
    def test_documents_list_with_collection(self, mock_post, client, mock_response):
        mock_post.return_value = mock_response({"data": []})
        client.documents_list(collection_id="c1")
        call_json = mock_post.call_args[1]["json"]
        assert call_json["collectionId"] == "c1"

    @patch("yonote_client.requests.post")
    def test_document_info(self, mock_post, client, mock_response):
        mock_post.return_value = mock_response({"data": {"id": "d1", "title": "Doc1", "text": "Content"}})
        result = client.document_info("d1")
        assert result["data"]["title"] == "Doc1"

    @patch("yonote_client.requests.post")
    def test_documents_search(self, mock_post, client, mock_response):
        mock_post.return_value = mock_response({"data": [{"document": {"id": "d1", "title": "Match"}}]})
        result = client.documents_search("test query")
        call_json = mock_post.call_args[1]["json"]
        assert call_json["query"] == "test query"
        assert result["data"][0]["document"]["title"] == "Match"

    @patch("yonote_client.requests.post")
    def test_documents_search_with_collection(self, mock_post, client, mock_response):
        mock_post.return_value = mock_response({"data": []})
        client.documents_search("query", collection_id="c1")
        call_json = mock_post.call_args[1]["json"]
        assert call_json["collectionId"] == "c1"

    @patch("yonote_client.requests.post")
    def test_document_create(self, mock_post, client, mock_response):
        mock_post.return_value = mock_response({"data": {"id": "new1", "title": "New Doc"}})
        result = client.document_create("New Doc", text="# Hello", collection_id="c1")
        call_json = mock_post.call_args[1]["json"]
        assert call_json["title"] == "New Doc"
        assert call_json["text"] == "# Hello"
        assert call_json["collectionId"] == "c1"
        assert call_json["publish"] is True

    @patch("yonote_client.requests.post")
    def test_document_create_minimal(self, mock_post, client, mock_response):
        mock_post.return_value = mock_response({"data": {"id": "new2", "title": "Min"}})
        client.document_create("Min")
        call_json = mock_post.call_args[1]["json"]
        assert "collectionId" not in call_json
        assert "parentDocumentId" not in call_json

    @patch("yonote_client.requests.post")
    def test_document_update(self, mock_post, client, mock_response):
        mock_post.return_value = mock_response({"data": {"id": "d1", "title": "Updated"}})
        client.document_update("d1", title="Updated", text="New content")
        call_json = mock_post.call_args[1]["json"]
        assert call_json["id"] == "d1"
        assert call_json["title"] == "Updated"
        assert call_json["text"] == "New content"

    @patch("yonote_client.requests.post")
    def test_document_update_partial(self, mock_post, client, mock_response):
        mock_post.return_value = mock_response({"data": {"id": "d1"}})
        client.document_update("d1", title="Only title")
        call_json = mock_post.call_args[1]["json"]
        assert "text" not in call_json

    @patch("yonote_client.requests.post")
    def test_document_delete(self, mock_post, client, mock_response):
        mock_post.return_value = mock_response({"success": True})
        client.document_delete("d1")
        call_json = mock_post.call_args[1]["json"]
        assert call_json["id"] == "d1"
        assert call_json["permanent"] is False

    @patch("yonote_client.requests.post")
    def test_document_delete_permanent(self, mock_post, client, mock_response):
        mock_post.return_value = mock_response({"success": True})
        client.document_delete("d1", permanent=True)
        call_json = mock_post.call_args[1]["json"]
        assert call_json["permanent"] is True


class TestNewEndpoints:
    """Test new Yonote client endpoints."""

    @patch("yonote_client.requests.post")
    def test_document_update_append(self, mock_post, client, mock_response):
        mock_post.return_value = mock_response({"data": {"id": "d1", "title": "Doc"}})
        client.document_update("d1", text="new text", append=True)
        call_json = mock_post.call_args[1]["json"]
        assert call_json["append"] is True
        assert call_json["text"] == "new text"

    @patch("yonote_client.requests.post")
    def test_document_move(self, mock_post, client, mock_response):
        mock_post.return_value = mock_response({"data": {"id": "d1"}})
        client.document_move("d1", collection_id="c2")
        call_json = mock_post.call_args[1]["json"]
        assert call_json["id"] == "d1"
        assert call_json["collectionId"] == "c2"

    @patch("yonote_client.requests.post")
    def test_document_archive(self, mock_post, client, mock_response):
        mock_post.return_value = mock_response({"success": True})
        client.document_archive("d1")
        call_json = mock_post.call_args[1]["json"]
        assert call_json["id"] == "d1"

    @patch("yonote_client.requests.post")
    def test_document_restore(self, mock_post, client, mock_response):
        mock_post.return_value = mock_response({"success": True})
        client.document_restore("d1")
        call_json = mock_post.call_args[1]["json"]
        assert call_json["id"] == "d1"

    @patch("yonote_client.requests.post")
    def test_documents_drafts(self, mock_post, client, mock_response):
        mock_post.return_value = mock_response({"data": [{"id": "d1", "title": "Draft"}]})
        result = client.documents_drafts()
        assert result["data"][0]["title"] == "Draft"

    @patch("yonote_client.requests.post")
    def test_documents_viewed(self, mock_post, client, mock_response):
        mock_post.return_value = mock_response({"data": [{"id": "d1"}]})
        result = client.documents_viewed()
        assert len(result["data"]) == 1

    @patch("yonote_client.requests.post")
    def test_collection_create(self, mock_post, client, mock_response):
        mock_post.return_value = mock_response({"data": {"id": "c1", "name": "New Col"}})
        result = client.collection_create("New Col", description="Test")
        call_json = mock_post.call_args[1]["json"]
        assert call_json["name"] == "New Col"
        assert call_json["description"] == "Test"

    @patch("yonote_client.requests.post")
    def test_collection_delete(self, mock_post, client, mock_response):
        mock_post.return_value = mock_response({"success": True})
        client.collection_delete("c1")
        call_json = mock_post.call_args[1]["json"]
        assert call_json["id"] == "c1"


class TestNewExecuteTools:
    """Test new execute_tool handlers."""

    def setup_method(self):
        from app import execute_tool
        self.execute_tool = execute_tool

    @patch("app.yonote")
    def test_move_document(self, mock_yonote):
        mock_yonote.document_move.return_value = {"data": {"id": "d1", "title": "Moved", "url": "/doc/d1"}}
        result = self.execute_tool("move_document", {"document_id": "d1", "collection_id": "c2"})
        assert result["result"]["document"]["title"] == "Moved"

    @patch("app.yonote")
    def test_archive_document(self, mock_yonote):
        mock_yonote.document_archive.return_value = {"success": True}
        result = self.execute_tool("archive_document", {"document_id": "d1"})
        assert result["result"]["archived"] is True

    @patch("app.yonote")
    def test_restore_document(self, mock_yonote):
        mock_yonote.document_restore.return_value = {"success": True}
        result = self.execute_tool("restore_document", {"document_id": "d1"})
        assert result["result"]["restored"] is True

    @patch("app.yonote")
    def test_list_drafts(self, mock_yonote):
        mock_yonote.documents_drafts.return_value = {"data": [{"id": "d1", "title": "Draft", "url": "/doc/d1"}]}
        result = self.execute_tool("list_drafts", {})
        assert result["result"]["count"] == 1

    @patch("app.yonote")
    def test_list_viewed(self, mock_yonote):
        mock_yonote.documents_viewed.return_value = {"data": [{"id": "d1", "title": "Recent", "url": "/doc/d1"}]}
        result = self.execute_tool("list_viewed", {})
        assert result["result"]["count"] == 1

    @patch("app.yonote")
    def test_create_collection(self, mock_yonote):
        mock_yonote.collection_create.return_value = {"data": {"id": "c1", "name": "New"}}
        result = self.execute_tool("create_collection", {"name": "New"})
        assert result["result"]["collection"]["name"] == "New"

    @patch("app.yonote")
    def test_delete_collection(self, mock_yonote):
        mock_yonote.collection_delete.return_value = {"success": True}
        result = self.execute_tool("delete_collection", {"collection_id": "c1"})
        assert result["result"]["deleted"] is True


class TestAIAgent:
    def test_init(self):
        agent = AIAgent("test-key")
        assert agent.api_key == "test-key"
        assert agent.model == "deepseek-chat"
        assert agent.conversation_history == []

    def test_reset(self):
        agent = AIAgent("test-key")
        agent.conversation_history = [{"role": "user", "content": "hello"}]
        agent.reset()
        assert agent.conversation_history == []

    def test_parse_response_valid_json(self):
        agent = AIAgent("test-key")
        result = agent._parse_response('{"thinking": "test", "actions": [], "response_template": "ok"}')
        assert result["thinking"] == "test"
        assert result["actions"] == []
        assert result["response_template"] == "ok"

    def test_parse_response_json_in_code_block(self):
        agent = AIAgent("test-key")
        result = agent._parse_response('```json\n{"thinking": "t", "actions": [], "response_template": "r"}\n```')
        assert result["thinking"] == "t"
        assert result["response_template"] == "r"

    def test_parse_response_plain_text(self):
        agent = AIAgent("test-key")
        result = agent._parse_response("Just a plain text response")
        assert result["actions"] == []
        assert result["response_template"] == "Just a plain text response"

    def test_add_context(self):
        agent = AIAgent("test-key")
        agent.add_context("user", "test context")
        assert len(agent.conversation_history) == 1
        assert agent.conversation_history[0]["content"] == "test context"

    @patch("ai_agent.requests.post")
    def test_process_message(self, mock_post):
        resp = MagicMock()
        resp.json.return_value = {
            "choices": [{"message": {"content": '{"thinking": "need to search", "actions": [{"tool": "search", "params": {"query": "test"}}], "response_template": "Found results"}'}}]
        }
        resp.raise_for_status.return_value = None
        mock_post.return_value = resp

        agent = AIAgent("test-key")
        result = agent.process_message("find test documents")

        assert result["thinking"] == "need to search"
        assert len(result["actions"]) == 1
        assert result["actions"][0]["tool"] == "search"
        assert len(agent.conversation_history) == 2  # user + assistant


class TestExecuteTool:
    """Test execute_tool function from app.py."""

    def setup_method(self):
        from app import execute_tool
        self.execute_tool = execute_tool

    @patch("app.yonote")
    def test_search(self, mock_yonote):
        mock_yonote.documents_search.return_value = {
            "data": [{"document": {"id": "d1", "title": "Doc1", "text": "content", "url": "/doc/d1"}}]
        }
        result = self.execute_tool("search", {"query": "test"})
        assert len(result["events"]) == 1
        assert result["result"]["count"] == 1
        assert result["result"]["documents"][0]["title"] == "Doc1"

    @patch("app.yonote")
    def test_list_collections(self, mock_yonote):
        mock_yonote.collections_list.return_value = {
            "data": [{"id": "c1", "name": "Col1"}, {"id": "c2", "name": "Col2"}]
        }
        result = self.execute_tool("list_collections", {})
        assert result["result"]["count"] == 2
        assert result["result"]["collections"][0]["name"] == "Col1"

    @patch("app.yonote")
    def test_create_document(self, mock_yonote):
        mock_yonote.document_create.return_value = {
            "data": {"id": "new1", "title": "New Page", "url": "/doc/new1"}
        }
        result = self.execute_tool("create_document", {"title": "New Page", "text": "# Content"})
        assert result["result"]["document"]["title"] == "New Page"
        assert len(result["events"]) == 2

    @patch("app.yonote")
    def test_update_document(self, mock_yonote):
        mock_yonote.document_update.return_value = {
            "data": {"id": "d1", "title": "Updated", "url": "/doc/d1"}
        }
        result = self.execute_tool("update_document", {"document_id": "d1", "title": "Updated"})
        assert result["result"]["document"]["title"] == "Updated"

    @patch("app.yonote")
    def test_delete_document(self, mock_yonote):
        mock_yonote.document_delete.return_value = {"success": True}
        result = self.execute_tool("delete_document", {"document_id": "d1"})
        assert result["result"]["deleted"] is True

    def test_unknown_tool(self):
        result = self.execute_tool("unknown_tool", {})
        assert "error" in result["result"]


class TestPendingActions:
    """Test pending_actions confirmation flow."""

    def setup_method(self):
        from app import app, pending_actions_store
        self.app = app
        self.client = app.test_client()
        self.pending_actions_store = pending_actions_store

    def test_pending_actions_store_initially_empty(self):
        assert self.pending_actions_store["actions"] is None

    def test_confirm_no_pending_actions(self):
        self.pending_actions_store["actions"] = None
        resp = self.client.post("/api/confirm", content_type="application/json")
        assert resp.status_code == 400
        data = resp.get_json()
        assert "error" in data

    @patch("app.yonote")
    @patch("app.agent")
    def test_confirm_executes_pending_actions(self, mock_agent, mock_yonote):
        mock_yonote.document_create.return_value = {
            "data": {"id": "new1", "title": "Test Page", "url": "/doc/new1"}
        }
        mock_yonote.collections_list.return_value = {
            "data": [{"id": "c1"}]
        }
        self.pending_actions_store["actions"] = [
            {"tool": "create_document", "params": {"title": "Test Page", "text": "# Hello"}}
        ]
        resp = self.client.post("/api/confirm", content_type="application/json")
        assert resp.status_code == 200
        # After execution, pending actions should be cleared
        assert self.pending_actions_store["actions"] is None

    def test_reset_clears_pending_actions(self):
        self.pending_actions_store["actions"] = [{"tool": "search", "params": {}}]
        self.client.post("/api/reset", content_type="application/json")
        assert self.pending_actions_store["actions"] is None


class TestChatPendingActions:
    """Test that /api/chat correctly handles AI responses with pending_actions."""

    def setup_method(self):
        from app import app, pending_actions_store
        self.app = app
        self.client = app.test_client()
        self.pending_actions_store = pending_actions_store

    @patch("app.agent")
    def test_chat_stores_pending_actions(self, mock_agent):
        mock_agent.process_message.return_value = {
            "thinking": "need to create doc",
            "actions": [],
            "pending_actions": [{"tool": "create_document", "params": {"title": "New"}}],
            "response_template": "Создать страницу «New»?"
        }
        resp = self.client.post("/api/chat",
            json={"message": "Создай страницу New"},
            content_type="application/json"
        )
        assert resp.status_code == 200
        # Consume the streamed response to trigger the generator
        _ = resp.data
        # Check that pending actions were stored
        assert self.pending_actions_store["actions"] is not None
        assert self.pending_actions_store["actions"][0]["tool"] == "create_document"

    @patch("app.yonote")
    @patch("app.agent")
    def test_chat_agentic_loop_read_then_respond(self, mock_agent, mock_yonote):
        """Test that after read actions, AI is called again and can respond."""
        mock_agent.process_message.side_effect = [
            {
                "thinking": "searching",
                "actions": [{"tool": "search", "params": {"query": "test"}}],
                "response_template": "Ищу..."
            },
            {
                "thinking": "got results, done",
                "actions": [],
                "response_template": "Вот что нашлось:"
            },
        ]
        mock_agent.add_context = MagicMock()
        mock_yonote.documents_search.return_value = {"data": []}

        resp = self.client.post("/api/chat",
            json={"message": "Найди test"},
            content_type="application/json"
        )
        assert resp.status_code == 200
        _ = resp.data
        # AI should have been called twice (initial + after results)
        assert mock_agent.process_message.call_count == 2

    @patch("app.yonote")
    @patch("app.agent")
    def test_chat_agentic_loop_read_then_pending(self, mock_agent, mock_yonote):
        """Test multi-step: read doc, then propose creation with content."""
        mock_agent.process_message.side_effect = [
            {
                "thinking": "need to read the document first",
                "actions": [{"tool": "document_info", "params": {"document_id": "d1"}}],
                "response_template": "Читаю документ..."
            },
            {
                "thinking": "got content, propose translated creation",
                "actions": [],
                "pending_actions": [{"tool": "create_document", "params": {"title": "Translated", "text": "# Hello"}}],
                "response_template": "Создать переведённую страницу?"
            },
        ]
        mock_agent.add_context = MagicMock()
        mock_yonote.document_info.return_value = {"data": {"id": "d1", "title": "Оригинал", "text": "# Привет", "url": "/doc/d1"}}

        from app import pending_actions_store
        resp = self.client.post("/api/chat",
            json={"message": "Переведи документ d1"},
            content_type="application/json"
        )
        assert resp.status_code == 200
        _ = resp.data
        # Pending actions should be stored for confirmation
        assert pending_actions_store["actions"] is not None
        assert pending_actions_store["actions"][0]["params"]["title"] == "Translated"


class TestFormatTextForYonote:
    """Test format_text_for_yonote post-processing."""

    def setup_method(self):
        from app import format_text_for_yonote
        self.format = format_text_for_yonote

    def test_none_input(self):
        assert self.format(None) is None

    def test_empty_string(self):
        assert self.format("") == ""

    def test_text_without_urls(self):
        text = "Обычный текст без ссылок"
        assert self.format(text) == text

    def test_single_url_not_changed(self):
        text = "Вот ссылка: https://example.com"
        assert self.format(text) == text

    def test_multiple_urls_on_one_line_split_into_list(self):
        text = "Найдены ссылки: https://disk.yandex.ru/i/abc123 https://disk.yandex.ru/i/def456 https://disk.yandex.ru/i/ghi789"
        result = self.format(text)
        assert "- [https://disk.yandex.ru/i/abc123](https://disk.yandex.ru/i/abc123)" in result
        assert "- [https://disk.yandex.ru/i/def456](https://disk.yandex.ru/i/def456)" in result
        assert "- [https://disk.yandex.ru/i/ghi789](https://disk.yandex.ru/i/ghi789)" in result

    def test_preserves_already_formatted_list(self):
        text = "Ссылки:\n\n- [https://a.com](https://a.com)\n- [https://b.com](https://b.com)"
        assert self.format(text) == text

    def test_preserves_markdown_structure(self):
        text = "# Заголовок\n\nОбычный текст\n\n- Пункт 1\n- Пункт 2"
        assert self.format(text) == text

    def test_trailing_text_preserved(self):
        text = "https://a.com https://b.com Всего: 2 ссылки."
        result = self.format(text)
        assert "Всего: 2 ссылки." in result

    def test_mixed_content(self):
        text = "# Ссылки\n\nНашёл:\nhttps://a.com https://b.com https://c.com\n\nГотово!"
        result = self.format(text)
        assert "# Ссылки" in result
        assert "Готово!" in result
        assert "- [https://a.com](https://a.com)" in result


class TestBuildResponse:
    def setup_method(self):
        from app import build_response
        self.build_response = build_response

    def test_with_documents(self):
        results = [{"tool": "search", "result": {"documents": [{"id": "d1"}], "count": 1}}]
        combined = self.build_response(results, "Found docs")
        assert combined["message"] == "Found docs"
        assert combined["documents"][0]["id"] == "d1"

    def test_with_collections(self):
        results = [{"tool": "list_collections", "result": {"collections": [{"id": "c1", "name": "Col"}], "count": 1}}]
        combined = self.build_response(results, "Collections")
        assert combined["collections"][0]["name"] == "Col"

    def test_empty_results(self):
        combined = self.build_response([], "No results")
        assert combined["message"] == "No results"
        assert "documents" not in combined

    def test_cleans_result_placeholder(self):
        combined = self.build_response([], "Вот что нашлось: {result}")
        assert "{result}" not in combined["message"]
        assert combined["message"] == "Вот что нашлось:"

    def test_only_placeholder_becomes_default(self):
        combined = self.build_response([], "{result}")
        assert combined["message"] == "Готово!"
