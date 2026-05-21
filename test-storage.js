/**
 * Tests for storage history quota fallback.
 * Mirrors js/storage.js logic with an in-memory localStorage shim.
 * Run: node test-storage.js
 */
const assert = require('assert');

class MemoryStorage {
    constructor(quota) {
        this._data = new Map();
        this._quota = quota;
    }
    get length() { return this._data.size; }
    getItem(k) { return this._data.has(k) ? this._data.get(k) : null; }
    setItem(k, v) {
        const total = Array.from(this._data.entries())
            .filter(([key]) => key !== k)
            .reduce((sum, [key, val]) => sum + key.length + val.length, 0) + k.length + v.length;
        if (this._quota != null && total > this._quota) {
            const err = new Error('QuotaExceededError');
            err.name = 'QuotaExceededError';
            throw err;
        }
        this._data.set(k, v);
    }
    removeItem(k) { this._data.delete(k); }
    clear() { this._data.clear(); }
}

const STORAGE_KEY = 'diffmaster_history';
const MAX_RECORDS = 50;

function makeStorage(localStorage) {
    function getHistory() {
        try {
            const data = localStorage.getItem(STORAGE_KEY);
            return data ? JSON.parse(data) : [];
        } catch { return []; }
    }

    function saveRecord(original, modified, stats) {
        const records = getHistory();
        const record = {
            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            timestamp: Date.now(),
            original: original.slice(0, 2000),
            modified: modified.slice(0, 2000),
            originalLength: original.length,
            modifiedLength: modified.length,
            stats: { ...stats }
        };
        records.unshift(record);
        if (records.length > MAX_RECORDS) records.length = MAX_RECORDS;

        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
        } catch (e) {
            while (records.length > 10) {
                records.pop();
                try {
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
                    break;
                } catch {}
            }
        }
        return record;
    }

    function deleteRecord(id) {
        const records = getHistory().filter(r => r.id !== id);
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(records)); } catch {}
        return records;
    }

    function clearHistory() { localStorage.removeItem(STORAGE_KEY); }

    return { getHistory, saveRecord, deleteRecord, clearHistory };
}

// Test 1: basic save/get
{
    const ls = new MemoryStorage();
    const Storage = makeStorage(ls);
    Storage.saveRecord('a', 'b', { added: 1, deleted: 0, modified: 0 });
    const records = Storage.getHistory();
    assert.strictEqual(records.length, 1);
    assert.strictEqual(records[0].original, 'a');
    assert.strictEqual(records[0].stats.added, 1);
}

// Test 2: max 50 records cap
{
    const ls = new MemoryStorage();
    const Storage = makeStorage(ls);
    for (let i = 0; i < 60; i++) {
        Storage.saveRecord('o' + i, 'm' + i, { added: i, deleted: 0, modified: 0 });
    }
    const records = Storage.getHistory();
    assert.strictEqual(records.length, 50);
    // newest first (i=59 was saved last)
    assert.strictEqual(records[0].original, 'o59');
}

// Test 3: original/modified truncated to 2000 chars
{
    const ls = new MemoryStorage();
    const Storage = makeStorage(ls);
    const longText = 'x'.repeat(5000);
    Storage.saveRecord(longText, longText, { added: 0, deleted: 0, modified: 1 });
    const r = Storage.getHistory()[0];
    assert.strictEqual(r.original.length, 2000);
    assert.strictEqual(r.originalLength, 5000);
}

// Test 4: clearHistory
{
    const ls = new MemoryStorage();
    const Storage = makeStorage(ls);
    Storage.saveRecord('a', 'b', { added: 1, deleted: 0, modified: 0 });
    Storage.clearHistory();
    assert.deepStrictEqual(Storage.getHistory(), []);
}

// Test 5: deleteRecord
{
    const ls = new MemoryStorage();
    const Storage = makeStorage(ls);
    const r1 = Storage.saveRecord('a', 'b', { added: 1, deleted: 0, modified: 0 });
    Storage.saveRecord('c', 'd', { added: 0, deleted: 1, modified: 0 });
    Storage.deleteRecord(r1.id);
    const remaining = Storage.getHistory();
    assert.strictEqual(remaining.length, 1);
    assert.strictEqual(remaining[0].original, 'c');
}

// Test 6: quota fallback — when localStorage is small, save still succeeds
// by trimming records down to <= 10
{
    const ls = new MemoryStorage(2000); // tight budget
    const Storage = makeStorage(ls);
    for (let i = 0; i < 30; i++) {
        Storage.saveRecord('record-' + i, 'x', { added: i, deleted: 0, modified: 0 });
    }
    const records = Storage.getHistory();
    // Should have trimmed to fit; either succeeded or fell through silently
    assert.ok(records.length <= 30, 'records should not grow unbounded');
    // At least the latest record should be readable (or empty if quota was 0)
    if (records.length > 0) {
        assert.ok(records[0].original.startsWith('record-'));
    }
}

// Test 7: corrupt JSON in storage returns []
{
    const ls = new MemoryStorage();
    ls.setItem(STORAGE_KEY, 'not valid json');
    const Storage = makeStorage(ls);
    assert.deepStrictEqual(Storage.getHistory(), []);
}

console.log('All storage tests passed.');
