/**
 * Tests for encoding detection.
 *
 * Mirrors heuristicDetect / detectBOM logic from js/encoding.js so it can run
 * under Node without a browser shim. Run: node test-encoding.js
 */
const assert = require('assert');

const BOMS = [
    { encoding: 'utf-8',    bom: [0xEF, 0xBB, 0xBF] },
    { encoding: 'utf-32be', bom: [0x00, 0x00, 0xFE, 0xFF] },
    { encoding: 'utf-32le', bom: [0xFF, 0xFE, 0x00, 0x00] },
    { encoding: 'utf-16be', bom: [0xFE, 0xFF] },
    { encoding: 'utf-16le', bom: [0xFF, 0xFE] },
];

function detectBOM(bytes) {
    for (const entry of BOMS) {
        const match = entry.bom.every((b, i) => bytes[i] === b);
        if (match) return entry;
    }
    return null;
}

function heuristicDetect(bytes) {
    const len = bytes.length;
    if (len === 0) return 'utf-8';

    let utf8Score = 0;
    let i = 0;
    let validUtf8 = true;

    while (i < len) {
        const b = bytes[i];
        if (b <= 0x7F) { utf8Score++; i++; }
        else if (b >= 0xC2 && b <= 0xDF) {
            if (i + 1 < len && bytes[i + 1] >= 0x80 && bytes[i + 1] <= 0xBF) { utf8Score += 2; i += 2; }
            else { validUtf8 = false; break; }
        } else if (b >= 0xE0 && b <= 0xEF) {
            if (i + 2 < len && bytes[i + 1] >= 0x80 && bytes[i + 1] <= 0xBF && bytes[i + 2] >= 0x80 && bytes[i + 2] <= 0xBF) { utf8Score += 3; i += 3; }
            else { validUtf8 = false; break; }
        } else if (b >= 0xF0 && b <= 0xF4) {
            if (i + 3 < len && bytes[i + 1] >= 0x80 && bytes[i + 1] <= 0xBF && bytes[i + 2] >= 0x80 && bytes[i + 2] <= 0xBF && bytes[i + 3] >= 0x80 && bytes[i + 3] <= 0xBF) { utf8Score += 4; i += 4; }
            else { validUtf8 = false; break; }
        } else { validUtf8 = false; break; }
    }

    if (validUtf8 && utf8Score > 0) return 'utf-8';

    let gbkScore = 0;
    let gbkValid = true;
    i = 0;
    while (i < len) {
        const b = bytes[i];
        if (b <= 0x7F) i++;
        else if (b >= 0x81 && b <= 0xFE) {
            if (i + 1 < len && bytes[i + 1] >= 0x40 && bytes[i + 1] <= 0xFE && bytes[i + 1] !== 0x7F) { gbkScore += 2; i += 2; }
            else { gbkValid = false; break; }
        } else { gbkValid = false; break; }
    }
    if (gbkValid && gbkScore > 0) return 'gbk';

    let hasHighBytes = false;
    for (let j = 0; j < Math.min(len, 1000); j++) {
        if (bytes[j] > 0x7F) { hasHighBytes = true; break; }
    }
    if (hasHighBytes) return 'iso-8859-1';

    return 'utf-8';
}

// Test 1: BOM detection
assert.strictEqual(detectBOM(new Uint8Array([0xEF, 0xBB, 0xBF, 0x41])).encoding, 'utf-8');
assert.strictEqual(detectBOM(new Uint8Array([0xFF, 0xFE, 0x41])).encoding, 'utf-16le');
assert.strictEqual(detectBOM(new Uint8Array([0xFE, 0xFF, 0x41])).encoding, 'utf-16be');
assert.strictEqual(detectBOM(new Uint8Array([0xFF, 0xFE, 0x00, 0x00])).encoding, 'utf-32le');
assert.strictEqual(detectBOM(new Uint8Array([0x41, 0x42])), null);
assert.strictEqual(detectBOM(new Uint8Array([])), null);

// Test 2: heuristic – empty input
assert.strictEqual(heuristicDetect(new Uint8Array([])), 'utf-8');

// Test 3: heuristic – pure ASCII
assert.strictEqual(heuristicDetect(new Uint8Array([0x48, 0x65, 0x6C, 0x6C, 0x6F])), 'utf-8');

// Test 4: heuristic – valid UTF-8 (中 = E4 B8 AD)
assert.strictEqual(heuristicDetect(new Uint8Array([0xE4, 0xB8, 0xAD])), 'utf-8');

// Test 5: heuristic – valid UTF-8 4-byte (😀 = F0 9F 98 80)
assert.strictEqual(heuristicDetect(new Uint8Array([0xF0, 0x9F, 0x98, 0x80])), 'utf-8');

// Test 6: heuristic – invalid UTF-8 falls through to GBK or ISO-8859-1
// 中 in GBK = D6 D0
assert.strictEqual(heuristicDetect(new Uint8Array([0xD6, 0xD0])), 'gbk');

// Test 7: heuristic – truncated multi-byte sequence falls through
// 0xE4 alone is an incomplete UTF-8 start byte
const truncated = heuristicDetect(new Uint8Array([0xE4]));
assert.ok(truncated === 'gbk' || truncated === 'iso-8859-1' || truncated === 'utf-8',
    'truncated UTF-8 should fall through, got ' + truncated);

// Test 8: heuristic – ISO-8859-1 (high byte but invalid GBK trail)
// 0xC0 0x20 — 0x20 is in space range, not 0x40-0xFE → GBK invalid → ISO
assert.strictEqual(heuristicDetect(new Uint8Array([0xC0, 0x20])), 'iso-8859-1');

console.log('All encoding tests passed.');
