/**
 * Simple EventEmitter for event dispatch.
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

    once(event, fn) {
        const wrapper = (data) => {
            this.off(event, wrapper);
            fn(data);
        };
        this.on(event, wrapper);
    }

    removeAllListeners(event) {
        if (event) {
            delete this._listeners[event];
        } else {
            this._listeners = {};
        }
    }
}
