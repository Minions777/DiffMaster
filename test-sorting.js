/**
 * Tests for JSON sorting (mirrors js/sorting.js logic).
 * Run: node test-sorting.js
 */
const assert = require('assert');

function tryParseJson(text) {
    const cleaned = text.trim().replace(/[﻿​‌‍]/g, '');
    try {
        const parsed = JSON.parse(cleaned);
        const type = Array.isArray(parsed) ? 'array'
            : (parsed && typeof parsed === 'object' ? 'object' : 'primitive');
        return { success: true, data: parsed, type };
    } catch (e) {
        return { success: false, data: null, type: null, error: e.message };
    }
}

function compareValues(a, b, direction) {
    const dir = direction === 'asc' ? 1 : -1;
    if (a === null && b === null) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    if (a === undefined && b === undefined) return 0;
    if (a === undefined) return 1;
    if (b === undefined) return -1;
    const typeOrder = { 'boolean': 0, 'number': 1, 'string': 2, 'object': 3 };
    const aType = Array.isArray(a) ? 'array' : typeof a;
    const bType = Array.isArray(b) ? 'array' : typeof b;
    if (aType !== bType) {
        return ((typeOrder[aType] ?? 3) - (typeOrder[bType] ?? 3)) * dir;
    }
    if (aType === 'boolean') return ((a === b ? 0 : a ? 1 : -1)) * dir;
    if (aType === 'number') return (a - b) * dir;
    if (aType === 'string') return a.localeCompare(b, 'en') * dir;
    return JSON.stringify(a).localeCompare(JSON.stringify(b)) * dir;
}

// Test 1: parse valid JSON
assert.strictEqual(tryParseJson('{"a":1}').success, true);
assert.strictEqual(tryParseJson('[1,2,3]').type, 'array');
assert.strictEqual(tryParseJson('{"a":1}').type, 'object');
assert.strictEqual(tryParseJson('42').type, 'primitive');

// Test 2: parse invalid JSON
assert.strictEqual(tryParseJson('not json').success, false);
assert.strictEqual(tryParseJson('').success, false);

// Test 3: zero-width strip
assert.strictEqual(tryParseJson('﻿{"a":1}').success, true);
assert.strictEqual(tryParseJson('​[1,2]').success, true);

// Test 4: type-aware compare
assert.strictEqual(compareValues(1, 2, 'asc') < 0, true);
assert.strictEqual(compareValues(2, 1, 'asc') > 0, true);
assert.strictEqual(compareValues('a', 'b', 'asc') < 0, true);
assert.strictEqual(compareValues('a', 'b', 'desc') > 0, true);

// Test 5: null always last
assert.strictEqual(compareValues(null, 1, 'asc'), 1);
assert.strictEqual(compareValues(1, null, 'asc'), -1);
assert.strictEqual(compareValues(null, null, 'asc'), 0);

// Test 6: undefined always last
assert.strictEqual(compareValues(undefined, 1, 'asc'), 1);
assert.strictEqual(compareValues(1, undefined, 'asc'), -1);

// Test 7: type ordering boolean < number < string
assert.strictEqual(compareValues(true, 1, 'asc') < 0, true);
assert.strictEqual(compareValues(1, 'a', 'asc') < 0, true);
assert.strictEqual(compareValues('a', {}, 'asc') < 0, true);

// Test 8: array sort behavior
const arr = [{ x: 3 }, { x: 1 }, { x: 2 }];
const sorted = [...arr].sort((a, b) => compareValues(a.x, b.x, 'asc'));
assert.deepStrictEqual(sorted.map(o => o.x), [1, 2, 3]);

// Test 9: descending
const sortedDesc = [...arr].sort((a, b) => compareValues(a.x, b.x, 'desc'));
assert.deepStrictEqual(sortedDesc.map(o => o.x), [3, 2, 1]);

// Test 10: nested arrays compared by JSON string
assert.notStrictEqual(compareValues([1, 2], [1, 3], 'asc'), 0);

console.log('All sorting tests passed.');
