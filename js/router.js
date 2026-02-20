/**
 * Simple hash-based SPA router.
 * Supports patterns like '#/projects' and '#/project/:id'.
 */
export class Router {
    constructor() {
        this._routes = [];
        this._defaultHash = '#/projects';
    }

    /**
     * Register a route pattern with a handler.
     * Pattern supports :param placeholders (e.g., '#/project/:id').
     */
    add(pattern, handler) {
        const paramNames = [];
        const regexStr = pattern.replace(/:([^/]+)/g, (_, name) => {
            paramNames.push(name);
            return '([^/]+)';
        });
        this._routes.push({
            pattern,
            regex: new RegExp('^' + regexStr + '$'),
            paramNames,
            handler,
        });
    }

    /**
     * Start listening for hash changes and resolve the current hash.
     */
    start() {
        window.addEventListener('hashchange', () => this._resolve());
        this._resolve();
    }

    /**
     * Navigate to a hash programmatically.
     */
    navigate(hash) {
        window.location.hash = hash;
    }

    /**
     * Resolve the current hash against registered routes.
     */
    _resolve() {
        const hash = window.location.hash || '';

        if (!hash || hash === '#' || hash === '#/') {
            window.location.hash = this._defaultHash;
            return;
        }

        for (const route of this._routes) {
            const match = hash.match(route.regex);
            if (match) {
                const params = {};
                route.paramNames.forEach((name, i) => {
                    params[name] = decodeURIComponent(match[i + 1]);
                });
                route.handler(params);
                return;
            }
        }

        // No route matched — go to default
        window.location.hash = this._defaultHash;
    }
}
