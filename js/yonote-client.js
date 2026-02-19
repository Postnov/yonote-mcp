/**
 * Yonote API client — port of yonote_client.py.
 * All requests go through the PHP proxy to avoid CORS issues.
 */
export class YonoteClient {
    constructor(apiToken, baseUrl = 'https://app.yonote.ru/api') {
        this.apiToken = apiToken;
        this.baseUrl = baseUrl.replace(/\/+$/, '');
        this._workspaceUrl = null;
    }

    async _post(endpoint, data = {}) {
        const url = `${this.baseUrl}/${endpoint}`;
        const resp = await fetch('/api/proxy.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url,
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiToken}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                },
                body: data,
            }),
        });
        if (!resp.ok) {
            const text = await resp.text();
            throw new Error(`API error ${resp.status}: ${text}`);
        }
        return resp.json();
    }

    // --- Auth ---

    async authInfo() {
        return this._post('auth.info');
    }

    async getWorkspaceUrl() {
        if (this._workspaceUrl === null) {
            const result = await this.authInfo();
            this._workspaceUrl = result?.data?.team?.url || '';
        }
        return this._workspaceUrl;
    }

    fullUrl(relativeUrl) {
        if (!relativeUrl) return '';
        if (relativeUrl.startsWith('http')) return relativeUrl;
        // Use cached workspace URL (must call getWorkspaceUrl first)
        return `${this._workspaceUrl || ''}${relativeUrl}`;
    }

    getAttachmentUrl(attachmentId) {
        return `${this.baseUrl}/attachments.redirect?id=${attachmentId}`;
    }

    // --- Collections ---

    async collectionsList(limit = 25, offset = 0) {
        return this._post('collections.list', { limit, offset });
    }

    async collectionInfo(collectionId) {
        return this._post('collections.info', { id: collectionId });
    }

    async collectionDocuments(collectionId) {
        return this._post('collections.documents', { id: collectionId });
    }

    async collectionCreate(name, description = '') {
        const data = { name };
        if (description) data.description = description;
        return this._post('collections.create', data);
    }

    async collectionDelete(collectionId) {
        return this._post('collections.delete', { id: collectionId });
    }

    // --- Documents ---

    async documentsList(collectionId = null, parentDocumentId = null, limit = 25, offset = 0) {
        const data = { limit, offset };
        if (collectionId) data.collectionId = collectionId;
        if (parentDocumentId) data.parentDocumentId = parentDocumentId;
        return this._post('documents.list', data);
    }

    async documentInfo(documentId) {
        return this._post('documents.info', { id: documentId });
    }

    async documentsSearch(query, collectionId = null, limit = 25, offset = 0) {
        const data = { query, limit, offset };
        if (collectionId) data.collectionId = collectionId;
        return this._post('documents.search', data);
    }

    async documentCreate(title, text = '', collectionId = null, parentDocumentId = null, publish = true) {
        const data = { title, text, publish };
        if (collectionId) data.collectionId = collectionId;
        if (parentDocumentId) data.parentDocumentId = parentDocumentId;
        return this._post('documents.create', data);
    }

    async documentUpdate(documentId, title = null, text = null, append = false) {
        const data = { id: documentId };
        if (title !== null) data.title = title;
        if (text !== null) data.text = text;
        if (append) data.append = true;
        return this._post('documents.update', data);
    }

    async documentDuplicate(documentId, title = null, publish = true, recursive = false) {
        const data = { id: documentId, publish };
        if (title) data.title = title;
        if (recursive) data.recursive = true;
        return this._post('documents.duplicate', data);
    }

    async documentDelete(documentId, permanent = false) {
        return this._post('documents.delete', { id: documentId, permanent });
    }

    async documentMove(documentId, collectionId = null, parentDocumentId = null) {
        const data = { id: documentId };
        if (collectionId) data.collectionId = collectionId;
        if (parentDocumentId) data.parentDocumentId = parentDocumentId;
        return this._post('documents.move', data);
    }

    async documentArchive(documentId) {
        return this._post('documents.archive', { id: documentId });
    }

    async documentRestore(documentId) {
        return this._post('documents.restore', { id: documentId });
    }

    async documentsDrafts(limit = 25, offset = 0) {
        return this._post('documents.drafts', { limit, offset });
    }

    async documentsViewed(limit = 25, offset = 0) {
        return this._post('documents.viewed', { limit, offset });
    }

    // --- Export ---

    async documentExportMarkdown(documentId, timeout = 30000) {
        // Step 1: Start export
        const result = await this._post('documents.export', { id: documentId });
        const foId = result.data.fileOperation.id;

        // Step 2: Poll until complete
        const deadline = Date.now() + timeout;
        while (Date.now() < deadline) {
            await new Promise(r => setTimeout(r, 500));
            const status = await this._post('fileOperations.info', { id: foId });
            const state = status?.data?.state;
            if (state === 'complete') break;
            if (state === 'error') throw new Error('Export failed');
        }
        if (Date.now() >= deadline) {
            throw new Error(`Export not completed within ${timeout}ms`);
        }

        // Step 3: Get redirect URL (noRedirect mode)
        const redirectResp = await fetch('/api/proxy.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url: `${this.baseUrl}/fileOperations.redirect`,
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiToken}`,
                    'Content-Type': 'application/json',
                },
                body: { id: foId },
                noRedirect: true,
            }),
        });
        const redirectData = await redirectResp.json();
        const redirectUrl = redirectData.location;
        if (!redirectUrl) throw new Error('No redirect URL from export');

        // Step 4: Download content
        const downloadResp = await fetch('/api/proxy.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url: redirectUrl,
                method: 'GET',
                headers: {},
            }),
        });
        const downloadData = await downloadResp.json();
        return downloadData._rawText || '';
    }

    // --- Attachments ---

    async attachmentsList(documentId) {
        return this._post('attachments.list', { documentId });
    }
}
