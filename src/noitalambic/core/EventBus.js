// ============================================================================
// EVENT BUS - Pub/Sub pattern for component communication
// ============================================================================

export class EventBus {
    constructor() {
        this.events = {};
    }

    on(event, handler) {
        (this.events[event] ||= []).push(handler);
    }

    emit(event, payload) {
        (this.events[event] || []).forEach(fn => fn(payload));
    }

    off(event, handler) {
        if (!this.events[event]) return;
        this.events[event] = this.events[event].filter(h => h !== handler);
    }
}