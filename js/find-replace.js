/**
 * Find & Replace Module
 * Handles incremental search and replace in text editors
 */
const FindReplace = (() => {
    const _matches = { original: [], modified: [] };
    const _index = { original: -1, modified: -1 };

    // Editor line height for scroll calculation (set externally)
    let _lineHeight = 19.5;

    function setLineHeight(h) { _lineHeight = h; }

    function debounce(fn, ms) {
        let timer;
        return function(...args) { clearTimeout(timer); timer = setTimeout(() => fn.apply(this, args), ms); };
    }

    function open(side, textarea, findBar, findInput, findCase, countEl) {
        findBar.style.display = '';
        findInput.focus();
        // Auto-select currently selected text
        const sel = textarea.value.substring(textarea.selectionStart, textarea.selectionEnd);
        if (sel) { findInput.value = sel; _doFind(side, textarea, findInput, findCase, countEl); }
    }

    function close(side, findBar) {
        findBar.style.display = 'none';
        _matches[side] = [];
        _index[side] = -1;
    }

    function _doFind(side, textarea, findInput, findCase, countEl) {
        const query = findInput.value;
        if (!query) { _matches[side] = []; _index[side] = -1; countEl.textContent = '0/0'; return; }

        const text = textarea.value;
        const isRegex = findInput.dataset && findInput.dataset.regex === 'true';
        const flags = findCase.checked ? 'g' : 'gi';
        const matches = [];
        try {
            const pattern = isRegex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const re = new RegExp(pattern, flags);
            let m;
            while ((m = re.exec(text)) !== null) {
                matches.push({ start: m.index, end: m.index + m[0].length });
                if (matches.length > 10000) break;
            }
        } catch { /* invalid regex */ }

        _matches[side] = matches;
        _index[side] = matches.length > 0 ? 0 : -1;
        countEl.textContent = matches.length > 0 ? '1/' + matches.length : '0/0';
        if (matches.length > 0) _highlight(side, textarea, countEl);
    }

    function _next(side, textarea, countEl) {
        const matches = _matches[side];
        if (matches.length === 0) return;
        _index[side] = (_index[side] + 1) % matches.length;
        _highlight(side, textarea, countEl);
    }

    function _prev(side, textarea, countEl) {
        const matches = _matches[side];
        if (matches.length === 0) return;
        _index[side] = (_index[side] - 1 + matches.length) % matches.length;
        _highlight(side, textarea, countEl);
    }

    function _highlight(side, textarea, countEl) {
        const match = _matches[side][_index[side]];
        if (!match) return;
        textarea.focus();
        textarea.setSelectionRange(match.start, match.end);
        countEl.textContent = (_index[side] + 1) + '/' + _matches[side].length;
        // Scroll to selection
        const linesBefore = textarea.value.substring(0, match.start).split('\n').length;
        textarea.scrollTop = (linesBefore - 3) * _lineHeight;
    }

    function replace(side, all, textarea, findInput, replaceInput, findCase, countEl) {
        const query = findInput.value;
        const replacement = replaceInput.value;
        if (!query) return;

        if (all) {
            const isRegex = findInput.dataset && findInput.dataset.regex === 'true';
            const flags = findCase.checked ? 'g' : 'gi';
            const pattern = isRegex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            textarea.value = textarea.value.replace(new RegExp(pattern, flags), replacement);
            return true; // signal that content changed
        } else {
            const match = _matches[side][_index[side]];
            if (!match) return false;
            textarea.value = textarea.value.substring(0, match.start) + replacement + textarea.value.substring(match.end);
            return true;
        }
    }

    // Public API – factory-style to avoid global element dependency
    function createForSide(side, textarea, findBar, findInput, replaceInput, findCase, countEl) {
        const debouncedFind = debounce(() => _doFind(side, textarea, findInput, findCase, countEl), 150);

        findInput.addEventListener('input', debouncedFind);
        findInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.shiftKey ? _prev(side, textarea, countEl) : _next(side, textarea, countEl);
            }
        });
        findCase.addEventListener('change', () => _doFind(side, textarea, findInput, findCase, countEl));

        return {
            open: () => open(side, textarea, findBar, findInput, findCase, countEl),
            close: () => close(side, findBar),
            findNext: () => _next(side, textarea, countEl),
            findPrev: () => _prev(side, textarea, countEl),
            replace: (all) => replace(side, all, textarea, findInput, replaceInput, findCase, countEl),
            getMatches: () => _matches[side],
            getIndex: () => _index[side],
        };
    }

    return { createForSide, setLineHeight };
})();