/**
 * JSON Sorting Module
 * Detects JSON arrays, extracts keys, provides type-aware sorting
 */
const JsonSorter = (() => {

    /**
     * Check if text is a JSON array and return parsed result
     */
    function tryParseJsonArray(text) {
        try {
            const parsed = JSON.parse(text);
            if (Array.isArray(parsed)) {
                return { isArray: true, data: parsed };
            }
            return { isArray: false, data: parsed };
        } catch (e) {
            return { isArray: false, data: null, error: e.message };
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
     * Apply sort and return formatted JSON string
     */
    function applySort(text, key, direction = 'asc') {
        const { isArray, data, error } = tryParseJsonArray(text);
        if (!isArray || error) return { success: false, error: error || 'Not a JSON array' };

        const sorted = key ? sortArray(data, key, direction) : sortArray(data, null, direction);
        return {
            success: true,
            result: JSON.stringify(sorted, null, 2),
            data: sorted
        };
    }

    return {
        tryParseJsonArray, extractKeys, compareValues,
        sortArray, sortArrayNested, applySort
    };
})();
