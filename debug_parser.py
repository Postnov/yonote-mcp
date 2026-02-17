"""Debug script: fetches a document from Yonote and shows how the parser sees it.

Usage:
    ./venv/bin/python debug_parser.py <document_id>
    ./venv/bin/python debug_parser.py          # lists recent documents to pick from
"""

import sys
import os
from dotenv import load_dotenv

load_dotenv()

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from yonote_client import YonoteClient
from markdown_processor import parse_markdown_blocks

API_TOKEN = os.getenv("API_TOKEN")
API_BASE_URL = os.getenv("API_BASE_URL", "https://app.yonote.ru/api")

client = YonoteClient(API_TOKEN, API_BASE_URL)


def list_recent():
    result = client.documents_viewed()
    docs = result.get("data", [])
    print("=== Недавние документы ===\n")
    for i, doc in enumerate(docs[:10]):
        print(f"  {i+1}. {doc.get('id')}  {doc.get('title')}")
    print(f"\nИспользуй: python debug_parser.py <document_id>")


def debug_document(doc_id):
    print(f"=== Загружаю документ {doc_id} ===\n")
    result = client.document_info(doc_id)
    doc = result.get("data", {})
    title = doc.get("title", "???")
    text = doc.get("text", "")

    print(f"Заголовок: {title}")
    print(f"Длина текста: {len(text)} символов")
    print()

    # Show raw text
    print("=" * 60)
    print("RAW MARKDOWN (первые 3000 символов):")
    print("=" * 60)
    print(text[:3000])
    if len(text) > 3000:
        print(f"\n... (обрезано, всего {len(text)} символов)")
    print()

    # Parse and show blocks
    blocks = parse_markdown_blocks(text)
    print("=" * 60)
    print(f"ПАРСЕР: {len(blocks)} блоков")
    print("=" * 60)
    for i, block in enumerate(blocks):
        btype = block["type"]
        translatable = "TR" if block["translatable"] else "  "
        content_preview = block["content"][:100].replace("\n", "\\n")
        if len(block["content"]) > 100:
            content_preview += "..."
        print(f"  [{i:3d}] {btype:16s} [{translatable}] {content_preview}")

    # Stats
    print()
    type_counts = {}
    for b in blocks:
        type_counts[b["type"]] = type_counts.get(b["type"], 0) + 1
    print("Статистика блоков:")
    for t, c in sorted(type_counts.items()):
        print(f"  {t}: {c}")

    translatable = sum(1 for b in blocks if b["translatable"])
    print(f"\nБудет переведено: {translatable} блоков из {len(blocks)}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        list_recent()
    else:
        debug_document(sys.argv[1])
