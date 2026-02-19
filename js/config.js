/**
 * Settings manager — loads/saves API keys via PHP settings API.
 * Keys are stored server-side in SQLite, not in localStorage.
 */
export class Config {
    constructor() {
        this._settings = {};
        this._loaded = false;
    }

    async load() {
        try {
            const resp = await fetch('/api/settings.php');
            if (resp.ok) {
                this._settings = await resp.json();
            }
        } catch (e) {
            console.warn('Failed to load settings:', e);
        }
        this._loaded = true;
    }

    get(key) {
        return this._settings[key] || '';
    }

    async save(key, value) {
        const resp = await fetch('/api/settings.php', {
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
}
