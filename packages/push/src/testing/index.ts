/**
 * `@sovereignfs/push/testing`: an in-memory store, and the conformance suite an app runs against its own store (RFC 0009 §1.4).
 * It uses `node:assert` alone, so the package gains no test dependency.
 */
export { memoryPushStore } from './memory.js';
export { pushStoreConformance, sampleSubscription, type ConformanceCase } from './conformance.js';
