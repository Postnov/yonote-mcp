import sys
import os
import json
from unittest.mock import patch, MagicMock
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import extract_section_from_text, sse_event


# --- Real Yonote-style text samples ---

YONOTE_ROOM_TEXT = """Геометрия

Стык через метал профиль
Никаких треков, светильники утоплены в цвет потолка, умеренно тёплый свет одного тона

Свет

Светло
Мягко
Скрыта неидеальность
Прибавляет аппетитности

Цвет

Бежевые, пастельные, тёплые оттенки
Может быть контраст небольшим акцентом, например, диван"""

YONOTE_ROOM_WITH_MARKDOWN = """## Геометрия

Стык через метал профиль

## Свет

- Светло
- Мягко
- Скрыта неидеальность

## Цвет

Бежевые, пастельные"""


class TestExtractSectionFromText:
    """Tests for extract_section_from_text()."""

    def test_returns_none_for_empty_text(self):
        assert extract_section_from_text("", "Свет") is None
        assert extract_section_from_text(None, "Свет") is None

    def test_returns_none_for_empty_heading(self):
        assert extract_section_from_text("Some text", "") is None
        assert extract_section_from_text("Some text", None) is None

    def test_returns_none_when_heading_not_found(self):
        assert extract_section_from_text(YONOTE_ROOM_TEXT, "Мебель") is None

    def test_extracts_middle_section_plain_text(self):
        result = extract_section_from_text(YONOTE_ROOM_TEXT, "Свет")
        assert result is not None
        assert "Светло" in result
        assert "Мягко" in result
        assert "Скрыта неидеальность" in result
        assert "Прибавляет аппетитности" in result
        # Should NOT include content from other sections
        assert "Бежевые" not in result
        assert "Стык через метал профиль" not in result

    def test_extracts_first_section_plain_text(self):
        result = extract_section_from_text(YONOTE_ROOM_TEXT, "Геометрия")
        assert result is not None
        assert "Стык через метал профиль" in result
        assert "Светло" not in result

    def test_extracts_last_section_plain_text(self):
        result = extract_section_from_text(YONOTE_ROOM_TEXT, "Цвет")
        assert result is not None
        assert "Бежевые" in result
        assert "Прибавляет аппетитности" not in result

    def test_extracts_section_markdown_headings(self):
        result = extract_section_from_text(YONOTE_ROOM_WITH_MARKDOWN, "Свет")
        assert result is not None
        assert "Светло" in result
        assert "Мягко" in result
        assert "Бежевые" not in result

    def test_case_insensitive_matching(self):
        result = extract_section_from_text(YONOTE_ROOM_TEXT, "свет")
        assert result is not None
        assert "Светло" in result

    def test_case_insensitive_uppercase(self):
        result = extract_section_from_text(YONOTE_ROOM_TEXT, "СВЕТ")
        assert result is not None
        assert "Светло" in result

    def test_extracts_from_markdown_with_list_items(self):
        result = extract_section_from_text(YONOTE_ROOM_WITH_MARKDOWN, "Свет")
        assert "- Светло" in result
        assert "- Мягко" in result

    def test_single_section_document(self):
        text = """Свет

Яркий, тёплый
Диммируемый"""
        result = extract_section_from_text(text, "Свет")
        assert result is not None
        assert "Яркий, тёплый" in result
        assert "Диммируемый" in result

    def test_heading_with_markdown_prefix(self):
        text = """## Свет

Рассеянный
Тёплый

## Цвет

Белый"""
        result = extract_section_from_text(text, "Свет")
        assert "Рассеянный" in result
        assert "Тёплый" in result
        assert "Белый" not in result

    def test_heading_h3_prefix(self):
        text = """### Свет

Рассеянный
Тёплый

### Цвет

Белый"""
        result = extract_section_from_text(text, "Свет")
        assert "Рассеянный" in result
        assert "Белый" not in result

    def test_returns_none_for_empty_section(self):
        text = """Свет

Цвет

Бежевый"""
        result = extract_section_from_text(text, "Свет")
        # Section between "Свет" and "Цвет" is just an empty line
        assert result is None

    def test_multiple_rooms_realistic(self):
        """Simulate extracting 'Свет' from multiple room documents."""
        rooms = {
            "1 этаж, Гости": """Геометрия

Открытая планировка

Свет

Светло
Мягко

Цвет

Бежевый""",
            "2 этаж, Спальня": """Геометрия

Минимализм

Свет

Диммеры
Прикроватные лампы
Тёплый свет

Цвет

Серый""",
            "Кухня": """Геометрия

Островная

Мебель

Встроенная техника""",
        }

        results = {}
        for title, text in rooms.items():
            section = extract_section_from_text(text, "Свет")
            if section:
                results[title] = section

        assert len(results) == 2
        assert "1 этаж, Гости" in results
        assert "2 этаж, Спальня" in results
        assert "Кухня" not in results  # No "Свет" section

        assert "Светло" in results["1 этаж, Гости"]
        assert "Диммеры" in results["2 этаж, Спальня"]


class TestExtractSectionsStreaming:
    """Tests for execute_extract_sections_streaming() generator."""

    @patch("app.yonote")
    def test_no_children_returns_message(self, mock_yonote):
        mock_yonote.documents_list.return_value = {"data": []}

        from app import execute_extract_sections_streaming

        events = list(execute_extract_sections_streaming({
            "parent_document_id": "parent-1",
            "heading": "Свет",
        }))

        # Should have status event + result dict
        result_items = [e for e in events if isinstance(e, dict)]
        assert len(result_items) == 1
        assert "не найдено" in result_items[0]["_result"]["message"]

    @patch("app.yonote")
    def test_extracts_and_creates_report(self, mock_yonote):
        # Mock: 2 child documents (leaf nodes), one has "Свет" section, one doesn't
        # documents_list calls: parent -> 2 children, child-1 -> 0, child-2 -> 0
        mock_yonote.documents_list.side_effect = [
            {"data": [{"id": "child-1", "title": "Гости"}, {"id": "child-2", "title": "Кухня"}]},
            {"data": []},  # child-1 has no children
            {"data": []},  # child-2 has no children
        ]
        mock_yonote.document_info.side_effect = [
            {"data": {"id": "child-1", "title": "Гости", "text": "Свет\n\nСветло\nМягко\n\nЦвет\n\nБелый"}},
            {"data": {"id": "child-2", "title": "Кухня", "text": "Мебель\n\nВстроенная"}},
        ]
        mock_yonote.collections_list.return_value = {"data": [{"id": "col-1"}]}
        mock_yonote.document_create.return_value = {"data": {
            "id": "report-1",
            "title": "Отчет по свету",
            "url": "/doc/report-1",
        }}
        mock_yonote.full_url.return_value = "https://example.yonote.ru/doc/report-1"

        from app import execute_extract_sections_streaming

        events = list(execute_extract_sections_streaming({
            "parent_document_id": "parent-1",
            "heading": "Свет",
            "output_title": "Отчет по свету",
        }))

        # Check that document_create was called with compiled text
        mock_yonote.document_create.assert_called_once()
        call_kwargs = mock_yonote.document_create.call_args
        created_text = call_kwargs.kwargs.get("text") or call_kwargs[1].get("text", "")
        assert "## Гости" in created_text
        assert "Светло" in created_text
        assert "Мягко" in created_text
        # "Кухня" should NOT be in the report (no "Свет" section)
        assert "## Кухня" not in created_text

        # Check final result
        result_items = [e for e in events if isinstance(e, dict)]
        assert len(result_items) == 1
        result = result_items[0]["_result"]
        assert result["sections_found"] == 1
        assert result["total_children"] == 2
        assert result["document"]["id"] == "report-1"

    @patch("app.yonote")
    def test_no_sections_found_returns_message(self, mock_yonote):
        # documents_list: parent -> 1 child, child-1 -> 0
        mock_yonote.documents_list.side_effect = [
            {"data": [{"id": "child-1", "title": "Гости"}]},
            {"data": []},  # child-1 has no children
        ]
        mock_yonote.document_info.return_value = {
            "data": {"id": "child-1", "title": "Гости", "text": "Мебель\n\nСтолы и стулья"}
        }

        from app import execute_extract_sections_streaming

        events = list(execute_extract_sections_streaming({
            "parent_document_id": "parent-1",
            "heading": "Свет",
        }))

        result_items = [e for e in events if isinstance(e, dict)]
        assert len(result_items) == 1
        assert "не найдена" in result_items[0]["_result"]["message"]

    @patch("app.yonote")
    def test_emits_progress_status_events(self, mock_yonote):
        # documents_list: parent -> 2 children (leaves)
        mock_yonote.documents_list.side_effect = [
            {"data": [{"id": "child-1", "title": "Гости"}, {"id": "child-2", "title": "Спальня"}]},
            {"data": []},
            {"data": []},
        ]
        mock_yonote.document_info.side_effect = [
            {"data": {"id": "child-1", "title": "Гости", "text": "Свет\n\nСветло\nМягко\nТёплый тон"}},
            {"data": {"id": "child-2", "title": "Спальня", "text": "Свет\n\nТёмно\nДиммеры\nПрикроватные"}},
        ]
        mock_yonote.collections_list.return_value = {"data": [{"id": "col-1"}]}
        mock_yonote.document_create.return_value = {"data": {"id": "r", "title": "t", "url": "/r"}}
        mock_yonote.full_url.return_value = "https://x.yonote.ru/r"

        from app import execute_extract_sections_streaming

        events = list(execute_extract_sections_streaming({
            "parent_document_id": "parent-1",
            "heading": "Свет",
        }))

        # Collect SSE status events (strings)
        sse_events = [e for e in events if isinstance(e, str)]
        sse_text = " ".join(sse_events)

        assert "Загружаю дочерние страницы" in sse_text
        assert "Гости" in sse_text
        assert "Спальня" in sse_text
        assert "Найдено" in sse_text
        assert "Создаю страницу" in sse_text

    @patch("app.yonote")
    def test_recursive_deep_nesting(self, mock_yonote):
        """Test that extract_sections traverses ALL levels of nesting.

        Structure: Авгодом -> Интерьер -> Гости (has "Свет")
                           -> Экстерьер (no "Свет")
        """
        mock_yonote.documents_list.side_effect = [
            # Parent -> 2 children
            {"data": [
                {"id": "interior", "title": "Интерьер"},
                {"id": "exterior", "title": "Экстерьер"},
            ]},
            # "Интерьер" -> 1 grandchild
            {"data": [{"id": "guests", "title": "1 этаж, Гости"}]},
            # "Экстерьер" -> 0 children
            {"data": []},
            # "1 этаж, Гости" -> 0 children
            {"data": []},
        ]
        mock_yonote.document_info.side_effect = [
            # Reading "Интерьер" — no "Свет" section
            {"data": {"id": "interior", "title": "Интерьер", "text": "Общая информация\n\nПланировка"}},
            # Reading "Экстерьер" — no "Свет" section
            {"data": {"id": "exterior", "title": "Экстерьер", "text": "Фасад\n\nКирпич\n\nКровля\n\nМеталл"}},
            # Reading "1 этаж, Гости" — HAS "Свет" section
            {"data": {"id": "guests", "title": "1 этаж, Гости", "text": "Геометрия\n\nОткрытая планировка\n\nСвет\n\nСветло\nМягко\nТёплый тон\n\nЦвет\n\nБежевый"}},
        ]
        mock_yonote.collections_list.return_value = {"data": [{"id": "col-1"}]}
        mock_yonote.document_create.return_value = {"data": {
            "id": "report-1", "title": "Отчет по свету", "url": "/doc/report-1",
        }}
        mock_yonote.full_url.return_value = "https://example.yonote.ru/doc/report-1"

        from app import execute_extract_sections_streaming

        events = list(execute_extract_sections_streaming({
            "parent_document_id": "avgdom",
            "heading": "Свет",
            "output_title": "Отчет по свету",
        }))

        # Should find "Свет" in the grandchild "1 этаж, Гости"
        mock_yonote.document_create.assert_called_once()
        call_kwargs = mock_yonote.document_create.call_args
        created_text = call_kwargs.kwargs.get("text") or call_kwargs[1].get("text", "")
        assert "## 1 этаж, Гости" in created_text
        assert "Светло" in created_text
        assert "Мягко" in created_text

        result_items = [e for e in events if isinstance(e, dict)]
        result = result_items[0]["_result"]
        assert result["sections_found"] == 1
        assert result["total_children"] == 3  # interior + exterior + guests

    @patch("app.yonote")
    def test_recursive_three_levels_deep(self, mock_yonote):
        """Test 3 levels: parent -> child -> grandchild -> great-grandchild."""
        mock_yonote.documents_list.side_effect = [
            {"data": [{"id": "level1", "title": "Уровень 1"}]},       # parent -> 1 child
            {"data": [{"id": "level2", "title": "Уровень 2"}]},       # level1 -> 1 grandchild
            {"data": [{"id": "level3", "title": "Уровень 3"}]},       # level2 -> 1 great-grandchild
            {"data": []},                                                # level3 -> no children
        ]
        mock_yonote.document_info.side_effect = [
            {"data": {"id": "level1", "title": "Уровень 1", "text": "Описание\n\nТекст"}},
            {"data": {"id": "level2", "title": "Уровень 2", "text": "Описание\n\nТекст"}},
            {"data": {"id": "level3", "title": "Уровень 3", "text": "Свет\n\nДиммеры\nТочечный свет\n\nЦвет\n\nСерый"}},
        ]
        mock_yonote.collections_list.return_value = {"data": [{"id": "col-1"}]}
        mock_yonote.document_create.return_value = {"data": {"id": "r", "title": "t", "url": "/r"}}
        mock_yonote.full_url.return_value = "https://x.yonote.ru/r"

        from app import execute_extract_sections_streaming

        events = list(execute_extract_sections_streaming({
            "parent_document_id": "root",
            "heading": "Свет",
        }))

        # Only the great-grandchild has "Свет"
        mock_yonote.document_create.assert_called_once()
        call_kwargs = mock_yonote.document_create.call_args
        created_text = call_kwargs.kwargs.get("text") or call_kwargs[1].get("text", "")
        assert "## Уровень 3" in created_text
        assert "Диммеры" in created_text

        result_items = [e for e in events if isinstance(e, dict)]
        result = result_items[0]["_result"]
        assert result["sections_found"] == 1
        assert result["total_children"] == 3  # all 3 descendants

    @patch("app.yonote")
    def test_recursive_multiple_branches_with_sections(self, mock_yonote):
        """Test multiple branches at different depths all contributing sections."""
        mock_yonote.documents_list.side_effect = [
            # Root -> 2 branches
            {"data": [
                {"id": "branch-a", "title": "Ветка А"},
                {"id": "branch-b", "title": "Ветка Б"},
            ]},
            # branch-a -> 1 child with "Свет"
            {"data": [{"id": "leaf-a1", "title": "Комната А1"}]},
            # branch-b -> 1 child with "Свет"
            {"data": [{"id": "leaf-b1", "title": "Комната Б1"}]},
            # leaf-a1 -> 0
            {"data": []},
            # leaf-b1 -> 0
            {"data": []},
        ]
        mock_yonote.document_info.side_effect = [
            {"data": {"id": "branch-a", "title": "Ветка А", "text": "Навигация\n\nСодержание"}},
            {"data": {"id": "branch-b", "title": "Ветка Б", "text": "Свет\n\nВерхний свет в коридоре\nТочечные\n\nЦвет\n\nБелый"}},
            {"data": {"id": "leaf-a1", "title": "Комната А1", "text": "Свет\n\nЛюстра\nБра\nТёплый тон\n\nЦвет\n\nБежевый"}},
            {"data": {"id": "leaf-b1", "title": "Комната Б1", "text": "Свет\n\nСпоты\nДиммер\n\nЦвет\n\nСерый"}},
        ]
        mock_yonote.collections_list.return_value = {"data": [{"id": "col-1"}]}
        mock_yonote.document_create.return_value = {"data": {"id": "r", "title": "t", "url": "/r"}}
        mock_yonote.full_url.return_value = "https://x.yonote.ru/r"

        from app import execute_extract_sections_streaming

        events = list(execute_extract_sections_streaming({
            "parent_document_id": "root",
            "heading": "Свет",
        }))

        mock_yonote.document_create.assert_called_once()
        call_kwargs = mock_yonote.document_create.call_args
        created_text = call_kwargs.kwargs.get("text") or call_kwargs[1].get("text", "")

        # Sections from branch-b, leaf-a1, and leaf-b1 should all be present
        assert "## Ветка Б" in created_text
        assert "Верхний свет в коридоре" in created_text
        assert "## Комната А1" in created_text
        assert "Люстра" in created_text
        assert "## Комната Б1" in created_text
        assert "Споты" in created_text

        result_items = [e for e in events if isinstance(e, dict)]
        result = result_items[0]["_result"]
        assert result["sections_found"] == 3


class TestFetchAllDescendants:
    """Tests for fetch_all_descendants() recursive function."""

    @patch("app.yonote")
    def test_no_children(self, mock_yonote):
        mock_yonote.documents_list.return_value = {"data": []}

        from app import fetch_all_descendants
        result = fetch_all_descendants("parent-1")
        assert result == []

    @patch("app.yonote")
    def test_flat_children(self, mock_yonote):
        mock_yonote.documents_list.side_effect = [
            {"data": [{"id": "c1", "title": "A"}, {"id": "c2", "title": "B"}]},
            {"data": []},
            {"data": []},
        ]

        from app import fetch_all_descendants
        result = fetch_all_descendants("parent-1")
        assert len(result) == 2
        assert result[0]["id"] == "c1"
        assert result[1]["id"] == "c2"

    @patch("app.yonote")
    def test_deep_nesting(self, mock_yonote):
        mock_yonote.documents_list.side_effect = [
            {"data": [{"id": "c1", "title": "L1"}]},
            {"data": [{"id": "c2", "title": "L2"}]},
            {"data": [{"id": "c3", "title": "L3"}]},
            {"data": []},
        ]

        from app import fetch_all_descendants
        result = fetch_all_descendants("root")
        assert len(result) == 3
        assert [p["id"] for p in result] == ["c1", "c2", "c3"]

    @patch("app.yonote")
    def test_api_error_skips_branch(self, mock_yonote):
        """If API fails for a child, skip it and continue."""
        mock_yonote.documents_list.side_effect = [
            {"data": [{"id": "c1", "title": "OK"}, {"id": "c2", "title": "Fail"}]},
            {"data": []},  # c1 -> no children
            Exception("API error"),  # c2 -> fails
        ]

        from app import fetch_all_descendants
        result = fetch_all_descendants("root")
        assert len(result) == 2  # Both are collected, but c2's children are skipped
        assert result[0]["id"] == "c1"
        assert result[1]["id"] == "c2"
