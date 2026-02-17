import json
from unittest.mock import patch, MagicMock
import pytest
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from markdown_processor import parse_markdown_blocks, blocks_to_markdown, blocks_to_yonote_markdown, _is_code_line, _is_url_only, _is_heading_candidate


# ============================================================
# Real Yonote document snippet for testing (from debug_parser)
# ============================================================
YONOTE_SAMPLE = """
Как переносить боковую панель в другие тренинги и уроки
https://disk.yandex.ru/i/EiRHUhT8l_v2tw

Важно!
Не удалять из структуры эти элементы. Если их удалить, боковая панель может работать некорректно
![Untitled](<attachment:4abd716d-c30c-4e59-bfcc-6b53dafaad31>)
Как сделать открытие ссылок в новом окне?
Необходимо кликнуть на блок с ссылкой. Найти поле onClick и ввести window.open('сюда вписать вашу ссылку')
![Untitled](<attachment:7e4241ba-4415-4296-a536-b548a56d950b>)
Кнопки https://disk.yandex.ru/i/0IzyDeThom4P_w
Полезные ссылки https://disk.yandex.ru/i/InlzbsRaq9pWbQ
Классы для иконок
После вставки в «Класс html-элемента» будет меняться иконка.
![Untitled](<attachment:e4f6da64-dfae-4d9c-b07a-1e8c4fb68456>)
remake-link-button
remake-chain-button
Изменить название ссылки «Тренинги»
Необходимо добавить в блок Extra Scripts код ниже.
Код находится в: Сайт → Темы → JS
/**********************************
 * START — Изменить слово «Тренинги»
 **********************************/
/*
  LEFT_MENU — левое меню
  ├── '.menu-item-teach .submenu-item-trainings span:not(.submenu-notify-count)'

  BREADCRUMBS — хлебные крошки
  ├── '.header-box .breadcrumbs a:first-child'
  └── '.breadcrumb li:first-child a'
*/

const REPLACE_TEXT={
    LEFT_MENU:"Мои курсы",
    BREADCRUMBS:"Курсы",
    ANSWERS_PAGE:"Все курсы"
};
function f(s,t){let i=setInterval(()=>{if($(s).length){clearInterval(i),$(s).text(t)}},100)}

/**********************************
 * End — Изменить слово «Тренинги»
 **********************************/
Для чего нужна кнопка switch remake?
Кнопка нужна, чтобы переключить видимость оформления.
""".strip()


class TestIsCodeLine:
    def test_js_comment_start(self):
        assert _is_code_line("/**********************************") is True

    def test_js_comment_star(self):
        assert _is_code_line(" * START — Изменить слово") is True

    def test_js_comment_end(self):
        assert _is_code_line(" **********************************/") is True

    def test_const_declaration(self):
        assert _is_code_line("const REPLACE_TEXT={") is True

    def test_function_declaration(self):
        assert _is_code_line("function f(s,t){let i=setInterval(") is True

    def test_jquery(self):
        assert _is_code_line("$(s).text(t)") is True

    def test_window(self):
        assert _is_code_line("window.PageChecker.isOneTrainingPage") is True

    def test_tree_diagram(self):
        assert _is_code_line("  ├── '.menu-item-teach .submenu-item'") is True
        assert _is_code_line("  └── '.breadcrumb li:first-child a'") is True

    def test_semicolon_ending(self):
        assert _is_code_line("ANSWERS_PAGE:\"Все курсы\"};") is True

    def test_normal_text_not_code(self):
        assert _is_code_line("Как переносить боковую панель") is False

    def test_normal_text_with_punctuation(self):
        assert _is_code_line("Важно! Не удалять эти элементы.") is False

    def test_empty_line(self):
        assert _is_code_line("") is False

    def test_css_class_name_alone(self):
        """CSS class names like remake-link-button should be detected as code."""
        assert _is_code_line("remake-link-button") is True
        assert _is_code_line("remake-chain-button") is True
        assert _is_code_line("remake-icon-tg-3") is True
        assert _is_code_line("remake-ruble-button-2") is True

    def test_upper_case_key_value(self):
        """JS object properties like LEFT_MENU:'value' should be detected as code."""
        assert _is_code_line('    LEFT_MENU:"Мои курсы",') is True
        assert _is_code_line('    BREADCRUMBS:"Курсы",') is True
        assert _is_code_line('    ANSWERS_PAGE:"Все курсы"') is True

    def test_upper_case_label_with_dash(self):
        """Code comment labels like LEFT_MENU — description should be detected as code."""
        assert _is_code_line("  LEFT_MENU — левое меню") is True
        assert _is_code_line("  BREADCRUMBS — хлебные крошки") is True
        assert _is_code_line("  ANSWERS_PAGE — страница «Лента ответов»") is True

    def test_normal_cyrillic_not_matched_as_upper_case(self):
        """Cyrillic uppercase text should NOT match UPPER_CASE patterns."""
        assert _is_code_line("ВАЖНО! Не удалять") is False
        assert _is_code_line("Классы для иконок") is False


class TestIsUrlOnly:
    def test_url(self):
        assert _is_url_only("https://disk.yandex.ru/i/abc123") is True

    def test_url_with_spaces(self):
        assert _is_url_only("  https://disk.yandex.ru/i/abc123  ") is True

    def test_text_with_url(self):
        assert _is_url_only("Кнопки https://disk.yandex.ru/i/abc") is False

    def test_plain_text(self):
        assert _is_url_only("Обычный текст") is False


class TestParseMarkdownBlocks:
    def test_empty_text(self):
        assert parse_markdown_blocks("") == []
        assert parse_markdown_blocks(None) == []

    def test_single_line(self):
        blocks = parse_markdown_blocks("Hello world")
        assert len(blocks) == 1
        assert blocks[0]["type"] == "line"
        assert blocks[0]["translatable"] is True

    def test_heading(self):
        blocks = parse_markdown_blocks("## My Heading")
        assert len(blocks) == 1
        assert blocks[0]["type"] == "heading"
        assert blocks[0]["translatable"] is True

    def test_fenced_code_block(self):
        text = "```javascript\nconst x = 1;\n```"
        blocks = parse_markdown_blocks(text)
        assert len(blocks) == 1
        assert blocks[0]["type"] == "code_block"
        assert blocks[0]["translatable"] is False

    def test_image(self):
        blocks = parse_markdown_blocks("![Screenshot](<attachment:abc123>)")
        assert len(blocks) == 1
        assert blocks[0]["type"] == "image"
        assert blocks[0]["translatable"] is False

    def test_url_only_line(self):
        blocks = parse_markdown_blocks("https://disk.yandex.ru/i/abc123")
        assert len(blocks) == 1
        assert blocks[0]["type"] == "url"
        assert blocks[0]["translatable"] is False

    def test_empty_lines(self):
        text = "Hello\n\nWorld"
        blocks = parse_markdown_blocks(text)
        types = [b["type"] for b in blocks]
        assert types == ["line", "empty", "line"]

    def test_each_line_is_separate_block(self):
        """Key feature: lines don't merge into multi-line paragraphs."""
        text = "Line one\nLine two\nLine three"
        blocks = parse_markdown_blocks(text)
        assert len(blocks) == 3
        assert all(b["type"] == "line" for b in blocks)
        assert blocks[0]["content"] == "Line one"
        assert blocks[1]["content"] == "Line two"
        assert blocks[2]["content"] == "Line three"

    def test_horizontal_rule(self):
        blocks = parse_markdown_blocks("---")
        assert len(blocks) == 1
        assert blocks[0]["type"] == "horizontal_rule"
        assert blocks[0]["translatable"] is False

    def test_unfenced_code_detection(self):
        """JavaScript code without ``` fences should be detected as code."""
        text = """/**********************************
 * START — Изменить слово «Тренинги»
 **********************************/
/*
  LEFT_MENU — левое меню
  ├── '.menu-item-teach .submenu-item-trainings span:not(.submenu-notify-count)'
*/

const REPLACE_TEXT={
    LEFT_MENU:"Мои курсы",
    BREADCRUMBS:"Курсы",
};
function f(s,t){let i=setInterval(()=>{if($(s).length){clearInterval(i),$(s).text(t)}},100)}

/**********************************
 * End — Изменить слово «Тренинги»
 **********************************/"""
        blocks = parse_markdown_blocks(text)
        code_blocks = [b for b in blocks if b["type"] == "code_block"]

        # All of this should be detected as code
        assert len(code_blocks) >= 1
        # None should be translatable
        for cb in code_blocks:
            assert cb["translatable"] is False

        # Verify no code lines leaked as translatable
        translatable = [b for b in blocks if b["translatable"]]
        for tb in translatable:
            assert "const " not in tb["content"]
            assert "function " not in tb["content"]
            assert "├──" not in tb["content"]

    def test_url_line_not_translated(self):
        text = "Как переносить панель\nhttps://disk.yandex.ru/i/abc123\n\nСледующая тема"
        blocks = parse_markdown_blocks(text)
        url_blocks = [b for b in blocks if b["type"] == "url"]
        assert len(url_blocks) == 1
        assert url_blocks[0]["translatable"] is False

    def test_mixed_text_and_url_on_same_line(self):
        """Line with text AND url should be translatable (not url-only)."""
        text = "Кнопки https://disk.yandex.ru/i/abc123"
        blocks = parse_markdown_blocks(text)
        assert len(blocks) == 1
        assert blocks[0]["type"] == "line"
        assert blocks[0]["translatable"] is True


class TestYonoteSampleDocument:
    """Test parsing of real Yonote document structure."""

    def test_code_not_translatable(self):
        blocks = parse_markdown_blocks(YONOTE_SAMPLE)
        translatable = [b for b in blocks if b["translatable"]]

        # JavaScript code should NOT appear in translatable blocks
        for block in translatable:
            content = block["content"]
            assert "const REPLACE_TEXT" not in content, f"Code leaked into translatable block: {content[:80]}"
            assert "function f(s,t)" not in content, f"Code leaked into translatable block: {content[:80]}"
            assert "├──" not in content, f"Tree diagram leaked into translatable block: {content[:80]}"
            assert "*****" not in content, f"Comment border leaked into translatable block: {content[:80]}"

    def test_css_classes_not_translatable(self):
        """CSS class names like remake-link-button should NOT be sent for translation."""
        blocks = parse_markdown_blocks(YONOTE_SAMPLE)
        translatable = [b for b in blocks if b["translatable"]]
        translatable_texts = "\n".join(b["content"] for b in translatable)

        assert "remake-link-button" not in translatable_texts
        assert "remake-chain-button" not in translatable_texts

    def test_js_object_properties_not_translatable(self):
        """JS object properties like LEFT_MENU:'value' should NOT be translated."""
        blocks = parse_markdown_blocks(YONOTE_SAMPLE)
        translatable = [b for b in blocks if b["translatable"]]
        translatable_texts = "\n".join(b["content"] for b in translatable)

        assert 'LEFT_MENU:"Мои курсы"' not in translatable_texts
        assert 'BREADCRUMBS:"Курсы"' not in translatable_texts
        assert 'ANSWERS_PAGE:"Все курсы"' not in translatable_texts

    def test_js_comment_labels_not_translatable(self):
        """Labels inside JS comments (LEFT_MENU — описание) should NOT be translated."""
        blocks = parse_markdown_blocks(YONOTE_SAMPLE)
        translatable = [b for b in blocks if b["translatable"]]
        translatable_texts = "\n".join(b["content"] for b in translatable)

        assert "LEFT_MENU — левое меню" not in translatable_texts
        assert "BREADCRUMBS — хлебные крошки" not in translatable_texts

    def test_urls_not_translatable(self):
        blocks = parse_markdown_blocks(YONOTE_SAMPLE)
        translatable = [b for b in blocks if b["translatable"]]

        for block in translatable:
            # Standalone URLs should not be in translatable blocks
            if block["content"].strip().startswith("https://"):
                # This should only happen if the line has text before the URL
                assert not _is_url_only(block["content"]), \
                    f"URL-only line in translatable: {block['content'][:80]}"

    def test_images_not_translatable(self):
        blocks = parse_markdown_blocks(YONOTE_SAMPLE)
        images = [b for b in blocks if b["type"] == "image"]
        assert len(images) >= 3
        for img in images:
            assert img["translatable"] is False

    def test_text_lines_translatable(self):
        blocks = parse_markdown_blocks(YONOTE_SAMPLE)
        translatable = [b for b in blocks if b["translatable"]]

        # These human-readable lines should be translatable
        translatable_texts = "\n".join(b["content"] for b in translatable)
        assert "Как переносить боковую панель" in translatable_texts
        assert "Важно!" in translatable_texts
        assert "Для чего нужна кнопка switch remake?" in translatable_texts

    def test_roundtrip_preserves_content(self):
        blocks = parse_markdown_blocks(YONOTE_SAMPLE)
        result = blocks_to_markdown(blocks)
        assert result == YONOTE_SAMPLE


class TestBlocksToMarkdown:
    def test_roundtrip_simple(self):
        text = "# Hello\n\nWorld"
        blocks = parse_markdown_blocks(text)
        result = blocks_to_markdown(blocks)
        assert result == text

    def test_roundtrip_with_code(self):
        text = "Text\n\n```js\nconst x = 1;\n```\n\nMore text"
        blocks = parse_markdown_blocks(text)
        result = blocks_to_markdown(blocks)
        assert result == text


class TestBlocksToYonoteMarkdown:
    """Test blocks_to_yonote_markdown — formatted output for Yonote document creation."""

    def test_lines_separated_by_double_newline(self):
        """Each line becomes a separate paragraph in Yonote."""
        text = "Line one\nLine two\nLine three"
        blocks = parse_markdown_blocks(text)
        result = blocks_to_yonote_markdown(blocks)
        # First line becomes heading (after None = start of doc), rest are normal lines
        assert result == "## Line one\n\nLine two\n\nLine three"

    def test_unfenced_code_gets_fences(self):
        """Detected code blocks get wrapped in ``` fences."""
        text = "Text\nconst x = 1;\nfunction foo() {}\nMore text"
        blocks = parse_markdown_blocks(text)
        result = blocks_to_yonote_markdown(blocks)
        assert "```\nconst x = 1;\nfunction foo() {}\n```" in result
        assert "Text" in result
        assert "More text" in result

    def test_already_fenced_code_not_double_wrapped(self):
        """Already fenced code blocks should NOT get double-wrapped."""
        text = "Text\n\n```js\nconst x = 1;\n```\n\nMore"
        blocks = parse_markdown_blocks(text)
        result = blocks_to_yonote_markdown(blocks)
        assert "```js\nconst x = 1;\n```" in result
        # Should NOT have ``` around the whole thing again
        assert "```\n```js" not in result

    def test_empty_blocks_skipped(self):
        """Empty blocks are skipped — paragraph breaks come from \\n\\n join."""
        text = "Hello\n\nWorld"
        blocks = parse_markdown_blocks(text)
        result = blocks_to_yonote_markdown(blocks)
        # Both are heading candidates (first after None, second after empty)
        assert result == "## Hello\n\n## World"

    def test_url_line_separate_paragraph(self):
        """URL-only lines become separate paragraphs, formatted as links."""
        text = "Title\nhttps://example.com\nNext line"
        blocks = parse_markdown_blocks(text)
        result = blocks_to_yonote_markdown(blocks)
        # Title = heading (first block), URL = formatted link, Next line = after URL = heading
        assert "## Title" in result
        assert "[https://example.com](https://example.com)" in result
        assert "## Next line" in result

    def test_image_preserved(self):
        """Images are preserved as-is."""
        text = "Text\n![img](<attachment:abc>)\nMore"
        blocks = parse_markdown_blocks(text)
        result = blocks_to_yonote_markdown(blocks)
        assert "![img](<attachment:abc>)" in result

    def test_yonote_sample_has_code_fences(self):
        """Real Yonote sample output should have ``` fences around JS code."""
        blocks = parse_markdown_blocks(YONOTE_SAMPLE)
        result = blocks_to_yonote_markdown(blocks)
        # JS code should be wrapped in fences
        assert "```\n/*" in result or "```\n/**" in result
        # Text lines should NOT be inside fences
        assert "Как переносить боковую панель" in result
        assert "Для чего нужна кнопка switch remake?" in result

    def test_yonote_sample_css_classes_in_code_block(self):
        """CSS class names should be inside a code block."""
        blocks = parse_markdown_blocks(YONOTE_SAMPLE)
        result = blocks_to_yonote_markdown(blocks)
        # CSS classes should be inside ``` fences
        assert "```\nremake-link-button" in result or "remake-link-button\n" in result

    def test_headings_detected(self):
        """Short lines after section breaks should become ## headings."""
        blocks = parse_markdown_blocks(YONOTE_SAMPLE)
        result = blocks_to_yonote_markdown(blocks)
        # These should be detected as headings
        assert "## Как переносить боковую панель" in result
        assert "## Важно!" in result
        assert "## Для чего нужна кнопка switch remake?" in result

    def test_sentences_not_headings(self):
        """Long lines or lines ending with period should NOT become headings."""
        blocks = parse_markdown_blocks(YONOTE_SAMPLE)
        result = blocks_to_yonote_markdown(blocks)
        # These should NOT be headings
        assert "## Не удалять из структуры" not in result
        assert "## После вставки" not in result
        assert "## Необходимо добавить" not in result

    def test_urls_formatted_as_links(self):
        """Standalone URLs should be formatted as clickable markdown links."""
        blocks = parse_markdown_blocks(YONOTE_SAMPLE)
        result = blocks_to_yonote_markdown(blocks)
        assert "[https://disk.yandex.ru/i/EiRHUhT8l_v2tw](https://disk.yandex.ru/i/EiRHUhT8l_v2tw)" in result

    def test_text_with_url_not_formatted_as_link(self):
        """Lines with text + URL should NOT be reformatted."""
        text = "Кнопки https://example.com/test"
        blocks = parse_markdown_blocks(text)
        result = blocks_to_yonote_markdown(blocks)
        # Should stay as-is (line type, not url type)
        assert result == "Кнопки https://example.com/test"


class TestIsHeadingCandidate:
    def test_after_empty_short_no_period(self):
        assert _is_heading_candidate("Заголовок раздела", "empty", None) is True

    def test_after_image(self):
        assert _is_heading_candidate("Название секции", "image", "![img](url)") is True

    def test_after_url(self):
        assert _is_heading_candidate("Новый раздел", "url", "https://example.com") is True

    def test_after_code_block(self):
        assert _is_heading_candidate("Описание кода", "code_block", "const x = 1;") is True

    def test_after_text_line_not_heading(self):
        assert _is_heading_candidate("Продолжение текста", "line", "Обычный текст") is False

    def test_after_text_line_with_url_is_heading(self):
        assert _is_heading_candidate("Новый раздел", "line", "Кнопки https://example.com") is True

    def test_ends_with_period_not_heading(self):
        assert _is_heading_candidate("Это предложение.", "empty", None) is False

    def test_too_long_not_heading(self):
        long_text = "Это очень длинный текст " * 10
        assert _is_heading_candidate(long_text, "empty", None) is False

    def test_contains_url_not_heading(self):
        assert _is_heading_candidate("Кнопки https://example.com", "empty", None) is False

    def test_first_block_is_heading(self):
        assert _is_heading_candidate("Первый заголовок", None, None) is True


class TestTranslateDocumentStreaming:
    """Test execute_translate_streaming with mocked API."""

    @patch("markdown_processor.translate_text_via_api")
    @patch("markdown_processor.translate_heading")
    @patch("app.yonote")
    def test_translate_streaming_yields_events(self, mock_yonote, mock_heading, mock_text):
        mock_yonote.document_info.return_value = {
            "data": {"id": "d1", "title": "Оригинал", "text": "## Заголовок\n\nТекст", "url": "/doc/d1"}
        }
        mock_heading.return_value = "## Heading"
        mock_text.return_value = "Text"
        mock_yonote.document_create.return_value = {
            "data": {"id": "new1", "title": "Оригинал (English)", "url": "/doc/new1"}
        }
        mock_yonote.collections_list.return_value = {"data": [{"id": "c1"}]}

        from app import execute_translate_streaming

        events = []
        result = None
        for item in execute_translate_streaming({
            "document_id": "d1",
            "target_language": "English",
        }):
            if isinstance(item, dict):
                result = item["_result"]
            else:
                events.append(item)

        assert len(events) >= 3
        assert result is not None
        assert result["document"]["title"] == "Оригинал (English)"

    @patch("markdown_processor.translate_text_via_api")
    @patch("app.yonote")
    def test_code_not_sent_for_translation(self, mock_yonote, mock_text):
        """Code blocks should not be sent to translation API."""
        mock_yonote.document_info.return_value = {
            "data": {
                "id": "d1", "title": "Doc", "url": "/doc/d1",
                "text": "Text line\n\nconst x = 1;\nfunction foo() {}\n\nAnother line",
            }
        }
        mock_text.return_value = "Translated"
        mock_yonote.document_create.return_value = {
            "data": {"id": "new1", "title": "Doc (EN)", "url": "/doc/new1"}
        }
        mock_yonote.collections_list.return_value = {"data": [{"id": "c1"}]}

        from app import execute_translate_streaming

        for item in execute_translate_streaming({
            "document_id": "d1",
            "target_language": "English",
        }):
            pass

        # translate_text_via_api should only be called for text lines, not code
        for call in mock_text.call_args_list:
            text_arg = call[0][0]
            assert "const x = 1" not in text_arg
            assert "function foo" not in text_arg

    @patch("app.yonote")
    def test_execute_action_streaming_non_translate(self, mock_yonote):
        mock_yonote.documents_search.return_value = {
            "data": [{"document": {"id": "d1", "title": "Found", "text": "t", "url": "/doc/d1"}}]
        }

        from app import execute_action_streaming

        results = []
        for evt, result in execute_action_streaming({
            "tool": "search",
            "params": {"query": "test"},
        }):
            if result:
                results.append(result)

        assert len(results) == 1
        assert results[0]["tool"] == "search"
