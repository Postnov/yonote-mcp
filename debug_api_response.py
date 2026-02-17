"""Diagnostic script: analyze what Yonote API returns for documents.

Fetches a real document and shows ALL fields from the API response,
including any ProseMirror content, to understand where images are stored.
"""
import os
import json
import requests
from dotenv import load_dotenv

load_dotenv()

API_TOKEN = os.getenv("API_TOKEN")
API_BASE_URL = os.getenv("API_BASE_URL", "https://app.yonote.ru/api")

HEADERS = {
    "Authorization": f"Bearer {API_TOKEN}",
    "Content-Type": "application/json",
    "Accept": "application/json",
}


def api_post(endpoint, data=None):
    url = f"{API_BASE_URL}/{endpoint}"
    resp = requests.post(url, headers=HEADERS, json=data or {}, timeout=30)
    resp.raise_for_status()
    return resp.json()


def analyze_document(doc_id, label=""):
    """Fetch document and show ALL fields from API response."""
    print(f"\n{'='*80}")
    print(f"DOCUMENT: {label or doc_id}")
    print(f"{'='*80}")

    raw = api_post("documents.info", {"id": doc_id})
    doc = raw.get("data", {})

    # Show all top-level keys
    print(f"\n--- TOP-LEVEL KEYS ---")
    for key in sorted(doc.keys()):
        val = doc[key]
        if isinstance(val, str) and len(val) > 200:
            print(f"  {key}: [{type(val).__name__}, {len(val)} chars] {val[:200]}...")
        elif isinstance(val, (dict, list)):
            print(f"  {key}: [{type(val).__name__}, {len(json.dumps(val, ensure_ascii=False))} chars]")
        else:
            print(f"  {key}: {val}")

    # Show text field
    text = doc.get("text", "")
    print(f"\n--- TEXT FIELD ({len(text) if text else 0} chars) ---")
    if text:
        print(text[:2000])
        if len(text) > 2000:
            print(f"... [{len(text) - 2000} more chars]")
    else:
        print("  (empty or null)")

    # Check for ProseMirror / content / data fields
    for field_name in ["content", "data", "document", "blocks", "body"]:
        val = doc.get(field_name)
        if val and isinstance(val, (dict, list)):
            print(f"\n--- {field_name.upper()} FIELD ---")
            dumped = json.dumps(val, ensure_ascii=False, indent=2)
            print(dumped[:3000])
            if len(dumped) > 3000:
                print(f"... [{len(dumped) - 3000} more chars]")

            # Search for image-related content
            dumped_lower = dumped.lower()
            if "image" in dumped_lower or "attachment" in dumped_lower or "src" in dumped_lower:
                print(f"\n  *** FOUND image/attachment/src references in {field_name}! ***")

    # Check for image patterns in text
    if text:
        import re
        images = re.findall(r'!\[.*?\]\(.*?\)', text)
        attachments = re.findall(r'<attachment:[^>]+>', text)
        urls_with_redirect = re.findall(r'attachments\.redirect', text)

        print(f"\n--- IMAGE ANALYSIS IN TEXT ---")
        print(f"  Markdown images (![]()): {len(images)}")
        for img in images[:10]:
            print(f"    {img}")
        print(f"  Attachment refs (<attachment:>): {len(attachments)}")
        for att in attachments[:10]:
            print(f"    {att}")
        print(f"  Redirect URLs: {len(urls_with_redirect)}")

    # Check if there's any mention of images in the full JSON
    full_json = json.dumps(doc, ensure_ascii=False)
    has_image = "image" in full_json.lower()
    has_attachment = "attachment" in full_json.lower()
    has_src = '"src"' in full_json
    print(f"\n--- GLOBAL SEARCH IN FULL RESPONSE ---")
    print(f"  Contains 'image': {has_image}")
    print(f"  Contains 'attachment': {has_attachment}")
    print(f"  Contains '\"src\"': {has_src}")

    if has_image or has_src:
        # Find and print the context around image references
        import re
        for match in re.finditer(r'.{0,50}(image|"src")[^"]{0,100}', full_json, re.IGNORECASE):
            print(f"  Context: ...{match.group()[:200]}...")

    return doc


def find_children(parent_id, label=""):
    """List child documents."""
    result = api_post("documents.list", {"parentDocumentId": parent_id, "limit": 100})
    children = result.get("data", [])
    print(f"\n--- CHILDREN of {label or parent_id}: {len(children)} ---")
    for c in children:
        print(f"  {c.get('title')} (id={c.get('id')[:12]}...)")
    return children


if __name__ == "__main__":
    # Step 1: Find Авгодом
    print("Searching for 'Авгодом'...")
    search_result = api_post("documents.search", {"query": "Авгодом"})
    docs = search_result.get("data", [])

    if not docs:
        print("Not found! Trying to list collections...")
        cols = api_post("collections.list", {"limit": 25})
        for c in cols.get("data", []):
            print(f"  Collection: {c.get('name')} (id={c.get('id')})")
        exit(1)

    # Pick the first result that looks like the main Авгодом page
    avgdom = None
    for d in docs:
        doc = d.get("document", d)
        print(f"  Found: {doc.get('title')} (id={doc.get('id')[:12]}...)")
        if doc.get("title", "").startswith("Авгодом"):
            avgdom = doc
            break

    if not avgdom:
        avgdom = docs[0].get("document", docs[0])

    # Step 2: Analyze parent document
    avgdom_id = avgdom["id"]
    analyze_document(avgdom_id, avgdom.get("title"))

    # Step 3: Find a child page that should have images
    children = find_children(avgdom_id, avgdom.get("title"))

    # Step 4: Analyze first few children (look for one with images)
    analyzed = 0
    for child in children[:3]:
        child_id = child.get("id")
        child_title = child.get("title")
        doc = analyze_document(child_id, child_title)
        analyzed += 1

        # Also check grandchildren
        grandchildren = find_children(child_id, child_title)
        for gc in grandchildren[:2]:
            analyze_document(gc.get("id"), gc.get("title"))
            analyzed += 1

        if analyzed >= 5:
            break

    print(f"\n{'='*80}")
    print(f"ANALYSIS COMPLETE — analyzed {analyzed + 1} documents")
    print(f"{'='*80}")
