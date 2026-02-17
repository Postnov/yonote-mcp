import os
import json
import re
from flask import Flask, render_template, request, jsonify, Response, stream_with_context
from dotenv import load_dotenv
from yonote_client import YonoteClient
from ai_agent import AIAgent
from markdown_processor import translate_document_blocks

load_dotenv()

app = Flask(__name__)

API_TOKEN = os.getenv("API_TOKEN")
API_BASE_URL = os.getenv("API_BASE_URL", "https://app.yonote.ru/api")
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY")

yonote = YonoteClient(API_TOKEN, API_BASE_URL)
agent = AIAgent(DEEPSEEK_API_KEY)

# Store pending actions awaiting user confirmation
pending_actions_store = {"actions": None}


def format_text_for_yonote(text):
    """Post-process text before sending to Yonote API.

    Fixes common AI formatting issues:
    - Multiple URLs on one line get split into a markdown list
    """
    if not text:
        return text

    lines = text.split("\n")
    result_lines = []

    for line in lines:
        # Find all URLs in this line
        urls = re.findall(r'https?://\S+', line)
        if len(urls) >= 2:
            # Multiple URLs on one line — split into a markdown list
            # Extract non-URL text parts
            remaining = line
            prefix_parts = []
            for url in urls:
                idx = remaining.find(url)
                before = remaining[:idx].strip()
                if before:
                    prefix_parts.append(before)
                remaining = remaining[idx + len(url):]
            # Trailing text after last URL
            trailing = remaining.strip()

            # Add prefix text (e.g. "Найдены ссылки:") as separate line
            if prefix_parts:
                prefix_text = " ".join(prefix_parts)
                result_lines.append(prefix_text)
                result_lines.append("")  # empty line before list

            # Add each URL as a markdown list item with clickable link
            for url in urls:
                # Clean trailing punctuation that's not part of URL
                clean_url = url.rstrip(".,;:!?)")
                result_lines.append(f"- [{clean_url}]({clean_url})")

            if trailing:
                result_lines.append("")
                result_lines.append(trailing)
        else:
            result_lines.append(line)

    return "\n".join(result_lines)


def resolve_attachment_refs(text):
    """Replace <attachment:uuid> image refs with proper redirect URLs.

    Converts: ![alt](<attachment:abc123>)
    To:       ![alt](https://app.yonote.ru/api/attachments.redirect?id=abc123)

    This allows images to display in new documents. The attachment redirect
    URL works for logged-in users via session cookie authentication.
    """
    if not text:
        return text

    pattern = re.compile(r'(!\[[^\]]*\])\(<attachment:([^>]+)>\)')

    def replace_ref(match):
        img_prefix = match.group(1)   # ![alt text]
        uuid = match.group(2)
        url = yonote.get_attachment_url(uuid)
        return f'{img_prefix}({url})'

    return pattern.sub(replace_ref, text)


@app.route("/")
def index():
    return render_template("index.html")


def sse_event(event_type, data):
    """Format a Server-Sent Event."""
    return f"event: {event_type}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


@app.route("/api/chat", methods=["POST"])
def chat():
    """Process user message through AI agent and execute Yonote actions."""
    body = request.get_json()
    message = body.get("message", "").strip()
    if not message:
        return jsonify({"error": "Empty message"}), 400

    def generate():
        try:
            # Step 1: AI thinks about what to do
            yield sse_event("status", {"message": "Думаю..."})
            plan = agent.process_message(message)

            # Agentic loop: execute read actions, feed results back to AI, repeat
            max_iterations = 10
            final_results = []

            for iteration in range(max_iterations):
                thinking = plan.get("thinking", "")
                actions = plan.get("actions", [])
                pending = plan.get("pending_actions", [])
                response_template = plan.get("response_template", "")

                if not actions and pending:
                    # AI proposes mutating actions — ask user for confirmation
                    pending_actions_store["actions"] = pending
                    yield sse_event("confirm", {"message": response_template, "pending_actions": pending})
                    yield sse_event("done", {})
                    return

                if not actions:
                    # No more actions — respond with what we have
                    combined = build_response(final_results, response_template)
                    yield sse_event("result", combined)
                    yield sse_event("done", {})
                    return

                # Execute actions
                all_results = []
                read_tools = ("search", "list_collections", "list_documents", "document_info", "list_drafts", "list_viewed")
                has_only_read_actions = all(
                    a.get("tool") in read_tools
                    for a in actions
                )

                for action in actions:
                    for evt, result in execute_action_streaming(action):
                        if evt:
                            yield evt
                        if result:
                            all_results.append(result)

                final_results.extend(all_results)

                # Feed results back to AI context
                results_json = json.dumps(all_results, ensure_ascii=False, default=str)
                agent.add_context("user", f"Результаты выполнения: {results_json}")

                # If these were only read actions, ask AI for next step
                if has_only_read_actions:
                    yield sse_event("status", {"message": "Анализирую результаты..."})
                    plan = agent.process_message("Продолжай на основе полученных результатов. Если нужны дальнейшие действия — предложи их. Если задача выполнена — ответь пользователю.")
                    continue

                # Write actions executed — we're done
                combined = build_response(all_results, response_template)
                yield sse_event("result", combined)
                yield sse_event("done", {})
                return

            # Max iterations reached — respond with what we have
            yield sse_event("result", {"message": response_template or "Готово!"})
            yield sse_event("done", {})

        except Exception as e:
            yield sse_event("error", {"message": f"Ошибка: {str(e)}"})
            yield sse_event("done", {})

    return Response(
        stream_with_context(generate()),
        mimetype="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.route("/api/confirm", methods=["POST"])
def confirm_action():
    """Execute previously proposed pending actions after user confirmation."""
    actions = pending_actions_store.get("actions")
    if not actions:
        return jsonify({"error": "Нет действий для подтверждения"}), 400

    pending_actions_store["actions"] = None

    def generate():
        try:
            all_results = []
            for action in actions:
                for evt, result in execute_action_streaming(action):
                    if evt:
                        yield evt
                    if result:
                        all_results.append(result)

            # Add confirmation to AI context
            agent.add_context("user", "Пользователь подтвердил действие.")
            agent.add_context("user", f"Результаты выполнения: {json.dumps(all_results, ensure_ascii=False, default=str)}")

            combined = build_response(all_results, "Готово!")
            yield sse_event("result", combined)
            yield sse_event("done", {})

        except Exception as e:
            yield sse_event("error", {"message": f"Ошибка: {str(e)}"})
            yield sse_event("done", {})

    return Response(
        stream_with_context(generate()),
        mimetype="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.route("/api/reset", methods=["POST"])
def reset_chat():
    """Reset AI conversation history."""
    agent.reset()
    pending_actions_store["actions"] = None
    return jsonify({"ok": True})


def execute_tool(tool, params, generate_sse=False):
    """Execute a Yonote tool and return events + result."""
    events = []
    result = None

    if tool == "search":
        events.append(sse_event("status", {"message": "Ищу информацию..."}))
        query = params.get("query", "")
        api_result = yonote.documents_search(query)
        documents = api_result.get("data", [])
        docs_list = []
        query_lower = query.lower()
        for doc in documents:
            d = doc.get("document", doc)
            text = (d.get("text", "") or "")
            ranking = doc.get("ranking", 0)
            # Skip empty pages and near-zero ranking results
            if not text.strip() and ranking and float(ranking) < 1e-10:
                continue
            # Build snippet: prefer context from API, fallback to text around query match
            context = doc.get("context", "")
            snippet = ""
            if context:
                snippet = context[:200]
            elif text.strip():
                idx = text.lower().find(query_lower)
                if idx >= 0:
                    start = max(0, idx - 50)
                    snippet = ("..." if start > 0 else "") + text[start:idx + len(query) + 100].strip()
                    if idx + len(query) + 100 < len(text):
                        snippet += "..."
                else:
                    snippet = text[:200].strip()
            docs_list.append({
                "number": len(docs_list) + 1,
                "id": d.get("id"),
                "title": d.get("title"),
                "text": text[:300],
                "snippet": snippet,
                "url": yonote.full_url(d.get("url", "")),
            })
        if not docs_list and documents:
            result = {
                "documents": [],
                "count": 0,
                "note": f"Поиск по «{query}» вернул {len(documents)} результатов, но все оказались пустыми страницами. Попробуйте другой запрос или используйте list_documents для навигации по коллекциям.",
            }
        else:
            result = {"documents": docs_list, "count": len(docs_list)}

    elif tool == "list_collections":
        events.append(sse_event("status", {"message": "Загружаю коллекции..."}))
        api_result = yonote.collections_list()
        collections = api_result.get("data", [])
        cols = [{"id": c.get("id"), "name": c.get("name")} for c in collections]
        result = {"collections": cols, "count": len(cols)}

    elif tool == "list_documents":
        parent_id = params.get("parent_document_id")
        if parent_id:
            events.append(sse_event("status", {"message": "Загружаю дочерние страницы..."}))
        else:
            events.append(sse_event("status", {"message": "Загружаю документы..."}))
        api_result = yonote.documents_list(
            collection_id=params.get("collection_id"),
            parent_document_id=parent_id,
        )
        documents = api_result.get("data", [])
        docs_list = [{"number": i + 1, "id": d.get("id"), "title": d.get("title"), "url": yonote.full_url(d.get("url", ""))} for i, d in enumerate(documents)]
        result = {"documents": docs_list, "count": len(docs_list)}

    elif tool == "document_info":
        events.append(sse_event("status", {"message": "Загружаю документ..."}))
        api_result = yonote.document_info(params.get("document_id"))
        doc = api_result.get("data", {})
        result = {
            "document": {
                "id": doc.get("id"),
                "title": doc.get("title"),
                "text": doc.get("text", ""),
                "url": yonote.full_url(doc.get("url", "")),
            }
        }

    elif tool == "create_document":
        events.append(sse_event("status", {"message": "Создаю страницу..."}))
        create_params = {"title": params.get("title", "Без названия")}
        if params.get("text"):
            create_params["text"] = format_text_for_yonote(params["text"])
        # collectionId is required by Yonote API
        col_id = params.get("collection_id")
        if not col_id:
            # Auto-pick first available collection
            cols_result = yonote.collections_list(limit=1)
            cols = cols_result.get("data", [])
            if cols:
                col_id = cols[0].get("id")
        if col_id:
            create_params["collection_id"] = col_id
        if params.get("text"):
            events.append(sse_event("status", {"message": "Наполняю контентом..."}))
        api_result = yonote.document_create(**create_params)
        doc = api_result.get("data", {})
        result = {
            "document": {
                "id": doc.get("id"),
                "title": doc.get("title"),
                "url": yonote.full_url(doc.get("url", "")),
            }
        }

    elif tool == "update_document":
        events.append(sse_event("status", {"message": "Обновляю документ..."}))
        text = params.get("text")
        if text:
            text = format_text_for_yonote(text)
        api_result = yonote.document_update(
            params.get("document_id"),
            title=params.get("title"),
            text=text,
            append=params.get("append", False),
        )
        doc = api_result.get("data", {})
        result = {
            "document": {
                "id": doc.get("id"),
                "title": doc.get("title"),
                "url": yonote.full_url(doc.get("url", "")),
            }
        }

    elif tool == "delete_document":
        events.append(sse_event("status", {"message": "Удаляю документ..."}))
        yonote.document_delete(params.get("document_id"))
        result = {"deleted": True}

    elif tool == "move_document":
        events.append(sse_event("status", {"message": "Перемещаю документ..."}))
        api_result = yonote.document_move(
            params.get("document_id"),
            collection_id=params.get("collection_id"),
            parent_document_id=params.get("parent_document_id"),
        )
        doc = api_result.get("data", {})
        result = {
            "document": {
                "id": doc.get("id"),
                "title": doc.get("title"),
                "url": yonote.full_url(doc.get("url", "")),
            }
        }

    elif tool == "archive_document":
        events.append(sse_event("status", {"message": "Архивирую документ..."}))
        yonote.document_archive(params.get("document_id"))
        result = {"archived": True}

    elif tool == "restore_document":
        events.append(sse_event("status", {"message": "Восстанавливаю документ..."}))
        yonote.document_restore(params.get("document_id"))
        result = {"restored": True}

    elif tool == "list_drafts":
        events.append(sse_event("status", {"message": "Загружаю черновики..."}))
        api_result = yonote.documents_drafts()
        documents = api_result.get("data", [])
        docs_list = [{"id": d.get("id"), "title": d.get("title"), "url": yonote.full_url(d.get("url", ""))} for d in documents]
        result = {"documents": docs_list, "count": len(docs_list)}

    elif tool == "list_viewed":
        events.append(sse_event("status", {"message": "Загружаю недавние..."}))
        api_result = yonote.documents_viewed()
        documents = api_result.get("data", [])
        docs_list = [{"id": d.get("id"), "title": d.get("title"), "url": yonote.full_url(d.get("url", ""))} for d in documents]
        result = {"documents": docs_list, "count": len(docs_list)}

    elif tool == "create_collection":
        events.append(sse_event("status", {"message": "Создаю коллекцию..."}))
        api_result = yonote.collection_create(
            params.get("name", "Без названия"),
            description=params.get("description", ""),
        )
        col = api_result.get("data", {})
        result = {"collection": {"id": col.get("id"), "name": col.get("name")}}

    elif tool == "duplicate_document":
        events.append(sse_event("status", {"message": "Дублирую документ..."}))
        api_result = yonote.document_duplicate(
            params.get("document_id"),
            title=params.get("title"),
            publish=params.get("publish", True),
            recursive=params.get("recursive", False),
        )
        doc = api_result.get("data", {})
        result = {
            "document": {
                "id": doc.get("id"),
                "title": doc.get("title"),
                "url": yonote.full_url(doc.get("url", "")),
            }
        }

    elif tool == "delete_collection":
        events.append(sse_event("status", {"message": "Удаляю коллекцию..."}))
        yonote.collection_delete(params.get("collection_id"))
        result = {"deleted": True}

    elif tool == "translate_document":
        # Handled by execute_translate_streaming() — should not reach here
        result = {"error": "translate_document must use streaming execution"}

    else:
        result = {"error": f"Неизвестный инструмент: {tool}"}

    return {"events": events, "result": result}


def execute_translate_streaming(params):
    """Generator for translate_document that yields SSE events in real-time.

    Yields SSE event strings during operation.
    Final yield is a dict with the result (not an SSE string).
    """
    doc_id = params.get("document_id")
    target_lang = params.get("target_language", "English")
    new_title = params.get("new_title", "")

    # Step 1: Get the original document
    yield sse_event("status", {"message": "Загружаю оригинал..."})
    api_result = yonote.document_info(doc_id)
    doc = api_result.get("data", {})
    original_text = doc.get("text", "")
    original_title = doc.get("title", "")

    if not new_title:
        new_title = f"{original_title} ({target_lang})"

    # Step 2: Translate block by block with real-time status
    yield sse_event("status", {"message": f"Перевожу на {target_lang}..."})

    from markdown_processor import parse_markdown_blocks, blocks_to_yonote_markdown, translate_heading, translate_text_via_api

    blocks = parse_markdown_blocks(original_text)
    translatable_blocks = [b for b in blocks if b["translatable"]]
    total = len(translatable_blocks)

    translated_blocks = []
    translated_count = 0

    for block in blocks:
        if not block["translatable"]:
            translated_blocks.append(block.copy())
            continue

        translated_count += 1
        yield sse_event("status", {"message": f"Перевожу блок {translated_count}/{total}..."})

        new_block = block.copy()
        if block["type"] == "heading":
            new_block["content"] = translate_heading(
                block["content"], target_lang, DEEPSEEK_API_KEY
            )
        else:
            new_block["content"] = translate_text_via_api(
                block["content"], target_lang, DEEPSEEK_API_KEY
            )

        translated_blocks.append(new_block)

    translated_text = blocks_to_yonote_markdown(translated_blocks)

    # Step 3: Create new document
    yield sse_event("status", {"message": "Создаю переведённую страницу..."})
    col_id = params.get("collection_id")
    if not col_id:
        cols_result = yonote.collections_list(limit=1)
        cols = cols_result.get("data", [])
        if cols:
            col_id = cols[0].get("id")

    create_args = {"title": new_title, "text": translated_text, "publish": True}
    if col_id:
        create_args["collection_id"] = col_id

    api_result = yonote.document_create(**create_args)
    new_doc = api_result.get("data", {})

    # Final yield: result dict (not an SSE string)
    yield {
        "_result": {
            "document": {
                "id": new_doc.get("id"),
                "title": new_doc.get("title"),
                "url": yonote.full_url(new_doc.get("url", "")),
            }
        }
    }


def _strip_markdown_formatting(text):
    """Strip markdown inline formatting: **bold**, *italic*, ~~strike~~, `code`."""
    import re
    # Remove bold/italic markers: **text** → text, *text* → text, __text__ → text
    text = re.sub(r'\*{1,3}(.*?)\*{1,3}', r'\1', text)
    text = re.sub(r'_{1,3}(.*?)_{1,3}', r'\1', text)
    # Remove strikethrough: ~~text~~ → text
    text = re.sub(r'~~(.*?)~~', r'\1', text)
    # Remove inline code: `text` → text
    text = re.sub(r'`(.*?)`', r'\1', text)
    return text.strip()


def _is_plain_heading_candidate(stripped):
    """Return True if the stripped line looks like a plain-text heading.

    Checks: short, no excluded prefixes, no sentence-ending punctuation.
    Does NOT check surrounding empty lines (caller handles that).
    """
    if not stripped:
        return False
    is_list_item = (stripped.startswith(("- ", "* ", "\u2022"))
                    or stripped.startswith(("-\t", "*\t")))
    return (len(stripped) < 80
            and not stripped.startswith(("http", "!", "[", ">", "|", "\\", "/"))
            and not is_list_item
            and stripped[-1] not in ".!?;:,)")


def extract_section_from_text(text, heading_name):
    """Extract text under a specific heading from document text.

    Supports two document formats found in Yonote:
      Format A (## headings or plain text with empty lines on both sides):
        ## Свет
        content...
        ## Цвет

      Format B (plain text headings, no empty lines between heading and content):
        Свет
        content...
        (empty line)
        Цвет

    Returns the content from the heading to the next heading, or None if not found.
    """
    if not text or not heading_name:
        return None

    lines = text.split("\n")
    heading_lower = heading_name.lower().strip()

    # --- Path A: strict heuristic (## headings + plain text with BOTH empty lines) ---
    headings_a = []
    for i, line in enumerate(lines):
        stripped = line.strip()
        if not stripped:
            continue
        # Markdown heading: ## Something
        if stripped.startswith("#"):
            clean = _strip_markdown_formatting(stripped.lstrip("#").strip())
            headings_a.append((i, clean))
            continue
        # Plain text heading: requires empty lines on BOTH sides
        if _is_plain_heading_candidate(stripped):
            prev_is_empty = i == 0 or not lines[i - 1].strip()
            next_is_empty = i == len(lines) - 1 or not lines[i + 1].strip()
            if prev_is_empty and next_is_empty:
                headings_a.append((i, _strip_markdown_formatting(stripped)))

    # Look for target in Path A
    target_idx = None
    target_is_markdown = False
    next_heading_idx = None
    for pos, (line_idx, heading_text) in enumerate(headings_a):
        if heading_text.lower() == heading_lower:
            target_idx = line_idx
            target_is_markdown = lines[line_idx].strip().startswith("#")
            # Find the next heading boundary
            for next_pos in range(pos + 1, len(headings_a)):
                next_line_idx = headings_a[next_pos][0]
                # If target is a ## heading, only stop at another ## heading
                if target_is_markdown and not lines[next_line_idx].strip().startswith("#"):
                    continue
                next_heading_idx = next_line_idx
                break
            break

    if target_idx is not None:
        start = target_idx + 1
        end = next_heading_idx if next_heading_idx is not None else len(lines)
        section_text = "\n".join(lines[start:end]).strip()
        return section_text if section_text else None

    # --- Path B: plain text headings without surrounding empty lines ---
    # Find target by exact line match (no empty line requirement)
    target_idx = None
    for i, line in enumerate(lines):
        stripped = line.strip()
        if not stripped:
            continue
        clean = _strip_markdown_formatting(stripped)
        if clean.lower() == heading_lower and _is_plain_heading_candidate(stripped):
            target_idx = i
            break

    if target_idx is None:
        return None

    # Find next heading: first line after an empty line that looks like a heading
    # (In Format B, empty lines appear only between sections, not within them)
    next_heading_idx = len(lines)
    for i in range(target_idx + 1, len(lines)):
        stripped = lines[i].strip()
        if not stripped:
            continue
        prev_is_empty = i > 0 and not lines[i - 1].strip()
        if prev_is_empty:
            if stripped.startswith("#") or _is_plain_heading_candidate(stripped):
                next_heading_idx = i
                break

    start = target_idx + 1
    section_text = "\n".join(lines[start:next_heading_idx]).strip()
    return section_text if section_text else None


def _match_image_to_heading(name, heading):
    """Check if image filename contains a tag matching the heading.

    Returns:
      'match'    — filename has a tag that matches the heading
      'mismatch' — filename has a tag but it's for a different heading
      'untagged' — filename has no recognizable tag

    Tag formats supported (case-insensitive, whole word):
      '#свет - описание.png'   → tag 'свет'
      '#свет описание.png'     → tag 'свет'
      'свет - описание.png'    → tag 'свет'
      'свет описание.png'      → tag 'свет'
      'рассвет.png'            → NOT matched (part of word)
      'image.png'              → untagged
    """
    if not name or not heading:
        return "untagged"

    heading_lower = heading.lower().strip()

    # Remove file extension for matching
    name_clean = re.sub(r'\.\w+$', '', name).strip()
    name_lower = name_clean.lower()

    # Strip leading '#' if present
    if name_lower.startswith("#"):
        name_lower = name_lower[1:]
        name_clean = name_clean[1:]

    # Check if heading appears as a whole word at the start
    # Pattern: heading followed by separator or end of string
    pattern = re.compile(
        r'^' + re.escape(heading_lower) + r'(?:\s*[-—]\s*|\s+|$)',
        re.IGNORECASE,
    )
    if pattern.match(name_lower):
        return "match"

    # Check if name starts with any word that looks like a tag
    # (a short word followed by separator) — if so, it's a tag for a different heading
    tag_pattern = re.compile(r'^[\w]+(?:\s*[-—]\s*|\s+)', re.UNICODE)
    if tag_pattern.match(name_lower) and len(name_lower.split()[0]) < 30:
        return "mismatch"

    return "untagged"


def fetch_document_images(document_id, heading=None):
    """Fetch image attachments for a document via attachments.list API.

    If heading is provided, only includes images explicitly tagged for that heading:
      - '#свет - фото.png'  → included when heading='Свет'
      - 'свет — тестирование.jpeg' → included when heading='Свет'
      - 'image.png' (no tag) → EXCLUDED (untagged images are skipped)
      - '#цвет - палитра.png' → EXCLUDED when heading='Свет'
    If heading is None, all images are returned (no filtering).

    Returns a list of markdown image strings.
    """
    try:
        result = yonote.attachments_list(document_id)
        attachments = result.get("data", [])
    except Exception:
        return []

    images = []
    for att in attachments:
        content_type = att.get("contentType", "")
        if not content_type.startswith("image/"):
            continue
        name = att.get("name", "image")
        redirect_url = att.get("redirectUrl", "")
        if not redirect_url:
            continue

        if heading:
            match_result = _match_image_to_heading(name, heading)
            if match_result != "match":
                # Only include images explicitly tagged for this heading
                continue

        full_url = yonote.full_url(redirect_url)
        # Clean display name: strip tag prefix for cleaner output
        display_name = name
        if heading:
            clean = re.sub(r'\.\w+$', '', name).strip()
            if clean.startswith("#"):
                clean = clean[1:]
            heading_lower = heading.lower().strip()
            # Remove the tag + separator prefix
            stripped = re.sub(
                r'^' + re.escape(heading_lower) + r'\s*[-—]\s*',
                '', clean, flags=re.IGNORECASE,
            ).strip()
            if stripped and stripped != clean:
                # Restore extension
                ext_match = re.search(r'\.\w+$', name)
                ext = ext_match.group() if ext_match else ""
                display_name = stripped + ext
            elif clean.lower() == heading_lower:
                display_name = name  # Just the tag, keep original

        images.append(f"![{display_name}]({full_url})")
    return images


def fetch_all_descendants(parent_id, root_title=None, status_callback=None):
    """Recursively fetch all descendant pages of a parent document.

    Returns a flat list of {id, title, path} dicts for ALL nested children at any depth.
    path is a list of ancestor titles (e.g. ["Авгодом", "Интерьер", "1 этаж, Гости"]).
    """
    all_pages = []
    # Queue items: (parent_id, parent_path)
    root_path = [root_title] if root_title else []
    queue = [(parent_id, root_path)]

    while queue:
        current_parent, parent_path = queue.pop(0)
        try:
            api_result = yonote.documents_list(parent_document_id=current_parent, limit=100)
            children = api_result.get("data", [])
        except Exception:
            continue

        for child in children:
            child_id = child.get("id")
            child_title = child.get("title", "Без названия")
            child_path = parent_path + [child_title]
            all_pages.append({"id": child_id, "title": child_title, "path": child_path})
            # Add to queue to fetch its children too
            queue.append((child_id, child_path))

        if status_callback and children:
            status_callback(len(all_pages))

    return all_pages


def _resolve_export_urls(text):
    """Convert relative image URLs from export markdown to absolute URLs.

    Export returns: ![](/api/attachments.redirect?id=...)
    We need:       ![](https://remake.yonote.ru/api/attachments.redirect?id=...)
    """
    def replace_url(match):
        alt = match.group(1)
        url = match.group(2)
        full = yonote.full_url(url)
        return f"![{alt}]({full})"

    return re.sub(r'!\[([^\]]*)\]\((/api/[^)]+)\)', replace_url, text)


def _get_rich_text(page_id):
    """Try to get full markdown via export. Returns None on failure."""
    try:
        result = yonote.document_export_markdown(page_id)
        return result if isinstance(result, str) else None
    except Exception:
        return None


def execute_extract_sections_streaming(params):
    """Generator for extract_sections that yields SSE events in real-time.

    Reads ALL descendant documents (recursive) of a parent, extracts sections
    under a heading, and creates a compiled report document.
    """
    parent_doc_id = params.get("parent_document_id")
    heading = params.get("heading")
    output_title = params.get("output_title", f"Отчет: {heading}")
    breadcrumbs = params.get("breadcrumbs", False)

    # Step 1: Recursively collect all descendant pages
    yield sse_event("status", {"message": "Загружаю дочерние страницы..."})

    # Get root document title for breadcrumbs path
    root_title = None
    if breadcrumbs:
        try:
            root_doc = yonote.document_info(parent_doc_id)
            root_title = root_doc.get("data", {}).get("title")
        except Exception:
            pass

    # We can't yield from inside a callback, so collect pages first
    all_pages = fetch_all_descendants(parent_doc_id, root_title=root_title)
    total = len(all_pages)

    if total == 0:
        yield {"_result": {"message": "Дочерних страниц не найдено"}}
        return

    yield sse_event("status", {"message": f"Найдено {total} страниц на всех уровнях вложенности"})

    # Step 2: Read each page and extract sections
    found_sections = []
    empty_text_pages = []   # pages where API returned empty/null text
    section_not_found_pages = []  # pages where text exists but heading not found
    error_pages = []
    for i, page in enumerate(all_pages):
        page_id = page.get("id")
        page_title = page.get("title", "Без названия")

        yield sse_event("status", {
            "message": f"Читаю «{page_title}» ({i + 1}/{total})..."
        })

        try:
            doc_result = yonote.document_info(page_id)
            doc = doc_result.get("data", {})
            text = doc.get("text", "") or ""  # Handle None from API

            if not text.strip():
                # API returned empty text — likely a block-based document
                empty_text_pages.append(page_title)
            else:
                # Quick check: does this page have the heading?
                section = extract_section_from_text(text, heading)
                if section:
                    # Section found — try to get rich content via export
                    rich_text = _get_rich_text(page_id)
                    rich_section = None
                    if rich_text:
                        rich_section = extract_section_from_text(rich_text, heading)
                    if rich_section:
                        # Export succeeded — tables, images are already inline
                        section = _resolve_export_urls(rich_section)
                    else:
                        # Fallback to basic text + attachments
                        section = resolve_attachment_refs(section)
                        images = fetch_document_images(page_id, heading=heading)
                        if images:
                            section += "\n\n" + "\n\n".join(images)

                    found_sections.append({
                        "page_title": page_title,
                        "path": page.get("path", []),
                        "content": section,
                    })
                else:
                    section_not_found_pages.append(page_title)
        except Exception as e:
            error_pages.append(f"{page_title}: {str(e)}")

    # Report skipped/error pages in status
    if error_pages:
        yield sse_event("status", {
            "message": f"Ошибки при чтении: {'; '.join(error_pages[:5])}"
        })
    if empty_text_pages:
        yield sse_event("status", {
            "message": f"⚠️ Пустой текст (блочный формат?): {', '.join(empty_text_pages[:10])}"
        })
    if section_not_found_pages:
        yield sse_event("status", {
            "message": f"Секция «{heading}» не найдена в: {', '.join(section_not_found_pages[:10])}"
        })

    if not found_sections:
        detail_parts = []
        if empty_text_pages:
            detail_parts.append(f"{len(empty_text_pages)} страниц с пустым текстом")
        if section_not_found_pages:
            detail_parts.append(f"{len(section_not_found_pages)} без секции «{heading}»")
        if error_pages:
            detail_parts.append(f"{len(error_pages)} с ошибками")
        detail = "; ".join(detail_parts) if detail_parts else ""
        yield {"_result": {
            "message": f"Секция «{heading}» не найдена ни в одном из {total} документов"
                       + (f" ({detail})" if detail else ""),
        }}
        return

    # Step 3: Compile report
    yield sse_event("status", {
        "message": f"Найдено в {len(found_sections)} из {total}. Собираю отчёт..."
    })

    compiled_parts = []
    for section in found_sections:
        compiled_parts.append(f"## {section['page_title']}")
        if breadcrumbs and section.get("path"):
            breadcrumb_text = " → ".join(section["path"])
            compiled_parts.append(f"*{breadcrumb_text}*")
        compiled_parts.append("")
        compiled_parts.append(section["content"])
        compiled_parts.append("")
        compiled_parts.append("")
    compiled_text = "\n".join(compiled_parts).strip()

    # Step 4: Create the report document
    yield sse_event("status", {"message": f"Создаю страницу «{output_title}»..."})

    col_id = params.get("collection_id")
    if not col_id:
        cols_result = yonote.collections_list(limit=1)
        cols = cols_result.get("data", [])
        if cols:
            col_id = cols[0].get("id")

    create_args = {"title": output_title, "text": compiled_text, "publish": True}
    if col_id:
        create_args["collection_id"] = col_id

    api_result = yonote.document_create(**create_args)
    new_doc = api_result.get("data", {})

    yield {"_result": {
        "document": {
            "id": new_doc.get("id"),
            "title": new_doc.get("title"),
            "url": yonote.full_url(new_doc.get("url", "")),
        },
        "sections_found": len(found_sections),
        "total_children": total,
    }}


def execute_copy_section_streaming(params):
    """Generator for copy_section that yields SSE events in real-time.

    Reads a single document, extracts a section under a heading,
    and creates a new document with that content.
    """
    doc_id = params.get("document_id")
    heading = params.get("heading")
    output_title = params.get("output_title", f"Копия: {heading}")

    # Step 1: Read the source document
    yield sse_event("status", {"message": "Загружаю документ..."})
    api_result = yonote.document_info(doc_id)
    doc = api_result.get("data", {})
    text = doc.get("text", "") or ""
    source_title = doc.get("title", "")
    source_url = yonote.full_url(doc.get("url", ""))

    if not text.strip():
        yield {"_result": {
            "message": f"Документ «{source_title}» не содержит текста (возможно, контент в блочном формате). Попробуйте duplicate_document для полного копирования.",
        }}
        return

    # Step 2: Extract the section — try rich export first, fallback to basic text
    yield sse_event("status", {"message": f"Экспортирую полный контент..."})
    rich_text = _get_rich_text(doc_id)

    yield sse_event("status", {"message": f"Ищу секцию «{heading}»..."})
    section = None
    if rich_text:
        section = extract_section_from_text(rich_text, heading)
        if section:
            section = _resolve_export_urls(section)

    if not section:
        # Fallback to basic text
        section = extract_section_from_text(text, heading)
        if section:
            section = resolve_attachment_refs(section)
            images = fetch_document_images(doc_id, heading=heading)
            if images:
                section += "\n\n" + "\n\n".join(images)

    if not section:
        yield {"_result": {
            "message": f"Секция «{heading}» не найдена в документе «{source_title}».",
        }}
        return

    # Step 3: Create new document with the section content
    yield sse_event("status", {"message": f"Создаю страницу «{output_title}»..."})

    col_id = params.get("collection_id")
    if not col_id:
        cols_result = yonote.collections_list(limit=1)
        cols = cols_result.get("data", [])
        if cols:
            col_id = cols[0].get("id")

    # Add source reference
    compiled_text = section + f"\n\n---\n*Источник: [{source_title}]({source_url})*"

    create_args = {"title": output_title, "text": compiled_text, "publish": True}
    if col_id:
        create_args["collection_id"] = col_id
    if params.get("parent_document_id"):
        create_args["parent_document_id"] = params["parent_document_id"]

    api_result = yonote.document_create(**create_args)
    new_doc = api_result.get("data", {})

    yield {"_result": {
        "document": {
            "id": new_doc.get("id"),
            "title": new_doc.get("title"),
            "url": yonote.full_url(new_doc.get("url", "")),
        },
        "source_document": source_title,
        "heading": heading,
    }}


def execute_action_streaming(action):
    """Execute an action, yielding SSE events in real-time and returning result.

    For translate_document, uses streaming generator.
    For other tools, uses buffered execute_tool.

    Yields: (event_string, None) for SSE events, (None, result_dict) for final result.
    """
    tool = action.get("tool", "")
    params = action.get("params", {})

    if tool == "translate_document":
        result = None
        for item in execute_translate_streaming(params):
            if isinstance(item, dict):
                result = item["_result"]
            else:
                yield (item, None)
        yield (None, {"tool": tool, "result": result})
    elif tool == "copy_section":
        result = None
        for item in execute_copy_section_streaming(params):
            if isinstance(item, dict):
                result = item["_result"]
            else:
                yield (item, None)
        yield (None, {"tool": tool, "result": result})
    elif tool == "extract_sections":
        result = None
        for item in execute_extract_sections_streaming(params):
            if isinstance(item, dict):
                result = item["_result"]
            else:
                yield (item, None)
        yield (None, {"tool": tool, "result": result})
    else:
        result_data = execute_tool(tool, params, generate_sse=True)
        for evt in result_data["events"]:
            yield (evt, None)
        yield (None, {"tool": tool, "result": result_data["result"]})


def build_response(all_results, response_template):
    """Build a combined response from tool results."""
    # Clean up any leftover placeholders from AI
    message = re.sub(r'\{result\}', '', response_template).strip()
    if not message:
        message = "Готово!"

    combined = {"message": message}

    for item in all_results:
        r = item.get("result", {})
        if "documents" in r:
            combined["documents"] = r["documents"]
        if "collections" in r:
            combined["collections"] = r["collections"]
        if "document" in r:
            combined["document"] = r["document"]

    return combined


if __name__ == "__main__":
    app.run(debug=True, port=5001)
