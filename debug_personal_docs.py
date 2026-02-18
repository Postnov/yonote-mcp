"""Check if personal documents can be accessed via documents.list without collectionId."""
import os
from dotenv import load_dotenv
from yonote_client import YonoteClient

load_dotenv()
yonote = YonoteClient(
    os.getenv("API_TOKEN"),
    os.getenv("API_BASE_URL", "https://app.yonote.ru/api"),
)

# Test 1: documents.list without collectionId
print("=== documents.list (no collectionId) ===")
try:
    result = yonote.documents_list(limit=100)
    docs = result.get("data", [])
    print(f"Found {len(docs)} documents")
    for doc in docs:
        title = doc.get("title", "")
        col_id = doc.get("collectionId", "none")
        print(f"  «{title}» (collection: {col_id[:8]}...)")
except Exception as e:
    print(f"Error: {e}")

# Test 2: search for "1 этаж"
print("\n=== documents.search('1 этаж') ===")
try:
    result = yonote.documents_search("1 этаж", limit=10)
    docs = result.get("data", [])
    print(f"Found {len(docs)} results")
    for doc in docs:
        d = doc.get("document", doc)
        title = d.get("title", "")
        col_id = d.get("collectionId", "none")
        print(f"  «{title}» (collection: {col_id})")
except Exception as e:
    print(f"Error: {e}")

# Test 3: search for "керамогранит"
print("\n=== documents.search('керамогранит') ===")
try:
    result = yonote.documents_search("керамогранит", limit=10)
    docs = result.get("data", [])
    print(f"Found {len(docs)} results")
    for doc in docs:
        d = doc.get("document", doc)
        title = d.get("title", "")
        print(f"  «{title}»")
except Exception as e:
    print(f"Error: {e}")

# Test 4: search for "Авгодом"
print("\n=== documents.search('Авгодом') ===")
try:
    result = yonote.documents_search("Авгодом", limit=10)
    docs = result.get("data", [])
    print(f"Found {len(docs)} results")
    for doc in docs:
        d = doc.get("document", doc)
        title = d.get("title", "")
        col_id = d.get("collectionId", "none")
        print(f"  «{title}» (collection: {col_id})")
except Exception as e:
    print(f"Error: {e}")

# Test 5: Check known document ID
print("\n=== documents.info for '1 этаж, Гости' (320cfa7f-635d-480f-9069-6b59e6df9cc0) ===")
try:
    result = yonote.document_info("320cfa7f-635d-480f-9069-6b59e6df9cc0")
    doc = result.get("data", {})
    title = doc.get("title", "")
    col_id = doc.get("collectionId", "none")
    text = doc.get("text", "")
    print(f"Title: «{title}»")
    print(f"Collection ID: {col_id}")
    print(f"Text length: {len(text)} chars")
    print(f"Contains 'керамогранит': {'керамогранит' in text.lower()}")
    if text:
        print(f"Text preview: {text[:300]}")
except Exception as e:
    print(f"Error: {e}")

# Test 6: List collections and check if any is "Личное"
print("\n=== All collections (with details) ===")
try:
    result = yonote.collections_list(limit=100)
    cols = result.get("data", [])
    for c in cols:
        print(f"  {c.get('name')} | id={c.get('id')} | permission={c.get('permission', '?')}")
except Exception as e:
    print(f"Error: {e}")
