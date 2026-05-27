/**
 * Test Runner for DiffMaster
 * Simple browser-based test framework
 */
const TestRunner = (() => {
    const results = [];
    let passed = 0;
    let failed = 0;

    function assert(condition, message) {
        if (condition) {
            results.push({ status: 'PASS', message });
            passed++;
        } else {
            results.push({ status: 'FAIL', message });
            failed++;
        }
    }

    function assertEqual(actual, expected, message) {
        const isEqual = JSON.stringify(actual) === JSON.stringify(expected);
        if (isEqual) {
            results.push({ status: 'PASS', message });
            passed++;
        } else {
            results.push({
                status: 'FAIL',
                message: `${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
            });
            failed++;
        }
    }

    function assertDeepEqual(actual, expected, message) {
        const isEqual = JSON.stringify(actual) === JSON.stringify(expected);
        if (isEqual) {
            results.push({ status: 'PASS', message });
            passed++;
        } else {
            results.push({
                status: 'FAIL',
                message: `${message}:\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`
            });
            failed++;
        }
    }

    function assertThrows(fn, message) {
        try {
            fn();
            results.push({ status: 'FAIL', message: `${message}: expected to throw but did not` });
            failed++;
        } catch {
            results.push({ status: 'PASS', message });
            passed++;
        }
    }

    function test(name, fn) {
        try {
            fn();
        } catch (e) {
            results.push({ status: 'FAIL', message: `${name}: ${e.message}` });
            failed++;
        }
    }

    function run() {
        const container = document.getElementById('test-results');
        if (!container) {
            console.log('Test results container not found');
            return;
        }

        let html = `<div class="test-summary">`;
        html += `<span class="test-passed">Passed: ${passed}</span>`;
        html += `<span class="test-failed">Failed: ${failed}</span>`;
        html += `<span class="test-total">Total: ${passed + failed}</span>`;
        html += `</div>`;

        html += `<div class="test-details">`;
        for (const result of results) {
            const statusClass = result.status === 'PASS' ? 'test-pass' : 'test-fail';
            html += `<div class="${statusClass}">[${result.status}] ${result.message}</div>`;
        }
        html += `</div>`;

        container.innerHTML = html;

        return { passed, failed, total: passed + failed };
    }

    return { assert, assertEqual, assertDeepEqual, assertThrows, test, run };
})();

// Run tests after DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('Running DiffMaster tests...');

    // ==================== JsonSorter Tests ====================
    TestRunner.test('JsonSorter.tryParseJson - valid array', () => {
        const result = JsonSorter.tryParseJson('[1, 2, 3]');
        TestRunner.assert(result.success, 'should parse valid array');
        TestRunner.assertEqual(result.type, 'array', 'should detect array type');
        TestRunner.assertDeepEqual(result.data, [1, 2, 3], 'should parse array data');
    });

    TestRunner.test('JsonSorter.tryParseJson - valid object', () => {
        const result = JsonSorter.tryParseJson('{"a": 1, "b": 2}');
        TestRunner.assert(result.success, 'should parse valid object');
        TestRunner.assertEqual(result.type, 'object', 'should detect object type');
    });

    TestRunner.test('JsonSorter.tryParseJson - invalid json', () => {
        const result = JsonSorter.tryParseJson('{invalid}');
        TestRunner.assert(!result.success, 'should fail on invalid json');
        TestRunner.assert(result.error !== null, 'should have error message');
    });

    TestRunner.test('JsonSorter.tryParseJson - with BOM', () => {
        const result = JsonSorter.tryParseJson('﻿[1, 2, 3]');
        TestRunner.assert(result.success, 'should handle BOM');
    });

    TestRunner.test('JsonSorter.extractKeys', () => {
        const arr = [{ a: 1, b: 2 }, { b: 3, c: 4 }];
        const keys = JsonSorter.extractKeys(arr);
        TestRunner.assertDeepEqual(keys, ['a', 'b', 'c'], 'should extract and sort keys');
    });

    TestRunner.test('JsonSorter.extractKeys - empty array', () => {
        const keys = JsonSorter.extractKeys([]);
        TestRunner.assertDeepEqual(keys, [], 'should return empty for empty array');
    });

    TestRunner.test('JsonSorter.compareValues - numbers', () => {
        TestRunner.assertEqual(JsonSorter.compareValues(1, 2), -1, '1 < 2');
        TestRunner.assertEqual(JsonSorter.compareValues(2, 1), 1, '2 > 1');
        TestRunner.assertEqual(JsonSorter.compareValues(1, 1), 0, '1 == 1');
    });

    TestRunner.test('JsonSorter.compareValues - strings', () => {
        TestRunner.assertEqual(JsonSorter.compareValues('a', 'b'), -1, 'a < b');
        TestRunner.assertEqual(JsonSorter.compareValues('b', 'a'), 1, 'b > a');
    });

    TestRunner.test('JsonSorter.compareValues - null', () => {
        TestRunner.assertEqual(JsonSorter.compareValues(null, 1), 1, 'null > 1');
        TestRunner.assertEqual(JsonSorter.compareValues(1, null), -1, '1 < null');
    });

    TestRunner.test('JsonSorter.sortArray', () => {
        const arr = [{ name: 'c' }, { name: 'a' }, { name: 'b' }];
        const sorted = JsonSorter.sortArray(arr, 'name', 'asc');
        TestRunner.assertEqual(sorted[0].name, 'a', 'first should be a');
        TestRunner.assertEqual(sorted[2].name, 'c', 'last should be c');
    });

    TestRunner.test('JsonSorter.applySort - array', () => {
        const result = JsonSorter.applySort('[3, 1, 2]', null, 'asc');
        TestRunner.assert(result.success, 'should succeed');
        TestRunner.assertDeepEqual(result.data, [1, 2, 3], 'should sort numbers');
    });

    TestRunner.test('JsonSorter.applySort - object keys', () => {
        const result = JsonSorter.applySort('{"b": 1, "a": 2}', null, 'asc');
        TestRunner.assert(result.success, 'should succeed');
        const keys = Object.keys(result.data);
        TestRunner.assertDeepEqual(keys, ['a', 'b'], 'should sort object keys');
    });

    // ==================== DiffEngine Tests ====================
    TestRunner.test('DiffEngine.escapeHtml', () => {
        TestRunner.assertEqual(DiffEngine.escapeHtml('<script>'), '&lt;script&gt;', 'should escape HTML');
        TestRunner.assertEqual(DiffEngine.escapeHtml('a & b'), 'a &amp; b', 'should escape ampersand');
        TestRunner.assertEqual(DiffEngine.escapeHtml('"hello"'), '&quot;hello&quot;', 'should escape quotes');
    });

    TestRunner.test('DiffEngine.buildSideBySide', () => {
        const result = DiffEngine.buildSideBySide('hello\nworld', 'hello\nthere');
        TestRunner.assert(result.rows.length > 0, 'should have rows');
        TestRunner.assert(result.stats.modified > 0, 'should detect modifications');
    });

    TestRunner.test('DiffEngine.buildUnified', () => {
        const result = DiffEngine.buildUnified('hello\nworld', 'hello\nthere');
        TestRunner.assert(result.lines.length > 0, 'should have lines');
        TestRunner.assert(result.stats.modified > 0, 'should detect modifications');
    });

    TestRunner.test('DiffEngine.computeRawDiff - shared result', () => {
        const rawDiff = DiffEngine.computeRawDiff('hello', 'world');
        const sideBySide = DiffEngine.buildSideBySideFromRaw(rawDiff);
        const unified = DiffEngine.buildUnifiedFromRaw(rawDiff);
        TestRunner.assert(sideBySide.rows.length > 0, 'sideBySide should have rows');
        TestRunner.assert(unified.lines.length > 0, 'unified should have lines');
    });

    // ==================== EncodingDetector Tests ====================
    TestRunner.test('EncodingDetector.detectBOM - UTF-8', () => {
        const bytes = new Uint8Array([0xEF, 0xBB, 0xBF, 0x48, 0x65, 0x6C, 0x6C, 0x6F]);
        const bom = EncodingDetector.detectBOM(bytes);
        TestRunner.assert(bom !== null, 'should detect UTF-8 BOM');
        TestRunner.assertEqual(bom.encoding, 'utf-8', 'should be utf-8');
    });

    TestRunner.test('EncodingDetector.detectBOM - UTF-16 LE', () => {
        const bytes = new Uint8Array([0xFF, 0xFE, 0x48, 0x00]);
        const bom = EncodingDetector.detectBOM(bytes);
        TestRunner.assert(bom !== null, 'should detect UTF-16 LE BOM');
        TestRunner.assertEqual(bom.encoding, 'utf-16le', 'should be utf-16le');
    });

    TestRunner.test('EncodingDetector.detectBOM - no BOM', () => {
        const bytes = new Uint8Array([0x48, 0x65, 0x6C, 0x6C, 0x6F]);
        const bom = EncodingDetector.detectBOM(bytes);
        TestRunner.assert(bom === null, 'should return null for no BOM');
    });

    TestRunner.test('EncodingDetector.heuristicDetect - ASCII', () => {
        const bytes = new Uint8Array([0x48, 0x65, 0x6C, 0x6C, 0x6F]);
        const encoding = EncodingDetector.heuristicDetect(bytes);
        TestRunner.assertEqual(encoding, 'utf-8', 'should detect ASCII as utf-8');
    });

    TestRunner.test('EncodingDetector.getSupportedEncodings', () => {
        const encodings = EncodingDetector.getSupportedEncodings();
        TestRunner.assert(encodings.includes('utf-8'), 'should include utf-8');
        TestRunner.assert(encodings.includes('gbk'), 'should include gbk');
        TestRunner.assert(encodings.includes('big5'), 'should include big5');
    });

    // ==================== Storage Tests ====================
    TestRunner.test('Storage.formatTime - just now', () => {
        const now = Date.now();
        const result = Storage.formatTime(now);
        TestRunner.assertEqual(result, '刚刚', 'should show 刚刚');
    });

    TestRunner.test('Storage.formatTime - minutes ago', () => {
        const fiveMinAgo = Date.now() - 5 * 60 * 1000;
        const result = Storage.formatTime(fiveMinAgo);
        TestRunner.assert(result.includes('分钟前'), 'should show minutes ago');
    });

    TestRunner.test('Storage.formatTime - hours ago', () => {
        const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
        const result = Storage.formatTime(twoHoursAgo);
        TestRunner.assert(result.includes('小时前'), 'should show hours ago');
    });

    // ==================== MergeManager Tests ====================
    TestRunner.test('MergeManager._simpleMerge - no conflict', () => {
        const base = ['a', 'b', 'c'];
        const ours = ['a', 'x', 'c'];
        const theirs = ['a', 'y', 'c'];
        // Both modify same line - should conflict
        const result = MergeManager._simpleMerge(base, ours, theirs);
        const hasConflict = result.some(l => l.startsWith('<<<<<<<'));
        TestRunner.assert(hasConflict, 'should detect conflict');
    });

    TestRunner.test('MergeManager._simpleMerge - no changes', () => {
        const base = ['a', 'b', 'c'];
        const result = MergeManager._simpleMerge(base, base, base);
        const hasConflict = result.some(l => l.startsWith('<<<<<<<'));
        TestRunner.assert(!hasConflict, 'should have no conflict');
        TestRunner.assertDeepEqual(result, ['a', 'b', 'c'], 'should keep original');
    });

    // ==================== FindReplace Tests ====================
    TestRunner.test('FindReplace.createForSide - returns API', () => {
        const ta = document.createElement('textarea');
        ta.value = 'hello world hello';
        const fb = document.createElement('div'); fb.style.display = 'none';
        const fi = document.createElement('input');
        const ri = document.createElement('input');
        const fc = { checked: false, addEventListener: () => {} };
        const ce = document.createElement('span');
        const api = FindReplace.createForSide('original', ta, fb, fi, ri, fc, ce);
        TestRunner.assert(typeof api.open === 'function', 'should have open');
        TestRunner.assert(typeof api.close === 'function', 'should have close');
        TestRunner.assert(typeof api.findNext === 'function', 'should have findNext');
        TestRunner.assert(typeof api.findPrev === 'function', 'should have findPrev');
        TestRunner.assert(typeof api.replace === 'function', 'should have replace');
        TestRunner.assert(typeof api.destroy === 'function', 'should have destroy');
        TestRunner.assert(typeof api.getMatches === 'function', 'should have getMatches');
        api.destroy();
    });

    TestRunner.test('FindReplace - open shows find bar', () => {
        const ta = document.createElement('textarea'); ta.value = 'test';
        const fb = document.createElement('div'); fb.style.display = 'none';
        const fi = document.createElement('input'); fi.value = '';
        const ri = document.createElement('input');
        const fc = { checked: false, addEventListener: () => {} };
        const ce = document.createElement('span');
        const api = FindReplace.createForSide('original', ta, fb, fi, ri, fc, ce);
        api.open();
        TestRunner.assertEqual(fb.style.display, '', 'should show find bar');
        api.destroy();
    });

    TestRunner.test('FindReplace - close hides find bar and clears state', () => {
        const ta = document.createElement('textarea'); ta.value = 'hello world';
        const fb = document.createElement('div'); fb.style.display = '';
        const fi = document.createElement('input'); fi.value = 'hello';
        const ri = document.createElement('input');
        const fc = { checked: false, addEventListener: () => {} };
        const ce = document.createElement('span');
        const api = FindReplace.createForSide('original', ta, fb, fi, ri, fc, ce);
        api.close();
        TestRunner.assertEqual(fb.style.display, 'none', 'should hide find bar');
        TestRunner.assertEqual(api.getMatches().length, 0, 'should clear matches');
        TestRunner.assertEqual(api.getIndex(), -1, 'should reset index');
        api.destroy();
    });

    TestRunner.test('FindReplace - find matches via input event', () => {
        const ta = document.createElement('textarea'); ta.value = 'hello world hello';
        const fb = document.createElement('div');
        const fi = document.createElement('input'); fi.value = 'hello';
        const ri = document.createElement('input');
        const fc = { checked: false, addEventListener: () => {} };
        const ce = document.createElement('span');
        let inputHandler;
        fi.addEventListener = (evt, fn) => { if (evt === 'input') inputHandler = fn; };
        const api = FindReplace.createForSide('original', ta, fb, fi, ri, fc, ce);
        inputHandler();
        TestRunner.assertEqual(api.getMatches().length, 2, 'should find 2 matches');
        TestRunner.assertEqual(api.getIndex(), 0, 'should start at index 0');
        api.destroy();
    });

    TestRunner.test('FindReplace - findNext and findPrev navigation', () => {
        const ta = document.createElement('textarea'); ta.value = 'aaa bbb aaa';
        const fb = document.createElement('div');
        const fi = document.createElement('input'); fi.value = 'aaa';
        const ri = document.createElement('input');
        const fc = { checked: false, addEventListener: () => {} };
        const ce = document.createElement('span');
        let inputHandler;
        fi.addEventListener = (evt, fn) => { if (evt === 'input') inputHandler = fn; };
        const api = FindReplace.createForSide('original', ta, fb, fi, ri, fc, ce);
        inputHandler();
        TestRunner.assertEqual(api.getIndex(), 0, 'should start at 0');
        api.findNext();
        TestRunner.assertEqual(api.getIndex(), 1, 'findNext should go to 1');
        api.findNext();
        TestRunner.assertEqual(api.getIndex(), 0, 'findNext should wrap to 0');
        api.findPrev();
        TestRunner.assertEqual(api.getIndex(), 1, 'findPrev should wrap to 1');
        api.destroy();
    });

    TestRunner.test('FindReplace - replace single match', () => {
        const ta = document.createElement('textarea'); ta.value = 'hello world';
        const fb = document.createElement('div');
        const fi = document.createElement('input'); fi.value = 'world';
        const ri = document.createElement('input'); ri.value = 'earth';
        const fc = { checked: false, addEventListener: () => {} };
        const ce = document.createElement('span');
        let inputHandler;
        fi.addEventListener = (evt, fn) => { if (evt === 'input') inputHandler = fn; };
        const api = FindReplace.createForSide('original', ta, fb, fi, ri, fc, ce);
        inputHandler();
        const result = api.replace(false);
        TestRunner.assert(result, 'should return true');
        TestRunner.assertEqual(ta.value, 'hello earth', 'should replace match');
        api.destroy();
    });

    TestRunner.test('FindReplace - replace all matches', () => {
        const ta = document.createElement('textarea'); ta.value = 'foo bar foo baz foo';
        const fb = document.createElement('div');
        const fi = document.createElement('input'); fi.value = 'foo';
        const ri = document.createElement('input'); ri.value = 'qux';
        const fc = { checked: false, addEventListener: () => {} };
        const ce = document.createElement('span');
        fi.addEventListener = () => {};
        const api = FindReplace.createForSide('original', ta, fb, fi, ri, fc, ce);
        const result = api.replace(true);
        TestRunner.assert(result, 'should return true');
        TestRunner.assertEqual(ta.value, 'qux bar qux baz qux', 'should replace all');
        api.destroy();
    });

    TestRunner.test('FindReplace - replace with no match returns false', () => {
        const ta = document.createElement('textarea'); ta.value = 'hello';
        const fb = document.createElement('div');
        const fi = document.createElement('input'); fi.value = 'xyz';
        const ri = document.createElement('input'); ri.value = 'abc';
        const fc = { checked: false, addEventListener: () => {} };
        const ce = document.createElement('span');
        fi.addEventListener = () => {};
        const api = FindReplace.createForSide('original', ta, fb, fi, ri, fc, ce);
        const result = api.replace(false);
        TestRunner.assert(!result, 'should return false');
        TestRunner.assertEqual(ta.value, 'hello', 'should not change text');
        api.destroy();
    });

    TestRunner.test('FindReplace - empty query does nothing', () => {
        const ta = document.createElement('textarea'); ta.value = 'hello';
        const fb = document.createElement('div');
        const fi = document.createElement('input'); fi.value = '';
        const ri = document.createElement('input');
        const fc = { checked: false, addEventListener: () => {} };
        const ce = document.createElement('span');
        fi.addEventListener = () => {};
        const api = FindReplace.createForSide('original', ta, fb, fi, ri, fc, ce);
        const result = api.replace(true);
        TestRunner.assert(result === undefined, 'should return undefined');
        api.destroy();
    });

    TestRunner.test('FindReplace - destroy clears state', () => {
        const ta = document.createElement('textarea'); ta.value = 'hello world hello';
        const fb = document.createElement('div');
        const fi = document.createElement('input'); fi.value = 'hello';
        const ri = document.createElement('input');
        const fc = { checked: false, addEventListener: () => {} };
        const ce = document.createElement('span');
        let inputHandler;
        fi.addEventListener = (evt, fn) => { if (evt === 'input') inputHandler = fn; };
        const api = FindReplace.createForSide('original', ta, fb, fi, ri, fc, ce);
        inputHandler();
        TestRunner.assertEqual(api.getMatches().length, 2, 'should have matches before destroy');
        api.destroy();
        TestRunner.assertEqual(api.getMatches().length, 0, 'should clear matches on destroy');
        TestRunner.assertEqual(api.getIndex(), -1, 'should reset index on destroy');
    });

    TestRunner.test('FindReplace - case sensitive search', () => {
        const ta = document.createElement('textarea'); ta.value = 'Hello HELLO hello';
        const fb = document.createElement('div');
        const fi = document.createElement('input'); fi.value = 'hello';
        const ri = document.createElement('input');
        const fc = { checked: true, addEventListener: () => {} }; // case sensitive
        const ce = document.createElement('span');
        let changeHandler;
        fi.addEventListener = () => {};
        fc.addEventListener = (evt, fn) => { if (evt === 'change') changeHandler = fn; };
        const api = FindReplace.createForSide('original', ta, fb, fi, ri, fc, ce);
        changeHandler();
        TestRunner.assertEqual(api.getMatches().length, 1, 'should find 1 case-sensitive match');
        api.destroy();
    });

    // ==================== DiffEngine.renderRow Tests ====================
    TestRunner.test('DiffEngine.renderSideBySide - renders rows', () => {
        const rows = [
            { left: { num: 1, text: 'hello', type: 'deleted' }, right: { num: 1, text: 'world', type: 'added' } },
            { left: { num: 2, text: 'foo', type: 'unchanged' }, right: { num: 2, text: 'foo', type: 'unchanged' } },
        ];
        const html = DiffEngine.renderSideBySide(rows, 'words', 'plaintext', false);
        TestRunner.assert(html.includes('diff-row'), 'should contain diff rows');
        TestRunner.assert(html.includes('hello'), 'should contain left text');
        TestRunner.assert(html.includes('world'), 'should contain right text');
    });

    // Run all tests
    const summary = TestRunner.run();
    console.log(`Tests complete: ${summary.passed} passed, ${summary.failed} failed`);
});
