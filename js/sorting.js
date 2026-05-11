/**
 * JSON Sorting Module
 * Detects JSON (arrays and objects), extracts keys, provides type-aware sorting
 */
const JsonSorter = (() => {

    /**
     * Try to parse text as JSON, auto-cleaning invisible characters
     */
    function tryParseJson(text) {
        const cleaned = text.trim().replace(/[\uFEFF\u200B\u200C\u200D]/g, '');
        try {
            const parsed = JSON.parse(cleaned);
            const type = Array.isArray(parsed) ? 'array'
                : (parsed && typeof parsed === 'object' ? 'object' : 'primitive');
            return { success: true, data: parsed, type };
        } catch (e) {
            return { success: false, data: null, type: null, error: e.message };
        }
    }

    /**
     * Extract all available keys from a JSON array
     */
    function extractKeys(arr) {
        if (!Array.isArray(arr) || arr.length === 0) return [];

        const keySet = new Set();
        for (const item of arr) {
            if (item && typeof item === 'object' && !Array.isArray(item)) {
                for (const key of Object.keys(item)) {
                    keySet.add(key);
                }
            }
        }
        return Array.from(keySet).sort();
    }

    /**
     * Type-aware comparison for sorting
     */
    function compareValues(a, b, direction = 'asc') {
        const dir = direction === 'asc' ? 1 : -1;

        // null always last
        if (a === null && b === null) return 0;
        if (a === null) return 1;
        if (b === null) return -1;

        // undefined always last
        if (a === undefined && b === undefined) return 0;
        if (a === undefined) return 1;
        if (b === undefined) return -1;

        // Type grouping: boolean < number < string < object < array
        const typeOrder = { 'boolean': 0, 'number': 1, 'string': 2, 'object': 3 };
        const aType = Array.isArray(a) ? 'array' : typeof a;
        const bType = Array.isArray(b) ? 'array' : typeof b;

        if (aType !== bType) {
            const aOrder = typeOrder[aType] ?? 3;
            const bOrder = typeOrder[bType] ?? 3;
            return (aOrder - bOrder) * dir;
        }

        // Same type comparison
        if (aType === 'boolean') {
            return ((a === b ? 0 : a ? 1 : -1)) * dir;
        }

        if (aType === 'number') {
            return (a - b) * dir;
        }

        if (aType === 'string') {
            return a.localeCompare(b, 'zh-CN') * dir;
        }

        // Objects/arrays: compare by JSON string
        return JSON.stringify(a).localeCompare(JSON.stringify(b)) * dir;
    }

    /**
     * Sort a JSON array by a specific key
     */
    function sortArray(arr, key, direction = 'asc') {
        return [...arr].sort((a, b) => {
            const aVal = key ? (a && typeof a === 'object' ? a[key] : a) : a;
            const bVal = key ? (b && typeof b === 'object' ? b[key] : b) : b;
            return compareValues(aVal, bVal, direction);
        });
    }

    /**
     * Sort by nested path (e.g., "address.city")
     */
    function getNestedValue(obj, path) {
        return path.split('.').reduce((o, k) => (o && o[k] !== undefined) ? o[k] : undefined, obj);
    }

    function sortArrayNested(arr, path, direction = 'asc') {
        return [...arr].sort((a, b) => {
            const aVal = getNestedValue(a, path);
            const bVal = getNestedValue(b, path);
            return compareValues(aVal, bVal, direction);
        });
    }

    /**
     * Recursively sort object keys alphabetically
     */
    function sortObjectKeys(obj, direction = 'asc') {
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;

        const sorted = {};
        const keys = Object.keys(obj).sort((a, b) => {
            const cmp = a.localeCompare(b, 'zh-CN');
            return direction === 'asc' ? cmp : -cmp;
        });
        for (const key of keys) {
            const val = obj[key];
            // Recursively sort nested objects
            if (val && typeof val === 'object' && !Array.isArray(val)) {
                sorted[key] = sortObjectKeys(val, direction);
            } else if (Array.isArray(val)) {
                sorted[key] = sortArrayItems(val, direction);
            } else {
                sorted[key] = val;
            }
        }
        return sorted;
    }

    /**
     * Recursively sort array items (apply sortObjectKeys to object elements)
     */
    function sortArrayItems(arr, direction = 'asc') {
        return arr.map(item => {
            if (item && typeof item === 'object' && !Array.isArray(item)) {
                return sortObjectKeys(item, direction);
            } else if (Array.isArray(item)) {
                return sortArrayItems(item, direction);
            }
            return item;
        });
    }

    /**
     * Apply sort and return formatted JSON string
     * Supports both JSON arrays and JSON objects
     */
    function applySort(text, key, direction = 'asc') {
        const { success, data, type, error } = tryParseJson(text);
        if (!success) return { success: false, error };

        if (type === 'array') {
            const sorted = key ? sortArray(data, key, direction) : sortArray(data, null, direction);
            // Also recursively sort keys in object elements
            const processed = sortArrayItems(sorted, direction);
            return {
                success: true,
                result: JSON.stringify(processed, null, 2),
                data: processed,
                type: 'array'
            };
        }

        if (type === 'object') {
            const sorted = sortObjectKeys(data, direction);
            return {
                success: true,
                result: JSON.stringify(sorted, null, 2),
                data: sorted,
                type: 'object'
            };
        }

        // Primitive value — nothing to sort
        return { success: false, error: 'Primitive value cannot be sorted as JSON' };
    }

    return {
        tryParseJson, extractKeys, compareValues,
        sortArray, sortArrayNested, sortObjectKeys, applySort
    };
})();
