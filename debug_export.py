"""Check if documents.export returns richer content including images."""
import os
import requests
from dotenv import load_dotenv

load_dotenv()
TOKEN = os.getenv("API_TOKEN")
BASE = os.getenv("API_BASE_URL", "https://app.yonote.ru/api").rstrip("/")
HEADERS = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json", "Accept": "application/json"}
DOC_ID = "320cfa7f-635d-480f-9069-6b59e6df9cc0"  # 1 этаж, Гости

def post(endpoint, data=None):
    r = requests.post(f"{BASE}/{endpoint}", headers=HEADERS, json=data or {}, timeout=30)
    print(f"POST {endpoint} -> {r.status_code}")
    return r

# Try documents.export
r = post("documents.export", {"id": DOC_ID})
if r.status_code == 200:
    data = r.json().get("data", "")
    print(f"Export length: {len(str(data))} chars")
    print("First 1000 chars:")
    print(str(data)[:1000])
    import re
    imgs = re.findall(r'!\[[^\]]*\]\([^)]+\)', str(data))
    attachments = re.findall(r'attachment', str(data), re.I)
    print(f"\nImage patterns found: {len(imgs)}")
    print(f"'attachment' occurrences: {len(attachments)}")
    for img in imgs[:10]:
        print(f"  {img}")
else:
    print(r.text[:300])
