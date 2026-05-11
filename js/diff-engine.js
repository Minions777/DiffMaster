/**
 * Diff Engine Module
 * Wraps jsdiff library with enhanced diff capabilities
 */
const DiffEngine = (() => {

    /**
     * Compute line-by-line diff
     */
    function diffLines(oldText, newText) {
        return Diff.diffLines(oldText, newText);
    }

    /**
     * Compute word-by-word diff
     */
    function diffWords(oldText, newText) {
        return Diff.diffWords(oldText, newText);
    }

    /**
     * Compute character-by-character diff
     */
    function diffChars(oldText, newText) {
        return Diff.diffChars(oldText, newText);
    }

    /**
     * Compute structured JSON diff (compares parsed objects)
     */
    function diffJson(oldText, newText) {
        return Diff.diffJson(oldText, newText);
    }

    /**
     * Build side-by-side diff lines with statistics
     * Returns paired rows: each row has { left, right } with num, text, type
     */
    function buildSideBySide(oldText, newText) {
        const diffResult = Diff.diffLines(oldText, newText);

        const rows = [];
        let stats = { added: 0, deleted: 0, modified: 0, unchanged: 0 };
        let leftNum = 0;
        let rightNum = 0;

        /**
         * Parse a part's value into lines, preserving intentional trailing blank lines.
         * Only strips the trailing empty element when the value does NOT end with '\n'
         * (i.e. the empty string is a split artifact, not a real blank line).
         */
        function parseLines(val) {
            const lines = val.split('\n');
            if (!val.endsWith('\n') && lines[lines.length - 1] === '') {
                lines.pop();
            }
            return lines;
        }

        let i = 0;
        while (i < diffResult.length) {
            const part = diffResult[i];

            if (!part.added && !part.removed) {
                // Unchanged lines
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
                // Modification: removed + added pair
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
     * HTML escape
     */
    function escapeHtml(str) {
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    /**
     * Render side-by-side diff to HTML
     * Uses table-like rows for perfect left/right alignment
     */
    function renderSideBySide(rows, mode) {
        const totalRows = rows.length;
        const contextLines = 3;

        if (totalRows === 0) return '';

        // Check if all unchanged
        const allUnchanged = rows.every(r => r.left.type === 'unchanged' && r.right.type === 'unchanged');

        // Determine which rows to show
        const showRow = new Array(totalRows);
        if (allUnchanged) {
            showRow.fill(true);
        } else {
            showRow.fill(false);
            for (let i = 0; i < totalRows; i++) {
                if (rows[i].left.type !== 'unchanged' || rows[i].right.type !== 'unchanged') {
                    for (let j = Math.max(0, i - contextLines); j <= Math.min(totalRows - 1, i + contextLines); j++) {
                        showRow[j] = true;
                    }
                }
            }
        }

        let html = '';
        let hiddenStart = -1;

        for (let i = 0; i < totalRows; i++) {
            if (!showRow[i]) {
                if (hiddenStart === -1) hiddenStart = i;
                continue;
            }

            // Insert fold marker if we just skipped lines
            if (hiddenStart !== -1) {
                const hiddenCount = i - hiddenStart;
                html += `<div class="diff-fold" data-start="${hiddenStart}" data-end="${i}" data-gen="${currentDiffGeneration}" onclick="DiffEngine.expandFold(this)">`;
                html += `⋯ ${hiddenCount} 行未变化内容（点击展开）`;
                html += `</div>`;
                hiddenStart = -1;
            }

            const { left, right } = rows[i];

            // Inline highlight for modified pairs
            let leftContent, rightContent;
            const isModifiedPair = left.type === 'deleted' && right.type === 'added';

            if (mode !== 'lines' && isModifiedPair) {
                const inline = highlightInlineChanges(left.text, right.text, mode);
                leftContent = inline.oldHtml;
                rightContent = inline.newHtml;
            } else {
                leftContent = escapeHtml(left.text);
                rightContent = escapeHtml(right.text);
            }

            const leftType = left.type;
            const rightType = right.type;
            const leftIndicator = leftType === 'deleted' ? '✗' : leftType === 'added' ? '✓' : '';
            const rightIndicator = rightType === 'added' ? '✓' : rightType === 'deleted' ? '✗' : '';

            html += `<div class="diff-row${isModifiedPair ? ' diff-row-modified' : ''}">`;
            // Left side
            html += `<div class="diff-side diff-side-left diff-line-${leftType}">`;
            html += `<span class="diff-line-num">${left.num != null ? left.num : ''}</span>`;
            html += `<span class="diff-line-indicator">${leftIndicator}</span>`;
            html += `<span class="diff-line-content">${leftContent || '&nbsp;'}</span>`;
            html += `</div>`;
            // Right side
            html += `<div class="diff-side diff-side-right diff-line-${rightType}">`;
            html += `<span class="diff-line-num">${right.num != null ? right.num : ''}</span>`;
            html += `<span class="diff-line-indicator">${rightIndicator}</span>`;
            html += `<span class="diff-line-content">${rightContent || '&nbsp;'}</span>`;
            html += `</div>`;
            html += `</div>`;
        }

        // Trailing fold
        if (hiddenStart !== -1) {
            const hiddenCount = totalRows - hiddenStart;
            html += `<div class="diff-fold" data-start="${hiddenStart}" data-end="${totalRows}" data-gen="${currentDiffGeneration}" onclick="DiffEngine.expandFold(this)">`;
            html += `⋯ ${hiddenCount} 行未变化内容（点击展开）`;
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
        const rows = currentDiffRows;

        if (!rows || gen !== currentDiffGeneration) return;

        let html = '';
        for (let i = start; i < end; i++) {
            const { left, right } = rows[i];
            const leftType = left.type;
            const rightType = right.type;

            html += `<div class="diff-row">`;
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

    // Store rows for fold expansion with generation tracking
    let currentDiffRows = null;
    let currentDiffGeneration = 0;

    /**
     * Render and store rows (call from app.js)
     */
    function render(rows, mode) {
        currentDiffRows = rows;
        currentDiffGeneration++;
        return renderSideBySide(rows, mode);
    }

    return {
        diffLines, diffWords, diffChars, diffJson,
        buildSideBySide, highlightInlineChanges, escapeHtml,
        render, expandFold
    };
})();
