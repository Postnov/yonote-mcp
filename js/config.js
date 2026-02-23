/**
 * Settings manager — loads/saves API keys via PHP settings API.
 * Keys are stored server-side in SQLite, not in localStorage.
 * Supports project context: page-ID keys resolve from active project first.
 */
export class Config {
    constructor() {
        this._settings = {};
        this._loaded = false;
        this._project = null;
    }

    async load() {
        try {
            const resp = await fetch('api/settings.php');
            if (resp.ok) {
                this._settings = await resp.json();
            }
        } catch (e) {
            console.warn('Failed to load settings:', e);
        }
        this._loaded = true;
    }

    get(key) {
        const projectKeys = ['tags_page_id', 'default_search_page_id', 'reports_page_id'];
        if (this._project && projectKeys.includes(key)) {
            const val = (this._project.data || {})[key];
            if (val) return val;
        }
        return this._settings[key] || '';
    }

    async save(key, value) {
        const resp = await fetch('api/settings.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key, value }),
        });
        if (resp.ok) {
            this._settings[key] = value;
        }
        return resp.ok;
    }

    isConfigured() {
        return !!(this.get('yonote_api_token') && this.get('deepseek_api_key'));
    }

    getAll() {
        return { ...this._settings };
    }

    setProject(project) {
        this._project = project;
    }

    clearProject() {
        this._project = null;
    }

    getProject() {
        return this._project;
    }
}
