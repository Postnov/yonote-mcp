"""Quick diagnostic: show raw text content of a document to check image format."""
import os
import sys
from dotenv import load_dotenv
from yonote_client import YonoteClient

load_dotenv()
yonote = YonoteClient(os.getenv("API_TOKEN"), os.getenv("API_BASE_URL", "https://app.yonote.ru/api"))

doc_id = sys.argv[1] if len(sys.argv) > 1 else None
if not doc_id:
    print("Usage: python debug_doc.py <document_id>")
    print("\nTo find document IDs, searching...")
    # List children of a document or search
    query = sys.argv[1] if len(sys.argv) > 1 else "Гости"
    print(f"Searching for: {query}")
    results = yonote.documents_search(query, limit=5)
    for doc in results.get("data", []):
        ctx = doc.get("context", {})
        print(f"  ID: {doc['document']['id']}  Title: {doc['document']['title']}")
    sys.exit(0)

result = yonote.document_info(doc_id)
doc = result.get("data", {})
text = doc.get("text", "") or ""

print(f"Title: {doc.get('title')}")
print(f"Text length: {len(text)} chars")
print()

if not text.strip():
    print("⚠️  TEXT IS EMPTY — block format document, images not accessible via API text field")
else:
    import re
    attachment_refs = re.findall(r'!\[[^\]]*\]\(<attachment:[^>]+>\)', text)
    regular_images = re.findall(r'!\[[^\]]*\]\(https?://[^)]+\)', text)
    other_images = re.findall(r'!\[[^\]]*\]\([^)]+\)', text)

    print(f"Attachment refs (![alt](<attachment:uuid>)): {len(attachment_refs)}")
    for ref in attachment_refs[:5]:
        print(f"  {ref[:100]}")

    print(f"Regular HTTP images: {len(regular_images)}")
    print(f"Other image patterns: {len(other_images)}")
    for ref in other_images[:5]:
        print(f"  {ref[:100]}")

    print()
    print("--- First 500 chars of text ---")
    print(text[:500])
    print()
    print("--- Lines containing '!' (possible images) ---")
    for line in text.split('\n'):
        if '!' in line:
            print(f"  {repr(line[:200])}")
