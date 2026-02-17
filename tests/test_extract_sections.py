import sys
import os
import json
from unittest.mock import patch, MagicMock
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import extract_section_from_text, sse_event, resolve_attachment_refs


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

    def test_image_preserved_in_section(self):
        """Images inside a section should NOT be detected as headings."""
        text = """Свет

Основное освещение — встроенные споты.

![Фото освещения](<attachment:abc123>)

Дополнительно — бра у кровати.

Цвет

Бежевый"""
        result = extract_section_from_text(text, "Свет")
        assert result is not None
        assert "встроенные споты" in result
        assert "![Фото освещения](<attachment:abc123>)" in result
        assert "бра у кровати" in result
        # Should NOT bleed into next section
        assert "Бежевый" not in result

    def test_multiple_images_preserved(self):
        """Multiple images in a section should all be preserved."""
        text = """Свет

Люстра в центре комнаты, бра у кровати.

![Люстра](<attachment:img1>)

![Бра](<attachment:img2>)

Цвет

Белый"""
        result = extract_section_from_text(text, "Свет")
        assert "![Люстра](<attachment:img1>)" in result
        assert "![Бра](<attachment:img2>)" in result
        assert "Люстра в центре" in result
        assert "Белый" not in result

    def test_link_not_detected_as_heading(self):
        """Standalone links should not be treated as headings."""
        text = """Свет

Подробнее тут:

[Каталог светильников](https://example.com/lights)

Ещё варианты.

Цвет

Белый"""
        result = extract_section_from_text(text, "Свет")
        assert "[Каталог светильников](https://example.com/lights)" in result
        assert "Ещё варианты" in result
        assert "Белый" not in result

    def test_blockquote_not_detected_as_heading(self):
        """Blockquotes should not be treated as headings."""
        text = """Свет

> Важно: диммируемый

Всё остальное тоже.

Цвет

Белый"""
        result = extract_section_from_text(text, "Свет")
        assert "> Важно: диммируемый" in result
        assert "Всё остальное тоже" in result
        assert "Белый" not in result

    def test_bold_markdown_heading_matched(self):
        """## **Свет** should match search for 'Свет'."""
        text = """## **Свет**

Диммеры и споты.

## Цвет

Белый"""
        result = extract_section_from_text(text, "Свет")
        assert result is not None
        assert "Диммеры и споты" in result
        assert "Белый" not in result

    def test_italic_markdown_heading_matched(self):
        """## *Свет* should match search for 'Свет'."""
        text = """## *Свет*

Люстра.

## Цвет

Серый"""
        result = extract_section_from_text(text, "Свет")
        assert result is not None
        assert "Люстра" in result

    def test_bold_plain_text_heading_matched(self):
        """**Свет** as plain text heading should match 'Свет'."""
        text = """**Свет**

Диммеры и споты.

Цвет

Белый"""
        result = extract_section_from_text(text, "Свет")
        assert result is not None
        assert "Диммеры" in result

    def test_table_not_detected_as_heading(self):
        """Table rows should not be treated as headings."""
        text = """Свет

Настройки:

| Режим | Яркость |
|-------|---------|
| День  | 100%    |

Дополнительно.

Цвет

Белый"""
        result = extract_section_from_text(text, "Свет")
        assert "| Режим | Яркость |" in result
        assert "Дополнительно" in result
        assert "Белый" not in result

    def test_section_with_only_image(self):
        """Section containing only an image should still be extracted."""
        text = """## Свет

![Освещение](<attachment:light123>)

## Цвет

Белый"""
        result = extract_section_from_text(text, "Свет")
        assert result is not None
        assert "![Освещение](<attachment:light123>)" in result

    def test_section_image_then_text(self):
        """Section with image followed by text should extract both."""
        text = """## Свет

![screenshot](/api/attachments.redirect?id=abc)

- Светло
- Мягко
- Скрыта неидеальность

## Тишина

Тихо"""
        result = extract_section_from_text(text, "Свет")
        assert result is not None
        assert "![screenshot](/api/attachments.redirect?id=abc)" in result
        assert "- Светло" in result
        assert "- Мягко" in result
        assert "Тихо" not in result

    def test_format_b_no_empty_lines_around_heading(self):
        """Format B: plain text headings with NO empty lines around them.

        Real Yonote API returns text like:
          Геометрия
          Стык через металл профиль
          Никаких треков...
          Свет
          Светло
          Мягко

          Цвет
          Бежевые...
        """
        text = ("Геометрия\nСтык через металл профиль\n"
                "Никаких треков, светильники утоплены в цвет потолка, умеренно тёплый свет одного тона\n"
                "Свет\nСветло\nМягко\nСкрыта неидеальность\nПрибавляет аппетитности \n\n"
                "Цвет\nБежевые, пастельные, тёплые оттенки\nМожет быть контраст небольшим акцентом\n\n"
                "Текстура\nДерево\n")
        result = extract_section_from_text(text, "Свет")
        assert result is not None
        assert "Светло" in result
        assert "Мягко" in result
        assert "Скрыта неидеальность" in result
        assert "Прибавляет аппетитности" in result
        assert "Бежевые" not in result
        assert "Дерево" not in result

    def test_format_b_search_second_section(self):
        """Format B: searching for second section after empty line."""
        text = ("Свет\nСветло\nМягко\n\n"
                "Цвет\nБежевые оттенки\nТёплые тона\n\n"
                "Текстура\nДерево\n")
        result = extract_section_from_text(text, "Цвет")
        assert result is not None
        assert "Бежевые оттенки" in result
        assert "Тёплые тона" in result
        assert "Дерево" not in result

    def test_format_b_last_section(self):
        """Format B: last section in document (no following heading)."""
        text = "Свет\nСветло\nМягко\n\nЦвет\nБежевые оттенки\n"
        result = extract_section_from_text(text, "Цвет")
        assert result is not None
        assert "Бежевые оттенки" in result

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
    def test_reports_skipped_and_error_pages(self, mock_yonote):
        """Should show which pages had errors and which had no section."""
        mock_yonote.documents_list.side_effect = [
            {"data": [
                {"id": "ok", "title": "ОК"},
                {"id": "skip", "title": "Пропущена"},
                {"id": "err", "title": "Ошибка"},
            ]},
            {"data": []}, {"data": []}, {"data": []},
        ]
        mock_yonote.document_info.side_effect = [
            {"data": {"id": "ok", "title": "ОК", "text": "Свет\n\nСветло\nМягко\n\nЦвет\n\nБелый"}},
            {"data": {"id": "skip", "title": "Пропущена", "text": "Мебель\n\nСтолы"}},
            Exception("API timeout"),
        ]
        mock_yonote.collections_list.return_value = {"data": [{"id": "col-1"}]}
        mock_yonote.document_create.return_value = {"data": {"id": "r", "title": "t", "url": "/r"}}
        mock_yonote.full_url.return_value = "https://x.yonote.ru/r"

        from app import execute_extract_sections_streaming
        events = list(execute_extract_sections_streaming({
            "parent_document_id": "parent-1",
            "heading": "Свет",
        }))

        sse_events = [e for e in events if isinstance(e, str)]
        sse_text = " ".join(sse_events)

        # Should report the error and skipped pages
        assert "Ошибка" in sse_text
        assert "Пропущена" in sse_text
        # But still create report from the OK page
        mock_yonote.document_create.assert_called_once()

    @patch("app.yonote")
    def test_empty_text_pages_reported_separately(self, mock_yonote):
        """Pages with null/empty text should be reported as 'empty text', not 'section not found'."""
        mock_yonote.documents_list.side_effect = [
            {"data": [
                {"id": "ok", "title": "Гости"},
                {"id": "empty", "title": "С картинкой"},  # block-based, text is null
            ]},
            {"data": []}, {"data": []},
        ]
        mock_yonote.document_info.side_effect = [
            {"data": {"id": "ok", "title": "Гости", "text": "Свет\n\nСветло\nМягко\n\nЦвет\n\nБелый"}},
            {"data": {"id": "empty", "title": "С картинкой", "text": None}},  # null text
        ]
        mock_yonote.collections_list.return_value = {"data": [{"id": "col-1"}]}
        mock_yonote.document_create.return_value = {"data": {"id": "r", "title": "t", "url": "/r"}}
        mock_yonote.full_url.return_value = "https://x.yonote.ru/r"

        from app import execute_extract_sections_streaming

        events = list(execute_extract_sections_streaming({
            "parent_document_id": "parent-1",
            "heading": "Свет",
        }))

        sse_events = [e for e in events if isinstance(e, str)]
        sse_text = " ".join(sse_events)

        # Should specifically mention "пустой текст" for the block-based page
        assert "С картинкой" in sse_text
        assert "пустой" in sse_text.lower() or "блочный" in sse_text.lower()
        # Should still create report from the non-empty page
        mock_yonote.document_create.assert_called_once()

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
    def test_images_preserved_in_report(self, mock_yonote):
        """Images inside sections should survive the full extract+compile pipeline."""
        mock_yonote.documents_list.side_effect = [
            {"data": [{"id": "child-1", "title": "Гости"}]},
            {"data": []},
        ]
        mock_yonote.document_info.return_value = {
            "data": {
                "id": "child-1", "title": "Гости",
                "text": "Свет\n\nОсновное освещение — споты.\n\n![Фото](<attachment:abc123>)\n\nДополнительно — бра.\n\nЦвет\n\nБежевый",
            }
        }
        mock_yonote.collections_list.return_value = {"data": [{"id": "col-1"}]}
        mock_yonote.document_create.return_value = {"data": {"id": "r", "title": "t", "url": "/r"}}
        mock_yonote.full_url.return_value = "https://x.yonote.ru/r"
        mock_yonote.get_attachment_url.side_effect = (
            lambda uuid: f"https://app.yonote.ru/api/attachments.redirect?id={uuid}"
        )

        from app import execute_extract_sections_streaming
        events = list(execute_extract_sections_streaming({
            "parent_document_id": "parent-1",
            "heading": "Свет",
        }))

        call_kwargs = mock_yonote.document_create.call_args
        created_text = call_kwargs.kwargs.get("text") or call_kwargs[1].get("text", "")
        # Image should be in the report with redirect URL (attachment ref resolved)
        assert "![Фото](https://app.yonote.ru/api/attachments.redirect?id=abc123)" in created_text
        assert "<attachment:abc123>" not in created_text
        assert "споты" in created_text
        assert "бра" in created_text
        # Content from next section should NOT leak in
        assert "Бежевый" not in created_text

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

    @patch("app.yonote")
    def test_paths_without_root_title(self, mock_yonote):
        """Without root_title, paths start from first child."""
        mock_yonote.documents_list.side_effect = [
            {"data": [{"id": "c1", "title": "Интерьер"}]},
            {"data": [{"id": "c2", "title": "Гости"}]},
            {"data": []},
        ]

        from app import fetch_all_descendants
        result = fetch_all_descendants("root")
        assert result[0]["path"] == ["Интерьер"]
        assert result[1]["path"] == ["Интерьер", "Гости"]

    @patch("app.yonote")
    def test_paths_with_root_title(self, mock_yonote):
        """With root_title, paths include the root."""
        mock_yonote.documents_list.side_effect = [
            {"data": [{"id": "c1", "title": "Интерьер"}]},
            {"data": [{"id": "c2", "title": "Гости"}]},
            {"data": []},
        ]

        from app import fetch_all_descendants
        result = fetch_all_descendants("root", root_title="Авгодом")
        assert result[0]["path"] == ["Авгодом", "Интерьер"]
        assert result[1]["path"] == ["Авгодом", "Интерьер", "Гости"]


class TestBreadcrumbs:
    """Tests for breadcrumbs in extract_sections reports."""

    @patch("app.yonote")
    def test_no_breadcrumbs_by_default(self, mock_yonote):
        """Without breadcrumbs param, no path is added to report."""
        mock_yonote.documents_list.side_effect = [
            {"data": [{"id": "c1", "title": "Гости"}]},
            {"data": []},
        ]
        mock_yonote.document_info.return_value = {
            "data": {"id": "c1", "title": "Гости", "text": "Свет\n\nСветло\nМягко\n\nЦвет\n\nБелый"}
        }
        mock_yonote.collections_list.return_value = {"data": [{"id": "col-1"}]}
        mock_yonote.document_create.return_value = {"data": {"id": "r", "title": "t", "url": "/r"}}
        mock_yonote.full_url.return_value = "https://x.yonote.ru/r"

        from app import execute_extract_sections_streaming
        events = list(execute_extract_sections_streaming({
            "parent_document_id": "parent-1",
            "heading": "Свет",
        }))

        call_kwargs = mock_yonote.document_create.call_args
        created_text = call_kwargs.kwargs.get("text") or call_kwargs[1].get("text", "")
        assert "→" not in created_text  # No breadcrumb arrows

    @patch("app.yonote")
    def test_breadcrumbs_added_when_enabled(self, mock_yonote):
        """With breadcrumbs=True, path is added under each heading."""
        # document_info calls: 1 for root title + 2 for children
        mock_yonote.documents_list.side_effect = [
            {"data": [
                {"id": "interior", "title": "Интерьер"},
            ]},
            {"data": [{"id": "guests", "title": "1 этаж, Гости"}]},
            {"data": []},
        ]
        mock_yonote.document_info.side_effect = [
            # Root title fetch
            {"data": {"id": "avgdom", "title": "Авгодом"}},
            # Reading "Интерьер" — no "Свет"
            {"data": {"id": "interior", "title": "Интерьер", "text": "Описание\n\nТекст"}},
            # Reading "1 этаж, Гости" — HAS "Свет"
            {"data": {"id": "guests", "title": "1 этаж, Гости", "text": "Свет\n\nСветло\nМягко\n\nЦвет\n\nБелый"}},
        ]
        mock_yonote.collections_list.return_value = {"data": [{"id": "col-1"}]}
        mock_yonote.document_create.return_value = {"data": {"id": "r", "title": "t", "url": "/r"}}
        mock_yonote.full_url.return_value = "https://x.yonote.ru/r"

        from app import execute_extract_sections_streaming
        events = list(execute_extract_sections_streaming({
            "parent_document_id": "avgdom",
            "heading": "Свет",
            "breadcrumbs": True,
        }))

        call_kwargs = mock_yonote.document_create.call_args
        created_text = call_kwargs.kwargs.get("text") or call_kwargs[1].get("text", "")
        assert "## 1 этаж, Гости" in created_text
        assert "*Авгодом → Интерьер → 1 этаж, Гости*" in created_text
        assert "Светло" in created_text

    @patch("app.yonote")
    def test_breadcrumbs_multiple_sections(self, mock_yonote):
        """Each section gets its own breadcrumb path."""
        mock_yonote.documents_list.side_effect = [
            {"data": [
                {"id": "branch-a", "title": "Крыло А"},
                {"id": "branch-b", "title": "Крыло Б"},
            ]},
            {"data": [{"id": "room-a1", "title": "Комната 101"}]},
            {"data": [{"id": "room-b1", "title": "Комната 201"}]},
            {"data": []},
            {"data": []},
        ]
        mock_yonote.document_info.side_effect = [
            # Root title
            {"data": {"id": "root", "title": "Здание"}},
            # Reading pages
            {"data": {"id": "branch-a", "title": "Крыло А", "text": "Описание\n\nТекст"}},
            {"data": {"id": "branch-b", "title": "Крыло Б", "text": "Описание\n\nТекст"}},
            {"data": {"id": "room-a1", "title": "Комната 101", "text": "Свет\n\nЛюстра\nБра\n\nЦвет\n\nБелый"}},
            {"data": {"id": "room-b1", "title": "Комната 201", "text": "Свет\n\nСпоты\nДиммер\n\nЦвет\n\nСерый"}},
        ]
        mock_yonote.collections_list.return_value = {"data": [{"id": "col-1"}]}
        mock_yonote.document_create.return_value = {"data": {"id": "r", "title": "t", "url": "/r"}}
        mock_yonote.full_url.return_value = "https://x.yonote.ru/r"

        from app import execute_extract_sections_streaming
        events = list(execute_extract_sections_streaming({
            "parent_document_id": "root",
            "heading": "Свет",
            "breadcrumbs": True,
        }))

        call_kwargs = mock_yonote.document_create.call_args
        created_text = call_kwargs.kwargs.get("text") or call_kwargs[1].get("text", "")
        assert "*Здание → Крыло А → Комната 101*" in created_text


class TestCopySectionStreaming:
    """Tests for execute_copy_section_streaming() generator."""

    @patch("app.yonote")
    def test_extracts_section_and_creates_document(self, mock_yonote):
        """Should extract a section from a document and create a new page."""
        mock_yonote.document_info.return_value = {
            "data": {
                "id": "doc-1", "title": "Гости",
                "text": "Геометрия\n\nОткрытая планировка\n\nСвет\n\nСветло\nМягко\nТёплый тон\n\nЦвет\n\nБежевый",
                "url": "/doc/guests",
            }
        }
        mock_yonote.full_url.return_value = "https://x.yonote.ru/doc/guests"
        mock_yonote.collections_list.return_value = {"data": [{"id": "col-1"}]}
        mock_yonote.document_create.return_value = {"data": {
            "id": "new-1", "title": "Свет — Гости", "url": "/doc/new-1",
        }}

        from app import execute_copy_section_streaming

        events = list(execute_copy_section_streaming({
            "document_id": "doc-1",
            "heading": "Свет",
            "output_title": "Свет — Гости",
        }))

        # Check document was created with section content
        mock_yonote.document_create.assert_called_once()
        call_kwargs = mock_yonote.document_create.call_args
        created_text = call_kwargs.kwargs.get("text") or call_kwargs[1].get("text", "")
        assert "Светло" in created_text
        assert "Мягко" in created_text
        assert "Тёплый тон" in created_text
        # Should NOT include other sections
        assert "Бежевый" not in created_text
        assert "Открытая планировка" not in created_text
        # Should have source reference
        assert "Источник" in created_text
        assert "Гости" in created_text

        # Check final result
        result_items = [e for e in events if isinstance(e, dict)]
        assert len(result_items) == 1
        result = result_items[0]["_result"]
        assert result["document"]["id"] == "new-1"
        assert result["heading"] == "Свет"

    @patch("app.yonote")
    def test_section_not_found(self, mock_yonote):
        """Should return message when section heading doesn't exist."""
        mock_yonote.document_info.return_value = {
            "data": {
                "id": "doc-1", "title": "Гости",
                "text": "Мебель\n\nСтолы и стулья",
                "url": "/doc/guests",
            }
        }
        mock_yonote.full_url.return_value = "https://x.yonote.ru/doc/guests"

        from app import execute_copy_section_streaming

        events = list(execute_copy_section_streaming({
            "document_id": "doc-1",
            "heading": "Свет",
        }))

        result_items = [e for e in events if isinstance(e, dict)]
        assert len(result_items) == 1
        assert "не найдена" in result_items[0]["_result"]["message"]
        mock_yonote.document_create.assert_not_called()

    @patch("app.yonote")
    def test_empty_text_suggests_duplicate(self, mock_yonote):
        """When document has no text, should suggest duplicate_document."""
        mock_yonote.document_info.return_value = {
            "data": {
                "id": "doc-1", "title": "С картинкой",
                "text": None,
                "url": "/doc/img",
            }
        }
        mock_yonote.full_url.return_value = "https://x.yonote.ru/doc/img"

        from app import execute_copy_section_streaming

        events = list(execute_copy_section_streaming({
            "document_id": "doc-1",
            "heading": "Свет",
        }))

        result_items = [e for e in events if isinstance(e, dict)]
        assert len(result_items) == 1
        msg = result_items[0]["_result"]["message"]
        assert "duplicate_document" in msg
        mock_yonote.document_create.assert_not_called()

    @patch("app.yonote")
    def test_images_preserved_in_copy(self, mock_yonote):
        """Images in extracted section should be preserved with resolved URLs."""
        mock_yonote.document_info.return_value = {
            "data": {
                "id": "doc-1", "title": "Гости",
                "text": "Свет\n\nОсновное освещение.\n\n![Фото](<attachment:abc123>)\n\nДополнительно — бра.\n\nЦвет\n\nБежевый",
                "url": "/doc/guests",
            }
        }
        mock_yonote.full_url.return_value = "https://x.yonote.ru/doc/guests"
        mock_yonote.get_attachment_url.side_effect = (
            lambda uuid: f"https://app.yonote.ru/api/attachments.redirect?id={uuid}"
        )
        mock_yonote.collections_list.return_value = {"data": [{"id": "col-1"}]}
        mock_yonote.document_create.return_value = {"data": {
            "id": "new-1", "title": "Свет", "url": "/doc/new-1",
        }}

        from app import execute_copy_section_streaming

        events = list(execute_copy_section_streaming({
            "document_id": "doc-1",
            "heading": "Свет",
        }))

        call_kwargs = mock_yonote.document_create.call_args
        created_text = call_kwargs.kwargs.get("text") or call_kwargs[1].get("text", "")
        assert "![Фото](https://app.yonote.ru/api/attachments.redirect?id=abc123)" in created_text
        assert "бра" in created_text
        assert "Бежевый" not in created_text

    @patch("app.yonote")
    def test_emits_progress_events(self, mock_yonote):
        """Should emit SSE status events during execution."""
        mock_yonote.document_info.return_value = {
            "data": {
                "id": "doc-1", "title": "Гости",
                "text": "## Свет\n\n- Светло\n- Мягко\n- Скрыта неидеальность\n\n## Цвет\n\nБежевые оттенки.",
                "url": "/doc/guests",
            }
        }
        mock_yonote.full_url.side_effect = lambda url: f"https://x.yonote.ru{url}"
        mock_yonote.collections_list.return_value = {"data": [{"id": "col-1"}]}
        mock_yonote.document_create.return_value = {"data": {"id": "r", "title": "t", "url": "/r"}}

        from app import execute_copy_section_streaming

        events = list(execute_copy_section_streaming({
            "document_id": "doc-1",
            "heading": "Свет",
            "output_title": "Копия Свет",
        }))

        sse_events = [e for e in events if isinstance(e, str)]
        sse_text = " ".join(sse_events)
        assert "Загружаю документ" in sse_text
        assert "Ищу секцию" in sse_text
        assert "Создаю страницу" in sse_text

    @patch("app.yonote")
    def test_parent_document_id_passed(self, mock_yonote):
        """When parent_document_id is provided, it should be passed to document_create."""
        mock_yonote.document_info.return_value = {
            "data": {
                "id": "doc-1", "title": "Гости",
                "text": "## Свет\n\n- Светло\n- Мягко\n- Скрыта неидеальность\n\n## Цвет\n\nБежевые оттенки.",
                "url": "/doc/guests",
            }
        }
        mock_yonote.full_url.side_effect = lambda url: f"https://x.yonote.ru{url}"
        mock_yonote.collections_list.return_value = {"data": [{"id": "col-1"}]}
        mock_yonote.document_create.return_value = {"data": {"id": "r", "title": "t", "url": "/r"}}

        from app import execute_copy_section_streaming

        list(execute_copy_section_streaming({
            "document_id": "doc-1",
            "heading": "Свет",
            "parent_document_id": "parent-123",
        }))

        call_kwargs = mock_yonote.document_create.call_args
        # Check parent_document_id was passed
        all_kwargs = call_kwargs.kwargs if call_kwargs.kwargs else {}
        assert all_kwargs.get("parent_document_id") == "parent-123"


class TestFetchDocumentImages:
    """Tests for fetch_document_images() helper."""

    @patch("app.yonote")
    def test_returns_images_as_markdown(self, mock_yonote):
        mock_yonote.attachments_list.return_value = {"data": [
            {
                "id": "att-1",
                "name": "photo.png",
                "contentType": "image/png",
                "size": 245252,
                "redirectUrl": "/api/attachments.redirect?id=att-1",
            },
        ]}
        mock_yonote.full_url.side_effect = lambda url: f"https://x.yonote.ru{url}"

        from app import fetch_document_images
        images = fetch_document_images("doc-1")

        assert len(images) == 1
        assert "![photo.png](https://x.yonote.ru/api/attachments.redirect?id=att-1)" == images[0]

    @patch("app.yonote")
    def test_returns_empty_when_no_attachments(self, mock_yonote):
        mock_yonote.attachments_list.return_value = {"data": []}

        from app import fetch_document_images
        images = fetch_document_images("doc-1")
        assert images == []

    @patch("app.yonote")
    def test_filters_non_image_attachments(self, mock_yonote):
        mock_yonote.attachments_list.return_value = {"data": [
            {"id": "1", "name": "doc.pdf", "contentType": "application/pdf", "redirectUrl": "/r?id=1"},
            {"id": "2", "name": "pic.jpg", "contentType": "image/jpeg", "redirectUrl": "/r?id=2"},
        ]}
        mock_yonote.full_url.side_effect = lambda url: f"https://x.yonote.ru{url}"

        from app import fetch_document_images
        images = fetch_document_images("doc-1")

        assert len(images) == 1
        assert "pic.jpg" in images[0]
        assert "doc.pdf" not in str(images)

    @patch("app.yonote")
    def test_returns_empty_on_api_error(self, mock_yonote):
        mock_yonote.attachments_list.side_effect = Exception("API error")

        from app import fetch_document_images
        images = fetch_document_images("doc-1")
        assert images == []

    @patch("app.yonote")
    def test_multiple_images(self, mock_yonote):
        mock_yonote.attachments_list.return_value = {"data": [
            {"id": "1", "name": "a.png", "contentType": "image/png", "redirectUrl": "/r?id=1"},
            {"id": "2", "name": "b.jpg", "contentType": "image/jpeg", "redirectUrl": "/r?id=2"},
            {"id": "3", "name": "c.gif", "contentType": "image/gif", "redirectUrl": "/r?id=3"},
        ]}
        mock_yonote.full_url.side_effect = lambda url: f"https://x.yonote.ru{url}"

        from app import fetch_document_images
        images = fetch_document_images("doc-1")
        assert len(images) == 3


class TestMatchImageToHeading:
    """Tests for _match_image_to_heading() tag parsing."""

    def test_hash_tag_match(self):
        from app import _match_image_to_heading
        assert _match_image_to_heading("#свет - фото освещения.png", "Свет") == "match"

    def test_hash_tag_match_dash(self):
        from app import _match_image_to_heading
        assert _match_image_to_heading("#свет фото.png", "Свет") == "match"

    def test_plain_tag_match(self):
        """Tag without # should also work."""
        from app import _match_image_to_heading
        assert _match_image_to_heading("свет - фото освещения.png", "Свет") == "match"

    def test_plain_tag_space(self):
        from app import _match_image_to_heading
        assert _match_image_to_heading("свет фото.png", "Свет") == "match"

    def test_tag_mismatch(self):
        from app import _match_image_to_heading
        assert _match_image_to_heading("#цвет - палитра.png", "Свет") == "mismatch"

    def test_plain_tag_mismatch(self):
        from app import _match_image_to_heading
        assert _match_image_to_heading("цвет - палитра.png", "Свет") == "mismatch"

    def test_untagged_image(self):
        from app import _match_image_to_heading
        assert _match_image_to_heading("image.png", "Свет") == "untagged"

    def test_no_heading(self):
        from app import _match_image_to_heading
        assert _match_image_to_heading("#свет - фото.png", None) == "untagged"

    def test_empty_name(self):
        from app import _match_image_to_heading
        assert _match_image_to_heading("", "Свет") == "untagged"

    def test_partial_word_not_matched(self):
        """'рассвет.png' should NOT match heading 'Свет' (part of word)."""
        from app import _match_image_to_heading
        assert _match_image_to_heading("рассвет.png", "Свет") != "match"

    def test_case_insensitive(self):
        from app import _match_image_to_heading
        assert _match_image_to_heading("#СВЕТ - фото.png", "свет") == "match"
        assert _match_image_to_heading("#Свет - фото.png", "СВЕТ") == "match"

    def test_em_dash_separator(self):
        from app import _match_image_to_heading
        assert _match_image_to_heading("#свет — фото.png", "Свет") == "match"

    def test_tag_only_filename(self):
        """Filename is just the tag + extension."""
        from app import _match_image_to_heading
        assert _match_image_to_heading("#свет.png", "Свет") == "match"

    def test_multi_word_heading(self):
        from app import _match_image_to_heading
        assert _match_image_to_heading("#принципиальные решения - схема.png", "Принципиальные решения") == "match"


class TestFetchDocumentImagesFiltered:
    """Tests for fetch_document_images() with heading filter."""

    @patch("app.yonote")
    def test_tagged_match_included(self, mock_yonote):
        mock_yonote.attachments_list.return_value = {"data": [
            {"id": "1", "name": "#свет - фото.png", "contentType": "image/png",
             "redirectUrl": "/r?id=1"},
        ]}
        mock_yonote.full_url.side_effect = lambda url: f"https://x.yonote.ru{url}"

        from app import fetch_document_images
        images = fetch_document_images("doc-1", heading="Свет")
        assert len(images) == 1
        assert "фото.png" in images[0]

    @patch("app.yonote")
    def test_tagged_mismatch_excluded(self, mock_yonote):
        mock_yonote.attachments_list.return_value = {"data": [
            {"id": "1", "name": "#цвет - палитра.png", "contentType": "image/png",
             "redirectUrl": "/r?id=1"},
        ]}
        mock_yonote.full_url.side_effect = lambda url: f"https://x.yonote.ru{url}"

        from app import fetch_document_images
        images = fetch_document_images("doc-1", heading="Свет")
        assert len(images) == 0

    @patch("app.yonote")
    def test_untagged_excluded_when_heading(self, mock_yonote):
        """Untagged images (image.png) should be excluded when heading is provided."""
        mock_yonote.attachments_list.return_value = {"data": [
            {"id": "1", "name": "image.png", "contentType": "image/png",
             "redirectUrl": "/r?id=1"},
        ]}
        mock_yonote.full_url.side_effect = lambda url: f"https://x.yonote.ru{url}"

        from app import fetch_document_images
        images = fetch_document_images("doc-1", heading="Свет")
        assert len(images) == 0

    @patch("app.yonote")
    def test_mixed_tags_filtering(self, mock_yonote):
        """Only explicitly tagged matching images should be returned."""
        mock_yonote.attachments_list.return_value = {"data": [
            {"id": "1", "name": "#свет - люстра.png", "contentType": "image/png",
             "redirectUrl": "/r?id=1"},
            {"id": "2", "name": "#цвет - палитра.png", "contentType": "image/png",
             "redirectUrl": "/r?id=2"},
            {"id": "3", "name": "photo.jpg", "contentType": "image/jpeg",
             "redirectUrl": "/r?id=3"},
        ]}
        mock_yonote.full_url.side_effect = lambda url: f"https://x.yonote.ru{url}"

        from app import fetch_document_images
        images = fetch_document_images("doc-1", heading="Свет")
        assert len(images) == 1  # only #свет, NOT #цвет or untagged
        combined = " ".join(images)
        assert "люстра" in combined
        assert "photo" not in combined
        assert "палитра" not in combined

    @patch("app.yonote")
    def test_no_heading_returns_all(self, mock_yonote):
        """Without heading filter, all images should be returned."""
        mock_yonote.attachments_list.return_value = {"data": [
            {"id": "1", "name": "#свет - люстра.png", "contentType": "image/png",
             "redirectUrl": "/r?id=1"},
            {"id": "2", "name": "#цвет - палитра.png", "contentType": "image/png",
             "redirectUrl": "/r?id=2"},
        ]}
        mock_yonote.full_url.side_effect = lambda url: f"https://x.yonote.ru{url}"

        from app import fetch_document_images
        images = fetch_document_images("doc-1", heading=None)
        assert len(images) == 2


class TestExtractSectionsWithAttachments:
    """Tests for extract_sections enrichment with document images."""

    @patch("app.yonote")
    def test_images_appended_to_extracted_section(self, mock_yonote):
        """When a document has attachments, they should appear in the report."""
        mock_yonote.documents_list.side_effect = [
            {"data": [{"id": "child-1", "title": "Гости"}]},
            {"data": []},
        ]
        mock_yonote.document_info.return_value = {
            "data": {"id": "child-1", "title": "Гости",
                     "text": "Свет\n\nСветло\nМягко\n\nЦвет\n\nБелый"}
        }
        mock_yonote.attachments_list.return_value = {"data": [
            {"id": "img-1", "name": "свет — люстра.png", "contentType": "image/png",
             "redirectUrl": "/api/attachments.redirect?id=img-1"},
        ]}
        mock_yonote.full_url.side_effect = lambda url: f"https://x.yonote.ru{url}"
        mock_yonote.collections_list.return_value = {"data": [{"id": "col-1"}]}
        mock_yonote.document_create.return_value = {"data": {
            "id": "r", "title": "t", "url": "/r",
        }}

        from app import execute_extract_sections_streaming

        events = list(execute_extract_sections_streaming({
            "parent_document_id": "parent-1",
            "heading": "Свет",
        }))

        call_kwargs = mock_yonote.document_create.call_args
        created_text = call_kwargs.kwargs.get("text") or call_kwargs[1].get("text", "")
        # Section text should be there
        assert "Светло" in created_text
        assert "Мягко" in created_text
        # Tagged image should be appended
        assert "attachments.redirect?id=img-1" in created_text
        # Other section should NOT be there
        assert "Белый" not in created_text

    @patch("app.yonote")
    def test_no_images_when_no_attachments(self, mock_yonote):
        """When document has no attachments, report should have text only."""
        mock_yonote.documents_list.side_effect = [
            {"data": [{"id": "child-1", "title": "Гости"}]},
            {"data": []},
        ]
        mock_yonote.document_info.return_value = {
            "data": {"id": "child-1", "title": "Гости",
                     "text": "Свет\n\nСветло\nМягко\n\nЦвет\n\nБелый"}
        }
        mock_yonote.attachments_list.return_value = {"data": []}
        mock_yonote.collections_list.return_value = {"data": [{"id": "col-1"}]}
        mock_yonote.document_create.return_value = {"data": {
            "id": "r", "title": "t", "url": "/r",
        }}
        mock_yonote.full_url.return_value = "https://x.yonote.ru/r"

        from app import execute_extract_sections_streaming

        list(execute_extract_sections_streaming({
            "parent_document_id": "parent-1",
            "heading": "Свет",
        }))

        call_kwargs = mock_yonote.document_create.call_args
        created_text = call_kwargs.kwargs.get("text") or call_kwargs[1].get("text", "")
        assert "![" not in created_text
        assert "Светло" in created_text


class TestCopySectionWithAttachments:
    """Tests for copy_section enrichment with document images."""

    @patch("app.yonote")
    def test_images_appended_to_copied_section(self, mock_yonote):
        mock_yonote.document_info.return_value = {
            "data": {"id": "doc-1", "title": "Гости",
                     "text": "## Свет\n\n- Светло\n- Мягко\n\n## Цвет\n\nБежевый",
                     "url": "/doc/guests"}
        }
        mock_yonote.attachments_list.return_value = {"data": [
            {"id": "img-1", "name": "свет — лампа.jpg", "contentType": "image/jpeg",
             "redirectUrl": "/api/attachments.redirect?id=img-1"},
        ]}
        mock_yonote.full_url.side_effect = lambda url: f"https://x.yonote.ru{url}"
        mock_yonote.collections_list.return_value = {"data": [{"id": "col-1"}]}
        mock_yonote.document_create.return_value = {"data": {
            "id": "r", "title": "t", "url": "/r",
        }}

        from app import execute_copy_section_streaming

        events = list(execute_copy_section_streaming({
            "document_id": "doc-1",
            "heading": "Свет",
        }))

        call_kwargs = mock_yonote.document_create.call_args
        created_text = call_kwargs.kwargs.get("text") or call_kwargs[1].get("text", "")
        assert "Светло" in created_text
        assert "attachments.redirect?id=img-1" in created_text
        assert "Бежевый" not in created_text

    @patch("app.yonote")
    def test_no_images_when_no_attachments(self, mock_yonote):
        mock_yonote.document_info.return_value = {
            "data": {"id": "doc-1", "title": "Гости",
                     "text": "## Свет\n\n- Светло\n- Мягко\n\n## Цвет\n\nБежевый",
                     "url": "/doc/guests"}
        }
        mock_yonote.attachments_list.return_value = {"data": []}
        mock_yonote.full_url.side_effect = lambda url: f"https://x.yonote.ru{url}"
        mock_yonote.collections_list.return_value = {"data": [{"id": "col-1"}]}
        mock_yonote.document_create.return_value = {"data": {
            "id": "r", "title": "t", "url": "/r",
        }}

        from app import execute_copy_section_streaming

        list(execute_copy_section_streaming({
            "document_id": "doc-1",
            "heading": "Свет",
        }))

        call_kwargs = mock_yonote.document_create.call_args
        created_text = call_kwargs.kwargs.get("text") or call_kwargs[1].get("text", "")
        assert "![" not in created_text.split("---")[0]  # Before source reference


class TestResolveExportUrls:
    """Tests for _resolve_export_urls() helper."""

    def test_relative_image_url_resolved(self):
        from app import _resolve_export_urls
        with patch("app.yonote") as mock_yonote:
            mock_yonote.full_url.side_effect = lambda url: f"https://remake.yonote.ru{url}"
            text = '![](/api/attachments.redirect?id=abc123 "aspect=1")'
            result = _resolve_export_urls(text)
            assert "https://remake.yonote.ru/api/attachments.redirect?id=abc123" in result

    def test_absolute_urls_unchanged(self):
        from app import _resolve_export_urls
        with patch("app.yonote") as mock_yonote:
            text = '![img](https://example.com/photo.png)'
            result = _resolve_export_urls(text)
            assert result == text

    def test_table_and_image_preserved(self):
        from app import _resolve_export_urls
        with patch("app.yonote") as mock_yonote:
            mock_yonote.full_url.side_effect = lambda url: f"https://x.yonote.ru{url}"
            text = '## Свет\n\n![](/api/attachments.redirect?id=img1)\n\n| 1 | 2 |\n|---|---|\n| a | b |'
            result = _resolve_export_urls(text)
            assert "https://x.yonote.ru/api/attachments.redirect?id=img1" in result
            assert "| 1 | 2 |" in result


class TestExportIntegration:
    """Tests for documents.export integration in extract_sections and copy_section."""

    @patch("app.yonote")
    def test_extract_uses_export_when_available(self, mock_yonote):
        """When export returns rich markdown, section should contain table/images."""
        mock_yonote.documents_list.side_effect = [
            {"data": [{"id": "child-1", "title": "Интерьер"}]},
            {"data": []},
        ]
        # document_info returns lossy text (no table, no image)
        mock_yonote.document_info.return_value = {
            "data": {"id": "child-1", "title": "Интерьер",
                     "text": "Свет\nОписание света\n1\n2\n3\n\nЦвет\nБежевый"}
        }
        # export returns rich markdown with table + image
        mock_yonote.document_export_markdown.return_value = (
            "## Свет\n\n"
            "![](/api/attachments.redirect?id=img1)\n\n"
            "Описание света\n\n"
            "| 1 | 2 | 3 |\n|----|----|----|---|\n| a | b | c |\n\n"
            "## Цвет\n\nБежевый"
        )
        mock_yonote.full_url.side_effect = lambda url: f"https://x.yonote.ru{url}"
        mock_yonote.collections_list.return_value = {"data": [{"id": "col-1"}]}
        mock_yonote.document_create.return_value = {"data": {"id": "r", "title": "t", "url": "/r"}}

        from app import execute_extract_sections_streaming
        events = list(execute_extract_sections_streaming({
            "parent_document_id": "parent-1",
            "heading": "Свет",
        }))

        call_kwargs = mock_yonote.document_create.call_args
        created_text = call_kwargs.kwargs.get("text") or call_kwargs[1].get("text", "")
        # Table should be present (from export)
        assert "| 1 | 2 | 3 |" in created_text
        # Image should be present with absolute URL
        assert "https://x.yonote.ru/api/attachments.redirect?id=img1" in created_text
        # Other section should NOT be there
        assert "Бежевый" not in created_text

    @patch("app.yonote")
    def test_extract_falls_back_when_export_fails(self, mock_yonote):
        """When export fails, should fall back to basic text + attachments."""
        mock_yonote.documents_list.side_effect = [
            {"data": [{"id": "child-1", "title": "Гости"}]},
            {"data": []},
        ]
        mock_yonote.document_info.return_value = {
            "data": {"id": "child-1", "title": "Гости",
                     "text": "Свет\n\nСветло\nМягко\n\nЦвет\n\nБелый"}
        }
        mock_yonote.document_export_markdown.side_effect = Exception("export failed")
        mock_yonote.attachments_list.return_value = {"data": [
            {"id": "img-1", "name": "свет — лампа.png", "contentType": "image/png",
             "redirectUrl": "/api/attachments.redirect?id=img-1"},
        ]}
        mock_yonote.full_url.side_effect = lambda url: f"https://x.yonote.ru{url}"
        mock_yonote.collections_list.return_value = {"data": [{"id": "col-1"}]}
        mock_yonote.document_create.return_value = {"data": {"id": "r", "title": "t", "url": "/r"}}

        from app import execute_extract_sections_streaming
        events = list(execute_extract_sections_streaming({
            "parent_document_id": "parent-1",
            "heading": "Свет",
        }))

        call_kwargs = mock_yonote.document_create.call_args
        created_text = call_kwargs.kwargs.get("text") or call_kwargs[1].get("text", "")
        assert "Светло" in created_text
        # Fallback: tagged image from attachments
        assert "лампа" in created_text
        assert "img-1" in created_text

    @patch("app.yonote")
    def test_copy_section_uses_export(self, mock_yonote):
        """copy_section should use export to get rich content."""
        mock_yonote.document_info.return_value = {
            "data": {"id": "doc-1", "title": "Интерьер",
                     "text": "Свет\nОписание\n1\n2\n\nЦвет\nБежевый",
                     "url": "/doc/interior"}
        }
        mock_yonote.document_export_markdown.return_value = (
            "## Свет\n\n"
            "Описание\n\n"
            "| 1 | 2 |\n|---|---|\n| a | b |\n\n"
            "## Цвет\n\nБежевый"
        )
        mock_yonote.full_url.side_effect = lambda url: f"https://x.yonote.ru{url}"
        mock_yonote.collections_list.return_value = {"data": [{"id": "col-1"}]}
        mock_yonote.document_create.return_value = {"data": {"id": "r", "title": "t", "url": "/r"}}

        from app import execute_copy_section_streaming
        events = list(execute_copy_section_streaming({
            "document_id": "doc-1",
            "heading": "Свет",
        }))

        call_kwargs = mock_yonote.document_create.call_args
        created_text = call_kwargs.kwargs.get("text") or call_kwargs[1].get("text", "")
        assert "| 1 | 2 |" in created_text
        assert "Бежевый" not in created_text


class TestDocumentExportMarkdown:
    """Tests for document_export_markdown() in yonote_client.py."""

    @patch("yonote_client.requests")
    def test_export_success(self, mock_requests):
        from yonote_client import YonoteClient
        client = YonoteClient("test-token")

        # Mock the POST calls
        mock_post = mock_requests.post
        mock_post.side_effect = [
            # 1. documents.export
            MagicMock(status_code=200, json=lambda: {
                "data": {"fileOperation": {"id": "fo-1"}}
            }),
            # 2. fileOperations.info (complete)
            MagicMock(status_code=200, json=lambda: {
                "data": {"state": "complete"}
            }),
            # 3. fileOperations.redirect
            MagicMock(status_code=302, headers={"location": "https://storage.example.com/file.md"}),
        ]
        # 4. GET download
        mock_get = mock_requests.get
        mock_response = MagicMock()
        mock_response.content = "## Heading\n\nContent with | table |".encode("utf-8")
        mock_get.return_value = mock_response

        result = client.document_export_markdown("doc-1")
        assert "## Heading" in result
        assert "| table |" in result

    @patch("yonote_client.requests")
    def test_export_error_raises(self, mock_requests):
        from yonote_client import YonoteClient
        client = YonoteClient("test-token")

        mock_requests.post.side_effect = [
            MagicMock(status_code=200, json=lambda: {
                "data": {"fileOperation": {"id": "fo-1"}}
            }),
            MagicMock(status_code=200, json=lambda: {
                "data": {"state": "error"}
            }),
        ]

        import pytest
        with pytest.raises(RuntimeError, match="Export failed"):
            client.document_export_markdown("doc-1")


class TestDeepSearch:
    """Tests for execute_deep_search_streaming() — full-text content scanning."""

    @patch("app.yonote")
    def test_finds_text_in_document(self, mock_yonote):
        """Should find query in document text field."""
        mock_yonote.collections_list.return_value = {"data": [
            {"id": "col-1", "name": "Проект"},
        ]}
        mock_yonote.documents_list.side_effect = [
            # Collection documents
            {"data": [
                {"id": "d1", "title": "Интерьер", "url": "/doc/d1",
                 "text": "Стены из керамогранита\nПол деревянный"},
            ]},
            # d1 children
            {"data": []},
        ]
        mock_yonote.full_url.side_effect = lambda url: f"https://x.yonote.ru{url}"

        from app import execute_deep_search_streaming
        events = list(execute_deep_search_streaming({"query": "керамогранит"}))

        result_items = [e for e in events if isinstance(e, dict)]
        assert len(result_items) == 1
        result = result_items[0]["_result"]
        assert result["count"] == 1
        assert result["documents"][0]["id"] == "d1"
        assert "керамогранит" in result["documents"][0]["snippet"].lower()

    @patch("app.yonote")
    def test_finds_text_in_child_page(self, mock_yonote):
        """Should find query in nested child pages."""
        mock_yonote.collections_list.return_value = {"data": [
            {"id": "col-1", "name": "Проект"},
        ]}
        mock_yonote.documents_list.side_effect = [
            # Collection: 1 top-level doc
            {"data": [
                {"id": "parent", "title": "Родитель", "url": "/doc/parent",
                 "text": "Содержание"},
            ]},
            # parent -> 1 child
            {"data": [
                {"id": "child", "title": "Текстура", "url": "/doc/child",
                 "text": "Если камень/керамогранит, то не мраморная текстура"},
            ]},
            # child -> 0 children
            {"data": []},
        ]
        mock_yonote.full_url.side_effect = lambda url: f"https://x.yonote.ru{url}"

        from app import execute_deep_search_streaming
        events = list(execute_deep_search_streaming({"query": "керамогранит"}))

        result_items = [e for e in events if isinstance(e, dict)]
        result = result_items[0]["_result"]
        assert result["count"] == 1
        assert result["documents"][0]["id"] == "child"
        assert result["documents"][0]["title"] == "Текстура"

    @patch("app.yonote")
    def test_export_fallback_for_empty_text(self, mock_yonote):
        """Phase 2: export finds content when text field is empty."""
        mock_yonote.collections_list.return_value = {"data": [
            {"id": "col-1", "name": "Проект"},
        ]}
        mock_yonote.documents_list.side_effect = [
            {"data": [
                {"id": "d1", "title": "Блочная", "url": "/doc/d1",
                 "text": ""},  # Empty text (ProseMirror block content)
            ]},
            {"data": []},  # no children
        ]
        mock_yonote.document_export_markdown.return_value = (
            "## Текстура\n\n- Керамогранит на полу\n- Дерево на стенах"
        )
        mock_yonote.full_url.side_effect = lambda url: f"https://x.yonote.ru{url}"

        from app import execute_deep_search_streaming
        events = list(execute_deep_search_streaming({"query": "керамогранит"}))

        result_items = [e for e in events if isinstance(e, dict)]
        result = result_items[0]["_result"]
        assert result["count"] == 1
        assert result["documents"][0]["id"] == "d1"

    @patch("app.yonote")
    def test_phase2_export_for_partial_text(self, mock_yonote):
        """Phase 2: export finds content when text field has partial content
        but ProseMirror blocks (lists, tables) are missing from it."""
        mock_yonote.collections_list.return_value = {"data": [
            {"id": "col-1", "name": "Проект"},
        ]}
        mock_yonote.documents_list.side_effect = [
            # Collection: parent doc
            {"data": [
                {"id": "parent", "title": "Интерьер", "url": "/doc/parent",
                 "text": "Дизайн интерьера"},
            ]},
            # parent children: 1 child with partial text
            {"data": [
                {"id": "child", "title": "1 этаж, Гости", "url": "/doc/child",
                 "text": "Текстура\nСвет\nМебель"},  # Has some text, but list items missing
            ]},
            # child children
            {"data": []},
        ]

        def mock_export(doc_id):
            if doc_id == "child":
                return (
                    "## Текстура\n\n"
                    "- Если камень/керамогранит, то не мраморная текстура\n"
                    "- Матовая, но гладкая\n\n"
                    "## Свет\n\nТёплый свет"
                )
            if doc_id == "parent":
                return "Дизайн интерьера"
            return None

        mock_yonote.document_export_markdown.side_effect = mock_export
        mock_yonote.full_url.side_effect = lambda url: f"https://x.yonote.ru{url}"

        from app import execute_deep_search_streaming
        events = list(execute_deep_search_streaming({"query": "керамогранит"}))

        result_items = [e for e in events if isinstance(e, dict)]
        result = result_items[0]["_result"]
        assert result["count"] == 1
        assert result["documents"][0]["id"] == "child"
        assert result["documents"][0]["title"] == "1 этаж, Гости"
        assert "керамогранит" in result["documents"][0]["snippet"].lower()

    @patch("app.yonote")
    def test_no_results(self, mock_yonote):
        """Should return empty with note when nothing found in both phases."""
        mock_yonote.collections_list.return_value = {"data": [
            {"id": "col-1", "name": "Проект"},
        ]}
        mock_yonote.documents_list.side_effect = [
            {"data": [
                {"id": "d1", "title": "Интерьер", "url": "/doc/d1",
                 "text": "Дерево и камень"},
            ]},
            {"data": []},
        ]
        # Phase 2 export also doesn't find the query
        mock_yonote.document_export_markdown.return_value = "Дерево и камень — полный текст"
        mock_yonote.full_url.side_effect = lambda url: f"https://x.yonote.ru{url}"

        from app import execute_deep_search_streaming
        events = list(execute_deep_search_streaming({"query": "бетон"}))

        result_items = [e for e in events if isinstance(e, dict)]
        result = result_items[0]["_result"]
        assert result["count"] == 0
        assert "note" in result
        assert "бетон" in result["note"]

    @patch("app.yonote")
    def test_deduplication(self, mock_yonote):
        """Same document shouldn't appear twice if found in multiple places."""
        mock_yonote.collections_list.return_value = {"data": [
            {"id": "col-1", "name": "A"},
            {"id": "col-2", "name": "B"},
        ]}
        # Same doc appears in both collections (shared)
        mock_yonote.documents_list.side_effect = [
            {"data": [
                {"id": "d1", "title": "Общая", "url": "/doc/d1",
                 "text": "Керамогранит на полу"},
            ]},
            {"data": []},  # d1 children
            {"data": [
                {"id": "d1", "title": "Общая", "url": "/doc/d1",
                 "text": "Керамогранит на полу"},
            ]},
            {"data": []},  # d1 children again
        ]
        mock_yonote.full_url.side_effect = lambda url: f"https://x.yonote.ru{url}"

        from app import execute_deep_search_streaming
        events = list(execute_deep_search_streaming({"query": "керамогранит"}))

        result_items = [e for e in events if isinstance(e, dict)]
        result = result_items[0]["_result"]
        assert result["count"] == 1  # Not 2

    @patch("app.yonote")
    def test_specific_collection(self, mock_yonote):
        """Should scan only the specified collection when collection_id is given."""
        mock_yonote.documents_list.side_effect = [
            {"data": [
                {"id": "d1", "title": "Текстура", "url": "/doc/d1",
                 "text": "Керамогранит травертин"},
            ]},
            {"data": []},
        ]
        mock_yonote.full_url.side_effect = lambda url: f"https://x.yonote.ru{url}"

        from app import execute_deep_search_streaming
        events = list(execute_deep_search_streaming({
            "query": "керамогранит",
            "collection_id": "col-specific",
        }))

        # Should NOT call collections_list since specific collection is given
        mock_yonote.collections_list.assert_not_called()
        result_items = [e for e in events if isinstance(e, dict)]
        result = result_items[0]["_result"]
        assert result["count"] == 1

    @patch("app.yonote")
    def test_emits_status_events(self, mock_yonote):
        """Should emit SSE status events during scanning."""
        mock_yonote.collections_list.return_value = {"data": [
            {"id": "col-1", "name": "Мой проект"},
        ]}
        mock_yonote.documents_list.side_effect = [
            {"data": [
                {"id": "d1", "title": "А", "url": "/a", "text": "Текст"},
            ]},
            {"data": []},
        ]
        # Phase 2 export (since Phase 1 finds nothing for "что-то")
        mock_yonote.document_export_markdown.return_value = "Текст"
        mock_yonote.full_url.side_effect = lambda url: f"https://x.yonote.ru{url}"

        from app import execute_deep_search_streaming
        events = list(execute_deep_search_streaming({"query": "что-то"}))

        sse_events = [e for e in events if isinstance(e, str)]
        sse_text = " ".join(sse_events)
        assert "Загружаю коллекции" in sse_text
        assert "Мой проект" in sse_text
        assert "Быстрый скан" in sse_text

    @patch("app.yonote")
    def test_empty_query(self, mock_yonote):
        """Empty query should return immediately."""
        from app import execute_deep_search_streaming
        events = list(execute_deep_search_streaming({"query": ""}))

        result_items = [e for e in events if isinstance(e, dict)]
        result = result_items[0]["_result"]
        assert result["count"] == 0


class TestBuildResponse:
    """Tests for build_response() — accumulates documents from multiple results."""

    def test_single_search_with_results(self):
        from app import build_response
        results = [
            {"tool": "search", "result": {"documents": [
                {"id": "d1", "title": "Page 1", "number": 1},
            ], "count": 1}},
        ]
        combined = build_response(results, "Вот результаты:")
        assert combined["message"] == "Вот результаты:"
        assert len(combined["documents"]) == 1
        assert combined["documents"][0]["id"] == "d1"

    def test_empty_search_does_not_erase_previous(self):
        """Later empty search should NOT wipe out earlier found documents."""
        results = [
            {"tool": "search", "result": {"documents": [
                {"id": "d1", "title": "Растения", "number": 1},
            ], "count": 1}},
            {"tool": "search", "result": {"documents": [], "count": 0}},
            {"tool": "search", "result": {"documents": [], "count": 0}},
        ]
        from app import build_response
        combined = build_response(results, "Нашёл страницу:")
        assert "documents" in combined
        assert len(combined["documents"]) == 1
        assert combined["documents"][0]["id"] == "d1"

    def test_multiple_searches_accumulated(self):
        """Documents from multiple searches are merged and deduplicated."""
        results = [
            {"tool": "search", "result": {"documents": [
                {"id": "d1", "title": "Page A", "number": 1},
            ], "count": 1}},
            {"tool": "search", "result": {"documents": [
                {"id": "d2", "title": "Page B", "number": 1},
                {"id": "d1", "title": "Page A", "number": 2},  # duplicate
            ], "count": 2}},
        ]
        from app import build_response
        combined = build_response(results, "Результаты:")
        assert len(combined["documents"]) == 2
        ids = [d["id"] for d in combined["documents"]]
        assert "d1" in ids
        assert "d2" in ids

    def test_documents_renumbered(self):
        """Accumulated documents get sequential numbers."""
        results = [
            {"tool": "search", "result": {"documents": [
                {"id": "d1", "title": "A", "number": 1},
            ], "count": 1}},
            {"tool": "list_documents", "result": {"documents": [
                {"id": "d2", "title": "B", "number": 1},
                {"id": "d3", "title": "C", "number": 2},
            ], "count": 2}},
        ]
        from app import build_response
        combined = build_response(results, "Результаты:")
        numbers = [d["number"] for d in combined["documents"]]
        assert numbers == [1, 2, 3]

    def test_no_documents_key_when_none_found(self):
        """When no documents found across all results, don't add empty documents key."""
        results = [
            {"tool": "search", "result": {"documents": [], "count": 0}},
            {"tool": "search", "result": {"documents": [], "count": 0}},
        ]
        from app import build_response
        combined = build_response(results, "Ничего не найдено")
        assert "documents" not in combined

    def test_collections_and_documents_coexist(self):
        """Collections and documents from different results should both appear."""
        results = [
            {"tool": "list_collections", "result": {"collections": [
                {"id": "c1", "name": "Коллекция"},
            ], "count": 1}},
            {"tool": "search", "result": {"documents": [
                {"id": "d1", "title": "Документ", "number": 1},
            ], "count": 1}},
        ]
        from app import build_response
        combined = build_response(results, "Результаты:")
        assert "collections" in combined
        assert "documents" in combined
        assert len(combined["collections"]) == 1
        assert len(combined["documents"]) == 1


class TestAIPromptRules:
    """Tests verifying AI prompt contains critical behavior rules."""

    def test_prompt_forbids_creating_pages_on_search(self):
        """AI prompt must explicitly forbid creating pages when user asks to search."""
        from ai_agent import SYSTEM_PROMPT
        prompt_lower = SYSTEM_PROMPT.lower()
        # Must contain rule about not creating pages during search
        assert "никогда не предлагай создать" in prompt_lower or "никогда не предлагай создавать" in prompt_lower

    def test_prompt_mentions_search_only_read(self):
        """Prompt must say search/find is a READ operation."""
        from ai_agent import SYSTEM_PROMPT
        prompt_lower = SYSTEM_PROMPT.lower()
        assert "чтение" in prompt_lower or "чтения" in prompt_lower

    def test_prompt_says_report_not_found(self):
        """When nothing found, AI should report it, not create pages."""
        from ai_agent import SYSTEM_PROMPT
        assert "не нашёл" in SYSTEM_PROMPT or "не найдена" in SYSTEM_PROMPT or "не найдено" in SYSTEM_PROMPT

    def test_agentic_loop_continuation_message(self):
        """The continuation message in agentic loop should tell AI not to create pages."""
        from app import app
        import inspect
        # Read the source of the chat route to verify the continuation message
        import app as app_module
        source = inspect.getsource(app_module.chat)
        assert "НЕ предлагай создавать новые страницы" in source


class TestDuplicateDocument:
    """Tests for duplicate_document tool in execute_tool()."""

    @patch("app.yonote")
    def test_duplicate_basic(self, mock_yonote):
        mock_yonote.document_duplicate.return_value = {"data": {
            "id": "dup-1", "title": "Копия документа", "url": "/doc/dup-1",
        }}
        mock_yonote.full_url.return_value = "https://x.yonote.ru/doc/dup-1"

        from app import execute_tool
        result = execute_tool("duplicate_document", {"document_id": "orig-1", "title": "Копия документа"})

        mock_yonote.document_duplicate.assert_called_once_with(
            "orig-1", title="Копия документа", publish=True, recursive=False,
        )
        assert result["result"]["document"]["id"] == "dup-1"

    @patch("app.yonote")
    def test_duplicate_recursive(self, mock_yonote):
        mock_yonote.document_duplicate.return_value = {"data": {
            "id": "dup-1", "title": "Copy", "url": "/doc/dup-1",
        }}
        mock_yonote.full_url.return_value = "https://x.yonote.ru/doc/dup-1"

        from app import execute_tool
        execute_tool("duplicate_document", {
            "document_id": "orig-1", "recursive": True,
        })

        mock_yonote.document_duplicate.assert_called_once_with(
            "orig-1", title=None, publish=True, recursive=True,
        )

    @patch("app.yonote")
    def test_duplicate_emits_status_event(self, mock_yonote):
        mock_yonote.document_duplicate.return_value = {"data": {
            "id": "dup-1", "title": "Copy", "url": "/doc/dup-1",
        }}
        mock_yonote.full_url.return_value = "https://x.yonote.ru/doc/dup-1"

        from app import execute_tool
        result = execute_tool("duplicate_document", {"document_id": "orig-1"})

        assert len(result["events"]) == 1
        assert "Дублирую" in result["events"][0]


class TestResolveAttachmentRefs:
    """Tests for resolve_attachment_refs() — converts <attachment:uuid> to redirect URLs."""

    BASE_URL = "https://app.yonote.ru/api"

    def _make_mock_yonote(self):
        mock = MagicMock()
        mock.get_attachment_url.side_effect = (
            lambda uuid: f"{self.BASE_URL}/attachments.redirect?id={uuid}"
        )
        return mock

    @patch("app.yonote")
    def test_single_image_replaced(self, mock_yonote):
        """Single <attachment:uuid> ref is replaced with redirect URL."""
        mock_yonote.get_attachment_url.side_effect = (
            lambda uuid: f"{self.BASE_URL}/attachments.redirect?id={uuid}"
        )
        text = "![Фото](<attachment:abc123>)"
        result = resolve_attachment_refs(text)
        assert result == f"![Фото]({self.BASE_URL}/attachments.redirect?id=abc123)"

    @patch("app.yonote")
    def test_multiple_images_replaced(self, mock_yonote):
        """All <attachment:uuid> refs in text are replaced."""
        mock_yonote.get_attachment_url.side_effect = (
            lambda uuid: f"{self.BASE_URL}/attachments.redirect?id={uuid}"
        )
        text = "![А](<attachment:uuid1>)\n\nТекст\n\n![Б](<attachment:uuid2>)"
        result = resolve_attachment_refs(text)
        assert f"![А]({self.BASE_URL}/attachments.redirect?id=uuid1)" in result
        assert f"![Б]({self.BASE_URL}/attachments.redirect?id=uuid2)" in result
        assert "<attachment:" not in result

    @patch("app.yonote")
    def test_no_attachments_unchanged(self, mock_yonote):
        """Text without attachment refs is returned as-is."""
        mock_yonote.get_attachment_url.side_effect = (
            lambda uuid: f"{self.BASE_URL}/attachments.redirect?id={uuid}"
        )
        text = "Обычный текст без картинок\n\n- пункт 1\n- пункт 2"
        result = resolve_attachment_refs(text)
        assert result == text
        mock_yonote.get_attachment_url.assert_not_called()

    @patch("app.yonote")
    def test_empty_text_returns_unchanged(self, mock_yonote):
        """Empty and None text are returned without error."""
        mock_yonote.get_attachment_url.side_effect = (
            lambda uuid: f"{self.BASE_URL}/attachments.redirect?id={uuid}"
        )
        assert resolve_attachment_refs("") == ""
        assert resolve_attachment_refs(None) is None
        mock_yonote.get_attachment_url.assert_not_called()

    @patch("app.yonote")
    def test_url_format_correct(self, mock_yonote):
        """Resulting URL uses attachments.redirect endpoint with id param."""
        mock_yonote.get_attachment_url.side_effect = (
            lambda uuid: f"{self.BASE_URL}/attachments.redirect?id={uuid}"
        )
        text = "![img](<attachment:deadbeef-1234-5678-abcd-ef0123456789>)"
        result = resolve_attachment_refs(text)
        assert "/attachments.redirect?id=deadbeef-1234-5678-abcd-ef0123456789" in result
        assert "<attachment:" not in result

    @patch("app.yonote")
    def test_normal_image_urls_not_changed(self, mock_yonote):
        """Images with regular HTTP URLs are not touched."""
        mock_yonote.get_attachment_url.side_effect = (
            lambda uuid: f"{self.BASE_URL}/attachments.redirect?id={uuid}"
        )
        text = "![screenshot](https://example.com/image.png)"
        result = resolve_attachment_refs(text)
        assert result == text
        mock_yonote.get_attachment_url.assert_not_called()
