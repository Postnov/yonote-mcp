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
        api_result = yonote.documents_search(params.get("query", ""))
        documents = api_result.get("data", [])
        docs_list = []
        for i, doc in enumerate(documents):
            d = doc.get("document", doc)
            docs_list.append({
                "number": i + 1,
                "id": d.get("id"),
                "title": d.get("title"),
                "text": (d.get("text", "") or "")[:300],
                "url": yonote.full_url(d.get("url", "")),
            })
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


def extract_section_from_text(text, heading_name):
    """Extract text under a specific heading from document text.

    Handles both markdown headings (## Heading) and plain text headings
    (short lines preceded by an empty line).
    Returns the content from the heading to the next heading, or None if not found.
    """
    if not text or not heading_name:
        return None

    lines = text.split("\n")
    heading_lower = heading_name.lower().strip()

    # First pass: find all headings and their line positions
    headings = []
    for i, line in enumerate(lines):
        stripped = line.strip()
        if not stripped:
            continue

        # Markdown heading: ## Something
        if stripped.startswith("#"):
            clean = stripped.lstrip("#").strip()
            headings.append((i, clean))
            continue

        # Plain text heading: short line surrounded by empty lines on both sides
        if len(stripped) < 80 and not stripped.startswith(("-", "*", "\u2022", "http")):
            prev_is_empty = i == 0 or not lines[i - 1].strip()
            next_is_empty = i == len(lines) - 1 or not lines[i + 1].strip()
            if prev_is_empty and next_is_empty:
                headings.append((i, stripped))

    # Find matching heading
    target_idx = None
    next_heading_idx = None

    for pos, (line_idx, heading_text) in enumerate(headings):
        if heading_text.lower() == heading_lower:
            target_idx = line_idx
            if pos + 1 < len(headings):
                next_heading_idx = headings[pos + 1][0]
            break

    if target_idx is None:
        return None

    # Extract content between this heading and the next
    start = target_idx + 1
    end = next_heading_idx if next_heading_idx is not None else len(lines)
    section_text = "\n".join(lines[start:end]).strip()
    return section_text if section_text else None


def fetch_all_descendants(parent_id, status_callback=None):
    """Recursively fetch all descendant pages of a parent document.

    Returns a flat list of {id, title} dicts for ALL nested children at any depth.
    """
    all_pages = []
    queue = [parent_id]

    while queue:
        current_parent = queue.pop(0)
        try:
            api_result = yonote.documents_list(parent_document_id=current_parent, limit=100)
            children = api_result.get("data", [])
        except Exception:
            continue

        for child in children:
            child_id = child.get("id")
            child_title = child.get("title", "Без названия")
            all_pages.append({"id": child_id, "title": child_title})
            # Add to queue to fetch its children too
            queue.append(child_id)

        if status_callback and children:
            status_callback(len(all_pages))

    return all_pages


def execute_extract_sections_streaming(params):
    """Generator for extract_sections that yields SSE events in real-time.

    Reads ALL descendant documents (recursive) of a parent, extracts sections
    under a heading, and creates a compiled report document.
    """
    parent_doc_id = params.get("parent_document_id")
    heading = params.get("heading")
    output_title = params.get("output_title", f"Отчет: {heading}")

    # Step 1: Recursively collect all descendant pages
    yield sse_event("status", {"message": "Загружаю дочерние страницы..."})

    # We can't yield from inside a callback, so collect pages first
    all_pages = fetch_all_descendants(parent_doc_id)
    total = len(all_pages)

    if total == 0:
        yield {"_result": {"message": "Дочерних страниц не найдено"}}
        return

    yield sse_event("status", {"message": f"Найдено {total} страниц на всех уровнях вложенности"})

    # Step 2: Read each page and extract sections
    found_sections = []
    for i, page in enumerate(all_pages):
        page_id = page.get("id")
        page_title = page.get("title", "Без названия")

        yield sse_event("status", {
            "message": f"Читаю «{page_title}» ({i + 1}/{total})..."
        })

        try:
            doc_result = yonote.document_info(page_id)
            doc = doc_result.get("data", {})
            text = doc.get("text", "")

            section = extract_section_from_text(text, heading)
            if section:
                found_sections.append({
                    "page_title": page_title,
                    "content": section,
                })
        except Exception:
            pass  # Skip documents that can't be read

    if not found_sections:
        yield {"_result": {
            "message": f"Секция «{heading}» не найдена ни в одном из {total} документов",
        }}
        return

    # Step 3: Compile report
    yield sse_event("status", {
        "message": f"Найдено в {len(found_sections)} из {total}. Собираю отчёт..."
    })

    compiled_parts = []
    for section in found_sections:
        compiled_parts.append(f"## {section['page_title']}")
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
