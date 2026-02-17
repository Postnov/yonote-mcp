"""Markdown block parser and translator.

Splits markdown documents into typed blocks and translates only text content
while preserving structure programmatically.

Handles Yonote documents where the API returns text WITHOUT standard markdown
formatting (no # headings, no ``` code fences) — detects code and structure
heuristically.
"""

import re
import requests


# Patterns that indicate a line is code (not natural language)
CODE_PATTERNS = [
    re.compile(r'^\s*/\*'),            # /* comment start
    re.compile(r'^\s*\*/', ),          # */ comment end
    re.compile(r'^\s*\*\s'),           # * inside block comment (but not markdown list)
    re.compile(r'^\s*//'),             # // comment
    re.compile(r'^\s*(const|let|var|function|class|import|export|return|if|else|for|while|switch|case)\b'),
    re.compile(r'^\s*\}'),             # closing brace
    re.compile(r'.*=>\s*\{'),          # arrow function
    re.compile(r'.*\{\s*$'),           # line ending with {
    re.compile(r'^\s*[\w.]+\('),       # function call: foo( or obj.method(
    re.compile(r'^\s*\$\('),           # jQuery: $(
    re.compile(r'^\s*window\.'),       # window.
    re.compile(r'^\s*document\.'),     # document.
    re.compile(r'.*;\s*$'),            # line ending with semicolon
    re.compile(r'^\s*├──\s'),          # tree diagram ├──
    re.compile(r'^\s*└──\s'),          # tree diagram └──
    # CSS class names: single hyphenated lowercase identifier (e.g. remake-link-button)
    re.compile(r'^[a-z][a-z0-9]*(-[a-z0-9]+)+$'),
    # UPPER_CASE key:value — JS object property (e.g. LEFT_MENU:"Мои курсы",)
    re.compile(r'^\s*[A-Z][A-Z_0-9]+\s*[:=]'),
    # UPPER_CASE label with em/en-dash — code comment label (e.g. LEFT_MENU — левое меню)
    re.compile(r'^\s*[A-Z][A-Z_0-9]+\s*[—–]'),
]

# URL-only line pattern
URL_ONLY_PATTERN = re.compile(r'^\s*https?://\S+\s*$')


def _is_code_line(line):
    """Check if a line looks like code rather than natural text."""
    stripped = line.strip()
    if not stripped:
        return False
    for pattern in CODE_PATTERNS:
        if pattern.match(line):
            return True
    # Line is mostly special characters (code-like)
    if stripped and len(stripped) > 3:
        alpha_ratio = sum(1 for c in stripped if c.isalpha()) / len(stripped)
        if alpha_ratio < 0.3 and not URL_ONLY_PATTERN.match(line):
            return True
    return False


def _is_url_only(line):
    """Check if a line is just a URL."""
    return bool(URL_ONLY_PATTERN.match(line))


def parse_markdown_blocks(text):
    """Parse markdown/text into a list of typed blocks.

    Each block is a dict with:
      - type: 'heading', 'code_block', 'image', 'line', 'empty', 'horizontal_rule', 'url'
      - content: the raw text of the block
      - translatable: whether this block should be translated

    Key design: each non-empty line becomes its own block to prevent
    the translator from merging lines together.
    """
    if not text:
        return []

    blocks = []
    lines = text.split("\n")
    i = 0

    while i < len(lines):
        line = lines[i]

        # Empty line
        if line.strip() == "":
            blocks.append({"type": "empty", "content": "", "translatable": False})
            i += 1
            continue

        # Fenced code block (``` or ~~~)
        code_match = re.match(r'^(`{3,}|~{3,})(.*)', line)
        if code_match:
            fence = code_match.group(1)
            fence_char = fence[0]
            fence_len = len(fence)
            code_lines = [line]
            i += 1
            while i < len(lines):
                code_lines.append(lines[i])
                if re.match(rf'^{re.escape(fence_char)}{{{fence_len},}}\s*$', lines[i]):
                    i += 1
                    break
                i += 1
            blocks.append({
                "type": "code_block",
                "content": "\n".join(code_lines),
                "translatable": False,
            })
            continue

        # Image line: ![alt](url)
        if re.match(r'^!\[', line.strip()):
            blocks.append({"type": "image", "content": line, "translatable": False})
            i += 1
            continue

        # Heading: # ... ## ... ### ...
        if re.match(r'^#{1,6}\s', line):
            blocks.append({"type": "heading", "content": line, "translatable": True})
            i += 1
            continue

        # Horizontal rule: --- or *** or ___
        if re.match(r'^(\*{3,}|-{3,}|_{3,})\s*$', line.strip()):
            blocks.append({"type": "horizontal_rule", "content": line, "translatable": False})
            i += 1
            continue

        # Heuristic: unfenced code block (consecutive code-like lines)
        if _is_code_line(line):
            code_lines = [line]
            i += 1
            while i < len(lines):
                l = lines[i]
                if l.strip() == "":
                    # Allow empty lines inside code blocks
                    # Check if the next non-empty line is also code
                    lookahead = i + 1
                    while lookahead < len(lines) and lines[lookahead].strip() == "":
                        lookahead += 1
                    if lookahead < len(lines) and _is_code_line(lines[lookahead]):
                        code_lines.append(l)
                        i += 1
                        continue
                    else:
                        break
                elif re.match(r'^!\[', l.strip()):
                    # Image line — always break code block, images are never code
                    break
                elif _is_code_line(l):
                    code_lines.append(l)
                    i += 1
                else:
                    # Non-code line — check if code continues within next 2 lines
                    # (handles text-like lines inside code blocks, e.g. labels in comments)
                    # But never bridge across images
                    found_code_ahead = False
                    for k in range(1, 3):
                        next_idx = i + k
                        if next_idx < len(lines):
                            next_line = lines[next_idx]
                            if re.match(r'^!\[', next_line.strip()):
                                break  # Don't bridge across images
                            if _is_code_line(next_line):
                                found_code_ahead = True
                                break
                    if found_code_ahead:
                        code_lines.append(l)
                        i += 1
                    else:
                        break
            blocks.append({
                "type": "code_block",
                "content": "\n".join(code_lines),
                "translatable": False,
            })
            continue

        # URL-only line
        if _is_url_only(line):
            blocks.append({"type": "url", "content": line, "translatable": False})
            i += 1
            continue

        # Regular line — each line is its own block to prevent merging
        blocks.append({
            "type": "line",
            "content": line,
            "translatable": True,
        })
        i += 1

    return blocks


def blocks_to_markdown(blocks):
    """Reassemble blocks back into markdown text (preserves original structure)."""
    return "\n".join(block["content"] for block in blocks)


def _is_heading_candidate(content, prev_type, prev_content):
    """Check if a text line should be formatted as a heading in Yonote output.

    Yonote API doesn't include # heading markers. We detect heading-like lines
    by position and content: short lines after section breaks (empty, image, url,
    code_block) that don't end with period and don't contain URLs.
    """
    stripped = content.strip()
    if not stripped:
        return False
    # Too long for a heading
    if len(stripped) > 100:
        return False
    # Sentences end with periods or commas — not headings
    if stripped.endswith(".") or stripped.endswith(","):
        return False
    # Lines with URLs are typically "label https://..." — not headings
    if "://" in stripped:
        return False
    # Must be after a section break, not a continuation of text
    section_break_types = (None, "empty", "image", "url", "code_block", "horizontal_rule")
    if prev_type in section_break_types:
        return True
    # After a text line that contains a URL (e.g. "Кнопки https://...")
    if prev_type == "line" and prev_content and "://" in prev_content:
        return True
    return False


def blocks_to_yonote_markdown(blocks):
    """Convert blocks to formatted markdown for Yonote document creation.

    Yonote API returns document text as plain text (single \\n between lines),
    but when CREATING a document, Yonote treats the text as markdown where
    single \\n doesn't create line breaks. So we need:
    - \\n\\n between all blocks (paragraph breaks)
    - ``` fences around detected code blocks
    - ## prefix for detected heading-like lines
    - [url](url) for standalone URLs
    - Skip empty blocks (we already add paragraph breaks between all blocks)
    """
    parts = []
    prev_type = None
    prev_content = None

    for block in blocks:
        btype = block["type"]
        content = block["content"]

        if btype == "empty":
            prev_type = btype
            prev_content = None
            continue

        if btype == "code_block":
            # Wrap in ``` fences if not already fenced
            if not content.startswith("```") and not content.startswith("~~~"):
                content = f"```\n{content}\n```"
            parts.append(content)
        elif btype == "url":
            # Format as clickable markdown link
            url = content.strip()
            parts.append(f"[{url}]({url})")
        elif btype == "line":
            # Check if this line looks like a heading
            if _is_heading_candidate(content, prev_type, prev_content):
                parts.append(f"## {content}")
            else:
                parts.append(content)
        else:
            parts.append(content)

        prev_type = btype
        prev_content = content

    return "\n\n".join(parts)


def translate_text_via_api(text, target_language, api_key, model="deepseek-chat"):
    """Translate a text snippet using DeepSeek API.

    Preserves inline markdown: **bold**, *italic*, [links](url), `code`.
    """
    if not text or not text.strip():
        return text

    prompt = f"""Translate the following text to {target_language}.

RULES:
- Translate ONLY the human-readable text
- Keep ALL markdown syntax exactly as-is: **bold**, *italic*, `inline code`, [link text](url)
- In markdown links [text](url) — translate only the text inside [], keep URL unchanged
- Keep ALL URLs (https://...) unchanged
- Keep inline code `like this` unchanged
- Keep special characters and punctuation
- Do NOT add or remove any markdown formatting
- Return ONLY the translated text, nothing else

Text to translate:
{text}"""

    response = requests.post(
        "https://api.deepseek.com/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json={
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.2,
            "max_tokens": 4000,
        },
        timeout=30,
    )
    response.raise_for_status()
    data = response.json()
    return data["choices"][0]["message"]["content"].strip()


def translate_heading(heading_line, target_language, api_key, model="deepseek-chat"):
    """Translate a heading while preserving the ## prefix."""
    match = re.match(r'^(#{1,6}\s+)(.*)', heading_line)
    if not match:
        return heading_line
    prefix = match.group(1)
    text = match.group(2)
    translated = translate_text_via_api(text, target_language, api_key, model)
    return f"{prefix}{translated}"


def translate_document_blocks(text, target_language, api_key, model="deepseek-chat", status_callback=None):
    """Translate a full markdown document preserving structure.

    Args:
        text: Original markdown text
        target_language: Target language (e.g. "English", "Russian")
        api_key: DeepSeek API key
        model: DeepSeek model name
        status_callback: Optional callable(message) for progress updates

    Returns:
        Translated markdown text with preserved structure
    """
    blocks = parse_markdown_blocks(text)

    if status_callback:
        translatable_count = sum(1 for b in blocks if b["translatable"])
        status_callback(f"Перевожу... (блоков: {translatable_count})")

    translated_blocks = []
    for block in blocks:
        if not block["translatable"]:
            translated_blocks.append(block.copy())
            continue

        new_block = block.copy()

        if block["type"] == "heading":
            new_block["content"] = translate_heading(
                block["content"], target_language, api_key, model
            )
        else:
            # 'line' type — translate as single line
            new_block["content"] = translate_text_via_api(
                block["content"], target_language, api_key, model
            )

        translated_blocks.append(new_block)

    return blocks_to_yonote_markdown(translated_blocks)
