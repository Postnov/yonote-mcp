"""Diagnostic: test deep_search pipeline for a specific query.

Runs the same logic as execute_deep_search_streaming but with verbose output
to identify why a query isn't being found.
"""
import os
import time
from dotenv import load_dotenv
from yonote_client import YonoteClient

load_dotenv()
yonote = YonoteClient(
    os.getenv("API_TOKEN"),
    os.getenv("API_BASE_URL", "https://app.yonote.ru/api"),
)

QUERY = "керамогранит"
query_lower = QUERY.lower()


def export_document(doc_id):
    """Full export pipeline: export → poll → redirect → download."""
    try:
        result = yonote.document_export_markdown(doc_id)
        return result
    except Exception as e:
        return f"ERROR: {e}"


# Step 1: List all collections
print("=== Step 1: Collections ===")
cols = yonote.collections_list(limit=100).get("data", [])
print(f"Found {len(cols)} collections:")
for c in cols:
    print(f"  - {c['name']} ({c['id'][:8]}...)")

# Step 2: Scan all pages
all_pages = {}  # id -> {title, url, text, depth, parent}
print("\n=== Step 2: Scanning all pages ===")


def scan_recursive(parent_id, parent_title, depth=0):
    if depth > 5:
        return
    try:
        children = yonote.documents_list(parent_document_id=parent_id, limit=100).get("data", [])
    except Exception as e:
        print(f"  ERROR listing children of {parent_title}: {e}")
        return

    for child in children:
        cid = child.get("id")
        ctitle = child.get("title", "")
        curl = child.get("url", "")
        ctext = child.get("text", "") or ""
        if cid not in all_pages:
            all_pages[cid] = {
                "title": ctitle,
                "url": curl,
                "text": ctext,
                "depth": depth,
                "parent": parent_title,
            }
        scan_recursive(cid, ctitle, depth + 1)


for col in cols:
    col_id = col["id"]
    col_name = col["name"]
    try:
        docs = yonote.documents_list(collection_id=col_id, limit=100).get("data", [])
    except Exception as e:
        print(f"  ERROR listing docs in {col_name}: {e}")
        continue

    print(f"\n  Collection «{col_name}»: {len(docs)} top-level docs")
    for doc in docs:
        did = doc.get("id")
        dtitle = doc.get("title", "")
        durl = doc.get("url", "")
        dtext = doc.get("text", "") or ""
        if did not in all_pages:
            all_pages[did] = {
                "title": dtitle,
                "url": durl,
                "text": dtext,
                "depth": 0,
                "parent": col_name,
            }
        scan_recursive(did, dtitle)

print(f"\nTotal unique pages found: {len(all_pages)}")

# Step 3: Search in text fields (Phase 1)
print(f"\n=== Step 3: Phase 1 — search «{QUERY}» in text fields ===")
phase1_found = []
for pid, info in all_pages.items():
    if query_lower in (info["text"] or "").lower():
        phase1_found.append((pid, info["title"]))
        print(f"  FOUND in text: «{info['title']}» (parent: {info['parent']})")

if not phase1_found:
    print("  Phase 1: nothing found in text fields")

# Step 4: Check if target page exists
print(f"\n=== Step 4: Looking for pages with '1 этаж' or 'гост' in title ===")
target_pages = []
for pid, info in all_pages.items():
    title_lower = info["title"].lower()
    if "1 этаж" in title_lower or "гост" in title_lower:
        target_pages.append((pid, info))
        print(f"  Found: «{info['title']}» (depth={info['depth']}, parent={info['parent']})")
        print(f"    text length: {len(info['text'])} chars")
        if info["text"]:
            preview = info["text"][:200].replace("\n", "\\n")
            print(f"    text preview: {preview}")
        has_query = query_lower in (info["text"] or "").lower()
        print(f"    contains «{QUERY}» in text: {has_query}")

if not target_pages:
    print("  No pages with '1 этаж' or 'гост' in title found!")
    print("  Listing ALL page titles:")
    for pid, info in sorted(all_pages.items(), key=lambda x: x[1]["title"]):
        print(f"    «{info['title']}» (parent: {info['parent']}, depth={info['depth']})")

# Step 5: Export target pages
print(f"\n=== Step 5: Export target pages ===")
for pid, info in target_pages:
    print(f"\n  Exporting «{info['title']}» ({pid[:8]}...)...")
    content = export_document(pid)
    if content.startswith("ERROR:"):
        print(f"    {content}")
    else:
        print(f"    Export length: {len(content)} chars")
        has_query = query_lower in content.lower()
        print(f"    Contains «{QUERY}»: {has_query}")
        if has_query:
            idx = content.lower().find(query_lower)
            snippet = content[max(0, idx - 100):idx + 100]
            print(f"    Context: ...{snippet}...")
        else:
            # Show first 500 chars to understand the format
            print(f"    First 500 chars:")
            print(f"    {content[:500]}")

# Step 6: Export a random sample to check format
print(f"\n=== Step 6: Export 3 random pages (format check) ===")
import random
sample_ids = random.sample(list(all_pages.keys()), min(3, len(all_pages)))
for pid in sample_ids:
    info = all_pages[pid]
    print(f"\n  Exporting «{info['title']}»...")
    content = export_document(pid)
    if content.startswith("ERROR:"):
        print(f"    {content}")
    else:
        print(f"    Length: {len(content)} chars")
        # Check if it looks like markdown or binary
        printable = sum(1 for c in content[:100] if c.isprintable() or c in '\n\r\t')
        print(f"    Printable chars in first 100: {printable}/100")
        print(f"    First 200 chars: {content[:200]}")
