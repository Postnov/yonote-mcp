"""Diagnostic: show what attachments.list returns for documents with images."""
import os
import json
from dotenv import load_dotenv
from yonote_client import YonoteClient

load_dotenv()
yonote = YonoteClient(os.getenv("API_TOKEN"), os.getenv("API_BASE_URL", "https://app.yonote.ru/api"))


def fetch_all_descendants(parent_id):
    """BFS to get all descendant pages."""
    pages = []
    queue = [parent_id]
    while queue:
        pid = queue.pop(0)
        try:
            result = yonote.documents_list(parent_document_id=pid, limit=100)
            children = result.get("data", [])
            for child in children:
                pages.append(child)
                queue.append(child["id"])
        except Exception as e:
            print(f"  Error listing children of {pid}: {e}")
    return pages


# Find Авгодом
print("=== Searching for 'Авгодом' ===")
results = yonote.documents_search("Авгодом", limit=5)
avgdom = None
for item in results.get("data", []):
    doc = item.get("document", {})
    print(f"  {doc.get('title')} — {doc.get('id')}")
    if "авгодом" in doc.get("title", "").lower():
        avgdom = doc

if not avgdom:
    print("Авгодом not found!")
    exit(1)

print(f"\n=== Fetching all descendants of '{avgdom['title']}' ({avgdom['id']}) ===")
pages = fetch_all_descendants(avgdom["id"])
print(f"Found {len(pages)} descendant pages\n")

print("=== Checking attachments for each page ===")
total_images = 0
for page in pages:
    page_id = page["id"]
    title = page.get("title", "?")
    try:
        result = yonote.attachments_list(page_id)
        attachments = result.get("data", [])
    except Exception as e:
        print(f"  [{title}] Error: {e}")
        continue

    images = [a for a in attachments if a.get("contentType", "").startswith("image/")]
    if not images:
        continue

    total_images += len(images)
    print(f"\n📷 [{title}] — {len(images)} image(s):")
    for att in images:
        print(f"  --- Attachment ---")
        # Print ALL fields to see what's available
        for key, value in att.items():
            if key in ("document", "user"):
                # Skip nested objects, just show id
                print(f"    {key}: (id={value.get('id', '?')})")
            else:
                val_str = str(value)
                if len(val_str) > 150:
                    val_str = val_str[:150] + "..."
                print(f"    {key}: {val_str}")

print(f"\n=== TOTAL: {total_images} images across {len(pages)} pages ===")
