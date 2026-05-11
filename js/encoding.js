/**
 * Encoding Detection & Conversion Module
 * Detects BOM, auto-identifies encoding, converts to UTF-8
 */
const EncodingDetector = (() => {
    // BOM signatures
    const BOMS = [
        { encoding: 'utf-8',    bom: [0xEF, 0xBB, 0xBF],       label: 'UTF-8 BOM' },
        { encoding: 'utf-32be', bom: [0x00, 0x00, 0xFE, 0xFF],  label: 'UTF-32 BE' },
        { encoding: 'utf-32le', bom: [0xFF, 0xFE, 0x00, 0x00],  label: 'UTF-32 LE' },
        { encoding: 'utf-16be', bom: [0xFE, 0xFF],               label: 'UTF-16 BE' },
        { encoding: 'utf-16le', bom: [0xFF, 0xFE],               label: 'UTF-16 LE' },
    ];

    // All supported encodings
    const ENCODINGS = [
        'utf-8', 'utf-16', 'utf-16le', 'utf-16be', 'utf-32',
        'gbk', 'gb2312', 'gb18030', 'big5',
        'iso-8859-1', 'windows-1252', 'euc-kr', 'euc-jp', 'ascii'
    ];

    /**
     * Detect BOM from a Uint8Array
     */
    function detectBOM(bytes) {
        for (const entry of BOMS) {
            const match = entry.bom.every((b, i) => bytes[i] === b);
            if (match) return entry;
        }
        return null;
    }

    /**
     * Heuristic encoding detection from byte patterns
     */
    function heuristicDetect(bytes) {
        const len = bytes.length;
        if (len === 0) return 'utf-8';

        let utf8Score = 0;
        let gbkScore = 0;
        let i = 0;
        let validUtf8 = true;

        while (i < len) {
            const b = bytes[i];

            if (b <= 0x7F) {
                // ASCII
                utf8Score++;
                gbkScore++;
                i++;
            } else if (b >= 0xC2 && b <= 0xDF) {
                // UTF-8 2-byte
                if (i + 1 < len && bytes[i + 1] >= 0x80 && bytes[i + 1] <= 0xBF) {
                    utf8Score += 2;
                    i += 2;
                } else {
                    validUtf8 = false;
                    break;
                }
            } else if (b >= 0xE0 && b <= 0xEF) {
                // UTF-8 3-byte (common for CJK)
                if (i + 2 < len && bytes[i + 1] >= 0x80 && bytes[i + 1] <= 0xBF &&
                    bytes[i + 2] >= 0x80 && bytes[i + 2] <= 0xBF) {
                    utf8Score += 3;
                    i += 3;
                } else {
                    validUtf8 = false;
                    break;
                }
            } else if (b >= 0xF0 && b <= 0xF4) {
                // UTF-8 4-byte
                if (i + 3 < len && bytes[i + 1] >= 0x80 && bytes[i + 1] <= 0xBF &&
                    bytes[i + 2] >= 0x80 && bytes[i + 2] <= 0xBF &&
                    bytes[i + 3] >= 0x80 && bytes[i + 3] <= 0xBF) {
                    utf8Score += 4;
                    i += 4;
                } else {
                    validUtf8 = false;
                    break;
                }
            } else {
                validUtf8 = false;
                break;
            }
        }

        if (validUtf8 && utf8Score > 0) return 'utf-8';

        // Check GBK pattern: lead byte 0x81-0xFE, trail byte 0x40-0xFE
        i = 0;
        let gbkValid = true;
        while (i < len) {
            const b = bytes[i];
            if (b <= 0x7F) {
                i++;
            } else if (b >= 0x81 && b <= 0xFE) {
                if (i + 1 < len && bytes[i + 1] >= 0x40 && bytes[i + 1] <= 0xFE && bytes[i + 1] !== 0x7F) {
                    gbkScore += 2;
                    i += 2;
                } else {
                    gbkValid = false;
                    break;
                }
            } else {
                gbkValid = false;
                break;
            }
        }

        if (gbkValid && gbkScore > 0) return 'gbk';

        // Check for high bytes suggesting ISO-8859-1
        let hasHighBytes = false;
        for (let j = 0; j < Math.min(len, 1000); j++) {
            if (bytes[j] > 0x7F) { hasHighBytes = true; break; }
        }
        if (hasHighBytes) return 'iso-8859-1';

        return 'utf-8';
    }

    /**
     * Decode a file/blob/text with auto or manual encoding
     */
    async function decode(input, encoding = 'auto') {
        let bytes;

        if (input instanceof ArrayBuffer) {
            bytes = new Uint8Array(input);
        } else if (input instanceof Uint8Array) {
            bytes = input;
        } else if (input instanceof Blob) {
            const ab = await input.arrayBuffer();
            bytes = new Uint8Array(ab);
        } else if (typeof input === 'string') {
            return input; // Already a string
        } else {
            throw new Error('Unsupported input type');
        }

        let detectedEncoding = encoding;

        if (encoding === 'auto') {
            // 1. Check BOM
            const bom = detectBOM(bytes);
            if (bom) {
                detectedEncoding = bom.encoding;
                // Skip BOM bytes
                bytes = bytes.slice(bom.bom.length);
            } else {
                // 2. Heuristic detection
                detectedEncoding = heuristicDetect(bytes);
            }
        }

        // Normalize encoding name for TextDecoder
        const encMap = {
            'gb2312': 'gbk',
            'gb18030': 'gb18030',
            'utf-32': 'utf-32le',
        };
        const textDecoderEnc = encMap[detectedEncoding] || detectedEncoding;

        try {
            const decoder = new TextDecoder(textDecoderEnc, { fatal: false });
            return decoder.decode(bytes);
        } catch (e) {
            // Fallback to UTF-8
            const decoder = new TextDecoder('utf-8', { fatal: false });
            return decoder.decode(bytes);
        }
    }

    /**
     * Read a File object and return decoded text
     */
    async function readFile(file, encoding = 'auto') {
        const ab = await file.arrayBuffer();
        return decode(ab, encoding);
    }

    /**
     * Get list of supported encodings
     */
    function getSupportedEncodings() {
        return [...ENCODINGS];
    }

    return { detectBOM, heuristicDetect, decode, readFile, getSupportedEncodings };
})();
