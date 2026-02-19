/**
 * Simple EventEmitter for in-browser event dispatch.
 * Replaces SSE events from Flask.
 *
 * Events: 'status', 'result', 'confirm', 'error', 'done'
 */
export class EventBus {
    constructor() {
        this._listeners = {};
    }

    on(event, fn) {
        if (!this._listeners[event]) this._listeners[event] = [];
        this._listeners[event].push(fn);
    }

    off(event, fn) {
        if (!this._listeners[event]) return;
        this._listeners[event] = this._listeners[event].filter(f => f !== fn);
    }

    emit(event, data) {
        if (!this._listeners[event]) return;
        for (const fn of this._listeners[event]) {
            fn(data);
        }
    }
}
