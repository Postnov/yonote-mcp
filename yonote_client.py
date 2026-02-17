import requests


class YonoteClient:
    """Client for Yonote API (Outline-compatible)."""

    def __init__(self, api_token, base_url="https://app.yonote.ru/api"):
        self.api_token = api_token
        self.base_url = base_url.rstrip("/")
        self.headers = {
            "Authorization": f"Bearer {api_token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        self._workspace_url = None

    def _post(self, endpoint, data=None):
        """Make a POST request to the Yonote API."""
        url = f"{self.base_url}/{endpoint}"
        response = requests.post(url, headers=self.headers, json=data or {}, timeout=30)
        response.raise_for_status()
        return response.json()

    # --- Auth ---

    def auth_info(self):
        """Get current user and team info."""
        return self._post("auth.info")

    def get_workspace_url(self):
        """Get the workspace base URL (e.g. https://remake.yonote.ru). Cached after first call."""
        if self._workspace_url is None:
            result = self.auth_info()
            self._workspace_url = result.get("data", {}).get("team", {}).get("url", "")
        return self._workspace_url

    def full_url(self, relative_url):
        """Convert a relative document URL to a full URL."""
        if not relative_url:
            return ""
        if relative_url.startswith("http"):
            return relative_url
        workspace = self.get_workspace_url()
        return f"{workspace}{relative_url}"

    # --- Collections ---

    def collections_list(self, limit=25, offset=0):
        """List all collections."""
        return self._post("collections.list", {"limit": limit, "offset": offset})

    def collection_info(self, collection_id):
        """Get collection details."""
        return self._post("collections.info", {"id": collection_id})

    def collection_documents(self, collection_id):
        """List documents in a collection."""
        return self._post("collections.documents", {"id": collection_id})

    # --- Documents ---

    def documents_list(self, collection_id=None, parent_document_id=None, limit=25, offset=0):
        """List documents, optionally filtered by collection or parent document."""
        data = {"limit": limit, "offset": offset}
        if collection_id:
            data["collectionId"] = collection_id
        if parent_document_id:
            data["parentDocumentId"] = parent_document_id
        return self._post("documents.list", data)

    def document_info(self, document_id):
        """Get document details."""
        return self._post("documents.info", {"id": document_id})

    def documents_search(self, query, collection_id=None, limit=25, offset=0):
        """Full-text search across documents."""
        data = {"query": query, "limit": limit, "offset": offset}
        if collection_id:
            data["collectionId"] = collection_id
        return self._post("documents.search", data)

    def document_create(self, title, text="", collection_id=None, parent_document_id=None, publish=True):
        """Create a new document."""
        data = {"title": title, "text": text, "publish": publish}
        if collection_id:
            data["collectionId"] = collection_id
        if parent_document_id:
            data["parentDocumentId"] = parent_document_id
        return self._post("documents.create", data)

    def document_update(self, document_id, title=None, text=None, append=False):
        """Update an existing document. Use append=True to add text to end instead of replacing."""
        data = {"id": document_id}
        if title is not None:
            data["title"] = title
        if text is not None:
            data["text"] = text
        if append:
            data["append"] = True
        return self._post("documents.update", data)

    def document_delete(self, document_id, permanent=False):
        """Delete a document."""
        return self._post("documents.delete", {"id": document_id, "permanent": permanent})

    def document_move(self, document_id, collection_id=None, parent_document_id=None):
        """Move document to different collection or parent."""
        data = {"id": document_id}
        if collection_id:
            data["collectionId"] = collection_id
        if parent_document_id:
            data["parentDocumentId"] = parent_document_id
        return self._post("documents.move", data)

    def document_archive(self, document_id):
        """Archive a document (soft delete)."""
        return self._post("documents.archive", {"id": document_id})

    def document_restore(self, document_id):
        """Restore an archived/deleted document."""
        return self._post("documents.restore", {"id": document_id})

    def documents_drafts(self, limit=25, offset=0):
        """List user's draft documents."""
        return self._post("documents.drafts", {"limit": limit, "offset": offset})

    def documents_viewed(self, limit=25, offset=0):
        """List recently viewed documents."""
        return self._post("documents.viewed", {"limit": limit, "offset": offset})

    # --- Collections (extended) ---

    def collection_create(self, name, description=""):
        """Create a new collection."""
        data = {"name": name}
        if description:
            data["description"] = description
        return self._post("collections.create", data)

    def collection_delete(self, collection_id):
        """Delete a collection."""
        return self._post("collections.delete", {"id": collection_id})
