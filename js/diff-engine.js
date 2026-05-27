/**
 * Diff Engine Module
 * Wraps jsdiff library with enhanced diff capabilities
 */
const DiffEngine = (() => {

    // Shared configuration constants (single source of truth)
    const CONFIG = {
        LINE_HEIGHT: 19.5,   // Must match editor line-height: 13px * 1.5
        FOLD_CONTEXT_LINES: 3,
    };
    const LINE_HEIGHT = CONFIG.LINE_HEIGHT;

    /**
     * Compute raw diff result (shared between buildSideBySide and buildUnified)
     */
    function computeRawDiff(oldText, newText, options) {
        return Diff.diffLines(oldText, newText, options);
    }

    /**
     * Compute word-by-word diff
     */
    function diffWords(oldText, newText, options) {
        return Diff.diffWords(oldText, newText, options);
    }

    /**
     * Compute character-by-character diff
     */
    function diffChars(oldText, newText, options) {
        return Diff.diffChars(oldText, newText, options);
    }

    /**
     * Compute structured JSON diff (compares parsed objects)
     */
    function diffJson(oldText, newText) {
        return Diff.diffJson(oldText, newText);
    }

    /**
     * Parse diff value into lines, handling trailing newline
     */
    function parseLines(val) {
        const lines = val.split('\n');
        if (!val.endsWith('\n') && lines[lines.length - 1] === '') {
            lines.pop();
        }
        return lines;
    }

    /**
     * Build side-by-side diff lines with statistics from raw diff result
     */
    function buildSideBySideFromRaw(diffResult) {

        const rows = [];
        let stats = { added: 0, deleted: 0, modified: 0, unchanged: 0 };
        let leftNum = 0;
        let rightNum = 0;

        let i = 0;
        while (i < diffResult.length) {
            const part = diffResult[i];

            if (!part.added && !part.removed) {
                const lines = parseLines(part.value);
                for (const line of lines) {
                    leftNum++;
                    rightNum++;
                    rows.push({
                        left: { num: leftNum, text: line, type: 'unchanged' },
                        right: { num: rightNum, text: line, type: 'unchanged' }
                    });
                }
                stats.unchanged += lines.length;
                i++;
            } else if (part.removed && i + 1 < diffResult.length && diffResult[i + 1].added) {
                const removedLines = parseLines(part.value);
                const addedLines = parseLines(diffResult[i + 1].value);

                const maxLen = Math.max(removedLines.length, addedLines.length);
                for (let j = 0; j < maxLen; j++) {
                    const left = j < removedLines.length
                        ? { num: ++leftNum, text: removedLines[j], type: 'deleted' }
                        : { num: null, text: '', type: 'empty' };
                    const right = j < addedLines.length
                        ? { num: ++rightNum, text: addedLines[j], type: 'added' }
                        : { num: null, text: '', type: 'empty' };
                    rows.push({ left, right });
                }

                const pairs = Math.min(removedLines.length, addedLines.length);
                stats.modified += pairs;
                stats.deleted += Math.max(0, removedLines.length - addedLines.length);
                stats.added += Math.max(0, addedLines.length - removedLines.length);
                i += 2;
            } else if (part.removed) {
                const lines = parseLines(part.value);
                for (const line of lines) {
                    rows.push({
                        left: { num: ++leftNum, text: line, type: 'deleted' },
                        right: { num: null, text: '', type: 'empty' }
                    });
                }
                stats.deleted += lines.length;
                i++;
            } else if (part.added) {
                const lines = parseLines(part.value);
                for (const line of lines) {
                    rows.push({
                        left: { num: null, text: '', type: 'empty' },
                        right: { num: ++rightNum, text: line, type: 'added' }
                    });
                }
                stats.added += lines.length;
                i++;
            } else {
                i++;
            }
        }

        return { rows, stats };
    }

    /**
     * Build side-by-side diff lines with statistics
     * Returns paired rows: each row has { left, right } with num, text, type
     */
    function buildSideBySide(oldText, newText, options) {
        const diffResult = computeRawDiff(oldText, newText, options);
        return buildSideBySideFromRaw(diffResult);
    }

    /**
     * Build unified diff lines from raw diff result
     */
    function buildUnifiedFromRaw(diffResult) {
        const lines = [];
        let stats = { added: 0, deleted: 0, modified: 0, unchanged: 0 };
        let oldNum = 0;
        let newNum = 0;

        for (const part of diffResult) {
            const textLines = parseLines(part.value);
            if (!part.added && !part.removed) {
                for (const line of textLines) {
                    oldNum++;
                    newNum++;
                    lines.push({ oldNum, newNum, text: line, type: 'unchanged' });
                    stats.unchanged++;
                }
            } else if (part.removed) {
                for (const line of textLines) {
                    oldNum++;
                    lines.push({ oldNum, newNum: null, text: line, type: 'deleted' });
                    stats.deleted++;
                }
            } else if (part.added) {
                for (const line of textLines) {
                    newNum++;
                    lines.push({ oldNum: null, newNum, text: line, type: 'added' });
                    stats.added++;
                }
            }
        }

        return { lines, stats };
    }

    /**
     * Build unified diff lines
     */
    function buildUnified(oldText, newText, options) {
        const diffResult = computeRawDiff(oldText, newText, options);
        return buildUnifiedFromRaw(diffResult);
    }

    /**
     * Build inline diff highlighting for modified line pairs
     */
    function highlightInlineChanges(oldLine, newLine, mode) {
        const diffFn = mode === 'chars' ? Diff.diffChars : Diff.diffWords;
        const result = diffFn(oldLine, newLine);

        let oldHtml = '';
        let newHtml = '';

        for (const part of result) {
            const escaped = escapeHtml(part.value);
            if (part.added) {
                newHtml += `<span class="diff-char-added">${escaped}</span>`;
            } else if (part.removed) {
                oldHtml += `<span class="diff-char-deleted">${escaped}</span>`;
            } else {
                oldHtml += escaped;
                newHtml += escaped;
            }
        }

        return { oldHtml, newHtml };
    }

    /**
     * HTML escape (single-pass)
     */
    const _escapeMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    const _escapeRe = /[&<>"']/g;
    function escapeHtml(str) {
        return str.replace(_escapeRe, ch => _escapeMap[ch]);
    }

    /**
     * Apply syntax highlighting if hljs is available
     */
    function syntaxHighlight(text, lang) {
        if (typeof hljs === 'undefined') return escapeHtml(text);
        if (!lang || lang === 'auto' || lang === 'plaintext') return escapeHtml(text);
        try {
            const result = hljs.highlight(text, { language: lang, ignoreIllegals: true });
            return result.value;
        } catch {
            return escapeHtml(text);
        }
    }

    /**
     * Batch highlight multiple lines with a single hljs call.
     * Returns an array of highlighted HTML strings, one per input line.
     */
    function syntaxHighlightLines(lines, lang) {
        if (typeof hljs === 'undefined' || !lang || lang === 'auto' || lang === 'plaintext') {
            return lines.map(l => escapeHtml(l));
        }
        try {
            const fullText = lines.join('\n');
            const result = hljs.highlight(fullText, { language: lang, ignoreIllegals: true });
            return splitHighlightedLines(result.value, lines.length);
        } catch {
            return lines.map(l => escapeHtml(l));
        }
    }

    /**
     * Split highlighted HTML into per-line strings, carrying open <span> tags across lines.
     */
    function splitHighlightedLines(html, lineCount) {
        const rawLines = html.split('\n');
        const output = [];
        let openTags = []; // stack of opening <span ...> tags

        for (let i = 0; i < rawLines.length; i++) {
            let line = rawLines[i];
            // Prepend any open tags from previous lines
            let prefix = openTags.join('');
            // Process this line to track tag open/close
            // Match all <span ...> and </span> tags
            const tagRe = /<(\/?)span[^>]*>/g;
            let m;
            while ((m = tagRe.exec(line)) !== null) {
                if (m[1] === '/') {
                    // closing tag
                    openTags.pop();
                } else {
                    // opening tag - store the full tag
                    openTags.push(m[0]);
                }
            }
            // Append closing tags for any still-open spans
            let suffix = '</span>'.repeat(openTags.length);
            output.push(prefix + line + suffix);
        }

        // Pad if hljs produced fewer lines (shouldn't happen normally)
        while (output.length < lineCount) {
            output.push('');
        }

        return output.slice(0, lineCount);
    }

    /**
     * Auto-detect language from content
     */
    function detectLanguage(text) {
        if (typeof hljs === 'undefined') return 'plaintext';
        const trimmed = text.trim();
        if (!trimmed) return 'plaintext';

        if (/^\s*\{[\s\S]*\}\s*$/.test(trimmed) || /^\s*\[[\s\S]*\]\s*$/.test(trimmed)) return 'json';
        if (/^\s*<\?php/.test(trimmed)) return 'php';
        if (/^\s*<(!DOCTYPE|html|svg)/i.test(trimmed)) return 'html';
        if (/^\s*(import|export|const|let|var|function|class)\s/m.test(trimmed) && /[;{}()]/.test(trimmed)) return 'javascript';
        if (/^\s*(def |class |import |from |print\()/m.test(trimmed)) return 'python';
        if (/^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER)\s/i.test(trimmed)) return 'sql';
        if (/^\s*#include\s/.test(trimmed)) return 'cpp';
        if (/^\s*(package|func |import ")/m.test(trimmed)) return 'go';
        if (/^\s*(fn |let mut|use |mod )/m.test(trimmed)) return 'rust';

        try {
            const result = hljs.highlightAuto(trimmed, [
                'javascript', 'typescript', 'python', 'java', 'cpp', 'csharp',
                'go', 'rust', 'php', 'ruby', 'sql', 'css', 'xml', 'yaml',
                'markdown', 'shell'
            ]);
            if (result.language && result.relevance > 5) return result.language;
        } catch { /* ignore */ }

        return 'plaintext';
    }

    /**
     * Compute which rows are visible (within contextLines of a change)
     */
    function _computeShowRow(rows, contextLines) {
        const total = rows.length;
        const show = new Array(total);
        if (rows.every(r => r.left.type === 'unchanged' && r.right.type === 'unchanged')) {
            show.fill(true);
        } else {
            show.fill(false);
            for (let i = 0; i < total; i++) {
                if (rows[i].left.type !== 'unchanged' || rows[i].right.type !== 'unchanged') {
                    for (let j = Math.max(0, i - contextLines); j <= Math.min(total - 1, i + contextLines); j++) show[j] = true;
                }
            }
        }
        return show;
    }

    /**
     * Collect texts for batch syntax highlighting from visible rows
     */
    function _collectHighlightTexts(rows, visibleIndices, mode, lang) {
        const useHighlight = lang && lang !== 'auto' && lang !== 'plaintext';
        if (!useHighlight) return { useHighlight: false, hlLeftResults: [], hlRightResults: [], hlLeftMap: new Map(), hlRightMap: new Map() };
        const hlLeftTexts = [], hlRightTexts = [];
        const hlLeftMap = new Map(), hlRightMap = new Map();
        for (const i of visibleIndices) {
            const { left, right } = rows[i];
            if (mode === 'lines' || !(left.type === 'deleted' && right.type === 'added')) {
                hlLeftMap.set(i, hlLeftTexts.length);
                hlLeftTexts.push(left.text);
                hlRightMap.set(i, hlRightTexts.length);
                hlRightTexts.push(right.text);
            }
        }
        return {
            useHighlight: true,
            hlLeftResults: syntaxHighlightLines(hlLeftTexts, lang),
            hlRightResults: syntaxHighlightLines(hlRightTexts, lang),
            hlLeftMap, hlRightMap,
        };
    }

    /**
     * Render a single diff row to HTML
     */
    function _renderDiffRow(row, i, mode, hl, mergeMode) {
        const { left, right } = row;
        const isModifiedPair = left.type === 'deleted' && right.type === 'added';
        let leftContent, rightContent;
        if (mode !== 'lines' && isModifiedPair) {
            const inline = highlightInlineChanges(left.text, right.text, mode);
            leftContent = inline.oldHtml;
            rightContent = inline.newHtml;
        } else if (hl.useHighlight) {
            leftContent = hl.hlLeftResults[hl.hlLeftMap.get(i)];
            rightContent = hl.hlRightResults[hl.hlRightMap.get(i)];
        } else {
            leftContent = escapeHtml(left.text);
            rightContent = escapeHtml(right.text);
        }
        const lType = left.type;
        const rType = right.type;
        const lInd = lType === 'deleted' ? '✗' : lType === 'added' ? '✓' : '';
        const rInd = rType === 'added' ? '✓' : rType === 'deleted' ? '✗' : '';
        const hasChanges = lType !== 'unchanged' || rType !== 'unchanged';

        let html = `<div class="diff-row${isModifiedPair ? ' diff-row-modified' : ''}${hasChanges && mergeMode ? ' has-changes' : ''}" data-left-line="${left.num != null ? left.num : -1}" data-right-line="${right.num != null ? right.num : -1}" data-row-idx="${i}">`;
        html += `<div class="diff-side diff-side-left diff-line-${lType}">`;
        html += `<span class="diff-line-num">${left.num != null ? left.num : ''}</span>`;
        html += `<span class="diff-line-indicator">${lInd}</span>`;
        html += `<span class="diff-line-content">${leftContent || '&nbsp;'}</span></div>`;
        html += `<div class="diff-side diff-side-right diff-line-${rType}">`;
        html += `<span class="diff-line-num">${right.num != null ? right.num : ''}</span>`;
        html += `<span class="diff-line-indicator">${rInd}</span>`;
        html += `<span class="diff-line-content">${rightContent || '&nbsp;'}</span></div>`;
        if (mergeMode) {
            html += `<div class="merge-actions">`;
            if (lType === 'deleted' || rType === 'added') {
                html += `<button class="merge-accept" data-row="${i}" title="接受修改">✓</button>`;
                html += `<button class="merge-reject" data-row="${i}" title="拒绝修改">✗</button>`;
            }
            html += `</div>`;
        }
        html += `</div>`;
        return html;
    }

    /**
     * Render a fold marker for hidden unchanged rows
     */
    function _renderFoldHTML(start, end, hiddenCount, gen) {
        const foldHeight = hiddenCount * LINE_HEIGHT;
        return `<div class="diff-fold" data-start="${start}" data-end="${end}" data-lines="${hiddenCount}" data-gen="${gen}" style="height:${foldHeight}px">⋯ ${hiddenCount} 行未变化内容（点击展开）</div>`;
    }

    /**
     * Render side-by-side diff to HTML
     */
    function renderSideBySide(rows, mode, lang, mergeMode) {
        if (rows.length === 0) return '';

        const showRow = _computeShowRow(rows, 3);
        const visibleIndices = [];
        for (let i = 0; i < rows.length; i++) { if (showRow[i]) visibleIndices.push(i); }
        const hl = _collectHighlightTexts(rows, visibleIndices, mode, lang);

        let html = '';
        let hiddenStart = -1;
        for (let i = 0; i < rows.length; i++) {
            if (!showRow[i]) {
                if (hiddenStart === -1) hiddenStart = i;
                continue;
            }
            if (hiddenStart !== -1) {
                html += _renderFoldHTML(hiddenStart, i, i - hiddenStart, currentDiffGeneration);
                hiddenStart = -1;
            }
            html += _renderDiffRow(rows[i], i, mode, hl, mergeMode);
        }
        if (hiddenStart !== -1) {
            html += _renderFoldHTML(hiddenStart, rows.length, rows.length - hiddenStart, currentDiffGeneration);
        }
        return html;
    }

    /**
     * Render unified diff to HTML
     */
    function renderUnified(lines, lang) {
        if (lines.length === 0) return '';

        let html = '';
        const contextLines = 3;
        const totalLines = lines.length;

        const showLine = new Array(totalLines);
        const allUnchanged = lines.every(l => l.type === 'unchanged');
        if (allUnchanged) {
            showLine.fill(true);
        } else {
            showLine.fill(false);
            for (let i = 0; i < totalLines; i++) {
                if (lines[i].type !== 'unchanged') {
                    for (let j = Math.max(0, i - contextLines); j <= Math.min(totalLines - 1, i + contextLines); j++) {
                        showLine[j] = true;
                    }
                }
            }
        }

        // Batch highlight only visible lines (folded lines render unchanged)
        const visibleTexts = [];
        const visibleMap = new Map();
        for (let i = 0; i < totalLines; i++) {
            if (showLine[i]) {
                visibleMap.set(i, visibleTexts.length);
                visibleTexts.push(lines[i].text);
            }
        }
        const hlVisible = syntaxHighlightLines(visibleTexts, lang);
        const getHl = idx => {
            const k = visibleMap.get(idx);
            return k != null ? hlVisible[k] : escapeHtml(lines[idx].text);
        };

        let hiddenStart = -1;

        for (let i = 0; i < totalLines; i++) {
            if (!showLine[i]) {
                if (hiddenStart === -1) hiddenStart = i;
                continue;
            }

            if (hiddenStart !== -1) {
                const hiddenCount = i - hiddenStart;
                html += `<div class="diff-fold diff-fold-unified">`;
                html += `⋯ ${hiddenCount} 行未变化内容（点击展开）`;
                html += `</div>`;
                html += `<div class="diff-fold-hidden" style="display:none;">`;
                for (let k = hiddenStart; k < i; k++) {
                    const l = lines[k];
                    html += `<div class="diff-unified-row diff-unified-unchanged" data-line="${k}">`;
                    html += `<span class="diff-line-num-old">${l.oldNum || ''}</span>`;
                    html += `<span class="diff-line-num-new">${l.newNum || ''}</span>`;
                    html += `<span class="diff-line-prefix"></span>`;
                    html += `<span class="diff-line-content">${getHl(k) || '&nbsp;'}</span>`;
                    html += `</div>`;
                }
                html += `</div>`;
                hiddenStart = -1;
            }

            const l = lines[i];
            const prefix = l.type === 'added' ? '+' : l.type === 'deleted' ? '-' : ' ';

            html += `<div class="diff-unified-row diff-unified-${l.type}" data-line="${i}">`;
            html += `<span class="diff-line-num-old">${l.oldNum || ''}</span>`;
            html += `<span class="diff-line-num-new">${l.newNum || ''}</span>`;
            html += `<span class="diff-line-prefix">${prefix}</span>`;
            html += `<span class="diff-line-content">${getHl(i) || '&nbsp;'}</span>`;
            html += `</div>`;
        }

        return html;
    }

    /**
     * Expand a fold marker - show the hidden lines
     */
    function expandFold(foldEl) {
        const start = parseInt(foldEl.dataset.start);
        const end = parseInt(foldEl.dataset.end);
        const gen = parseInt(foldEl.dataset.gen);
        const rows = _rowRegistry.get(gen);

        if (!rows) return;

        let html = '';
        for (let i = start; i < end; i++) {
            const { left, right } = rows[i];
            const leftType = left.type;
            const rightType = right.type;
            const leftLineVal = left.num != null ? left.num : -1;
            const rightLineVal = right.num != null ? right.num : -1;

            html += `<div class="diff-row" data-left-line="${leftLineVal}" data-right-line="${rightLineVal}" data-row-idx="${i}">`;
            html += `<div class="diff-side diff-side-left diff-line-${leftType}">`;
            html += `<span class="diff-line-num">${left.num != null ? left.num : ''}</span>`;
            html += `<span class="diff-line-indicator"></span>`;
            html += `<span class="diff-line-content">${escapeHtml(left.text) || '&nbsp;'}</span>`;
            html += `</div>`;
            html += `<div class="diff-side diff-side-right diff-line-${rightType}">`;
            html += `<span class="diff-line-num">${right.num != null ? right.num : ''}</span>`;
            html += `<span class="diff-line-indicator"></span>`;
            html += `<span class="diff-line-content">${escapeHtml(right.text) || '&nbsp;'}</span>`;
            html += `</div>`;
            html += `</div>`;
        }

        foldEl.insertAdjacentHTML('afterend', html);
        foldEl.remove();
    }

    /**
     * Build merged text from rows with accept/reject decisions
     */
    function buildMergedText(rows, decisions) {
        const result = [];
        for (let i = 0; i < rows.length; i++) {
            const { left, right } = rows[i];
            const decision = decisions[i];

            if (left.type === 'unchanged' && right.type === 'unchanged') {
                result.push(left.text);
            } else if (left.type === 'deleted' && right.type === 'added') {
                if (decision === 'accept') {
                    result.push(right.text);
                } else if (decision === 'reject') {
                    result.push(left.text);
                }
                // If no decision yet, skip (neither old nor new)
            } else if (left.type === 'deleted') {
                if (decision === 'reject') {
                    result.push(left.text);
                }
                // accept = delete the line
            } else if (right.type === 'added') {
                if (decision === 'accept') {
                    result.push(right.text);
                }
                // reject = skip the added line
            } else if (left.type === 'empty') {
                if (right.type === 'added' && decision === 'accept') {
                    result.push(right.text);
                }
            } else if (right.type === 'empty') {
                if (left.type === 'deleted' && decision === 'reject') {
                    result.push(left.text);
                }
            }
        }
        return result.join('\n');
    }

    // Generation-keyed row registry for fold expansion (replaces global mutable state)
    const _rowRegistry = new Map();
    let currentDiffGeneration = 0;

    /**
     * Render and store rows (call from app.js)
     */
    function render(rows, mode, lang, mergeMode) {
        currentDiffGeneration++;
        _rowRegistry.set(currentDiffGeneration, rows);
        // Clean up old generations (keep only last 3)
        for (const key of _rowRegistry.keys()) {
            if (key < currentDiffGeneration - 2) _rowRegistry.delete(key);
        }
        return renderSideBySide(rows, mode, lang, mergeMode);
    }

    return {
        LINE_HEIGHT,
        CONFIG,
        computeRawDiff,
        buildSideBySide, buildSideBySideFromRaw,
        buildUnified, buildUnifiedFromRaw,
        highlightInlineChanges, escapeHtml,
        syntaxHighlight, syntaxHighlightLines, detectLanguage,
        render, renderSideBySide, renderUnified,
        expandFold, buildMergedText
    };
})();
