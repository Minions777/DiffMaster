/**
 * Storage & History Module
 * Manages localStorage for comparison history
 */
const Storage = (() => {
    const STORAGE_KEY = 'diffmaster_history';
    const MAX_RECORDS = 50;

    /**
     * Get all history records
     */
    function getHistory() {
        try {
            const data = localStorage.getItem(STORAGE_KEY);
            return data ? JSON.parse(data) : [];
        } catch {
            return [];
        }
    }

    /**
     * Save a comparison to history
     */
    function saveRecord(original, modified, stats) {
        const records = getHistory();
        const record = {
            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            timestamp: Date.now(),
            original: original.slice(0, 2000), // Limit stored content
            modified: modified.slice(0, 2000),
            originalLength: original.length,
            modifiedLength: modified.length,
            stats: { ...stats }
        };

        records.unshift(record);

        // Trim to max
        if (records.length > MAX_RECORDS) {
            records.length = MAX_RECORDS;
        }

        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
        } catch (e) {
            // Storage full - remove oldest records
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

    /**
     * Get a single record by ID
     */
    function getRecord(id) {
        const records = getHistory();
        return records.find(r => r.id === id) || null;
    }

    /**
     * Delete a record by ID
     */
    function deleteRecord(id) {
        const records = getHistory().filter(r => r.id !== id);
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
        } catch (e) {
            // localStorage write failed (quota or disabled) — fall through silently
        }
        return records;
    }

    /**
     * Clear all history
     */
    function clearHistory() {
        localStorage.removeItem(STORAGE_KEY);
    }

    /**
     * Format timestamp to human-readable
     */
    function formatTime(timestamp) {
        const d = new Date(timestamp);
        const now = new Date();
        const diff = now - d;

        if (diff < 60000) return '刚刚';
        if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;

        const pad = n => n.toString().padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }

    return { getHistory, saveRecord, getRecord, deleteRecord, clearHistory, formatTime };
})();
