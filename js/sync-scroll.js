/**
 * Sync Scroll Module
 * Bidirectional scroll synchronization between diff output and editors.
 *
 * Public API: SyncScroll.init(deps) -> { setup, teardown, invalidate }
 *
 * `deps` = { els, isEnabled }
 *   isEnabled() -> boolean (whether scroll-sync is currently on)
 */
const SyncScroll = (() => {
    const LH = DiffEngine.CONFIG.LINE_HEIGHT;
    const PAD = 8;

    let _deps = null;
    let _handlers = { diff: null, original: null, modified: null };
    let _rowIndex = null;

    function init(deps) {
        _deps = deps;
        return { setup, teardown, invalidate };
    }

    function invalidate() { _rowIndex = null; }

    function teardown() {
        const els = _deps.els;
        if (_handlers.diff) els.diffOutput.removeEventListener('scroll', _handlers.diff);
        if (_handlers.original) els.originalText.removeEventListener('scroll', _handlers.original);
        if (_handlers.modified) els.modifiedText.removeEventListener('scroll', _handlers.modified);
        _handlers = { diff: null, original: null, modified: null };
    }

    function buildRowIndex() {
        const els = _deps.els;
        const children = els.diffOutput.children;
        const index = [];
        for (let i = 0; i < children.length; i++) {
            const el = children[i];
            const top = el.offsetTop;
            const leftLine = parseInt(el.dataset.leftLine);
            const rightLine = parseInt(el.dataset.rightLine);
            index.push({
                top,
                bottom: top + el.offsetHeight,
                leftLine: isNaN(leftLine) ? -1 : leftLine,
                rightLine: isNaN(rightLine) ? -1 : rightLine,
            });
        }
        const leftLineMap = new Map();
        const rightLineMap = new Map();
        for (const entry of index) {
            if (entry.leftLine > 0 && !leftLineMap.has(entry.leftLine)) leftLineMap.set(entry.leftLine, entry);
            if (entry.rightLine > 0 && !rightLineMap.has(entry.rightLine)) rightLineMap.set(entry.rightLine, entry);
        }
        _rowIndex = { entries: index, leftLineMap, rightLineMap };
    }

    function setup() {
        const els = _deps.els;
        teardown();

        requestAnimationFrame(() => buildRowIndex());

        let scrolling = false;
        let rafId = 0;

        function findRowAtScroll(scrollTop) {
            if (!_rowIndex || _rowIndex.entries.length === 0) return null;
            const entries = _rowIndex.entries;
            let lo = 0, hi = entries.length - 1;
            while (lo <= hi) {
                const mid = (lo + hi) >>> 1;
                if (entries[mid].bottom <= scrollTop) lo = mid + 1;
                else if (entries[mid].top > scrollTop) hi = mid - 1;
                else return entries[mid];
            }
            return entries[Math.min(lo, entries.length - 1)];
        }

        function editorLineAtTop(textarea) {
            return Math.floor(Math.max(0, textarea.scrollTop - PAD) / LH) + 1;
        }

        function scrollEditorToLine(textarea, lineNum, pixelOffset) {
            textarea.scrollTop = Math.max(0, PAD + (lineNum - 1) * LH + pixelOffset);
        }

        function scrollDiffToEntry(entry, pixelOffset) {
            els.diffOutput.scrollTop = Math.max(0, entry.top + pixelOffset);
        }

        function syncToEditors() {
            if (scrolling || !_deps.isEnabled()) return;
            scrolling = true;
            cancelAnimationFrame(rafId);
            rafId = requestAnimationFrame(() => {
                if (!_rowIndex) buildRowIndex();
                const entry = findRowAtScroll(els.diffOutput.scrollTop);
                if (entry) {
                    const offset = els.diffOutput.scrollTop - entry.top;
                    if (entry.leftLine > 0) scrollEditorToLine(els.originalText, entry.leftLine, offset);
                    if (entry.rightLine > 0) scrollEditorToLine(els.modifiedText, entry.rightLine, offset);
                }
                scrolling = false;
            });
        }

        function syncFromEditor(source, side) {
            if (scrolling || !_deps.isEnabled()) return;
            scrolling = true;
            cancelAnimationFrame(rafId);
            rafId = requestAnimationFrame(() => {
                if (!_rowIndex) buildRowIndex();
                const lineNum = editorLineAtTop(source);
                const pixelOffset = Math.max(0, source.scrollTop - PAD - (lineNum - 1) * LH);

                const attr = side === 'original' ? 'leftLine' : 'rightLine';
                const map = attr === 'leftLine' ? _rowIndex.leftLineMap : _rowIndex.rightLineMap;
                const entry = map.get(lineNum);
                if (entry) {
                    scrollDiffToEntry(entry, pixelOffset);
                } else {
                    const ratio = source.scrollTop / (source.scrollHeight - source.clientHeight || 1);
                    els.diffOutput.scrollTop = ratio * (els.diffOutput.scrollHeight - els.diffOutput.clientHeight);
                }

                const other = source === els.originalText ? els.modifiedText : els.originalText;
                const otherAttr = side === 'original' ? 'rightLine' : 'leftLine';
                const otherMap = otherAttr === 'leftLine' ? _rowIndex.leftLineMap : _rowIndex.rightLineMap;
                const otherEntry = otherMap.get(lineNum);
                if (otherEntry) {
                    const otherTargetLine = otherAttr === 'leftLine' ? otherEntry.leftLine : otherEntry.rightLine;
                    if (otherTargetLine > 0) {
                        scrollEditorToLine(other, otherTargetLine, pixelOffset);
                    }
                } else {
                    const otherLineNum = findNearestLine(otherMap, lineNum);
                    if (otherLineNum > 0) {
                        scrollEditorToLine(other, otherLineNum, pixelOffset);
                    }
                }

                scrolling = false;
            });
        }

        function findNearestLine(map, target) {
            if (map.has(target)) return target;
            const keys = Array.from(map.keys());
            if (keys.length === 0) return target;
            let best = keys[0];
            let bestDist = Math.abs(best - target);
            for (let i = 1; i < keys.length; i++) {
                const d = Math.abs(keys[i] - target);
                if (d < bestDist) { best = keys[i]; bestDist = d; }
            }
            return best;
        }

        _handlers.diff = syncToEditors;
        _handlers.original = () => syncFromEditor(els.originalText, 'original');
        _handlers.modified = () => syncFromEditor(els.modifiedText, 'modified');

        els.diffOutput.addEventListener('scroll', _handlers.diff, { passive: true });
        els.originalText.addEventListener('scroll', _handlers.original, { passive: true });
        els.modifiedText.addEventListener('scroll', _handlers.modified, { passive: true });
    }

    return { init };
})();
