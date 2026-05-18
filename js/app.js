/**
 * DiffMaster Main Application Controller
 */
const App = (() => {
    const $ = id => document.getElementById(id);
    const $$ = sel => document.querySelectorAll(sel);

    function debounce(fn, ms) {
        let timer;
        return function(...args) { clearTimeout(timer); timer = setTimeout(() => fn.apply(this, args), ms); };
    }

    let els = {};
    let currentDiffData = null;
    let isScrollSync = true;
    let currentMode = 'text'; // text | image | merge3
    let mergeDecisions = {};
    let _diffCache = null; // { original, modified, options, sideBySide, unified }
    const LH = 19.5; // editor + diff line height (matches DiffEngine.LINE_HEIGHT)
    const PAD = 8; // editor and diff-output top padding

    function init() {
        cacheElements();
        syncEncodingOptions();
        bindEvents();
        initTheme();
        initResize();
        updateLineNumbers('original');
        updateLineNumbers('modified');
        loadFromUrl();
    }

    function syncEncodingOptions() {
        $$('.panel-encoding').forEach(sel => {
            const prev = sel.value;
            sel.innerHTML = els.globalEncoding.innerHTML;
            if (prev) sel.value = prev;
        });
    }

    function cacheElements() {
        els = {
            themeToggle: $('themeToggle'), themeIcon: $('themeIcon'), themeLabel: $('themeLabel'),
            originalPanel: $('originalPanel'), diffPanel: $('diffPanel'), modifiedPanel: $('modifiedPanel'),
            resizeHandle1: $('resizeHandle1'), resizeHandle2: $('resizeHandle2'),
            originalText: $('originalText'), modifiedText: $('modifiedText'),
            originalLineNums: $('originalLineNums'), modifiedLineNums: $('modifiedLineNums'),
            diffOutput: $('diffOutput'),
            btnCompare: $('btnCompare'), btnSwap: $('btnSwap'), btnClear: $('btnClear'), btnHistory: $('btnHistory'),
            globalEncoding: $('globalEncoding'), diffMode: $('diffMode'),
            statAdded: $('statAdded'), statDeleted: $('statDeleted'), statModified: $('statModified'), statTotal: $('statTotal'),
            historyModal: $('historyModal'), historyList: $('historyList'), historyClose: $('historyClose'), historyClearAll: $('historyClearAll'),
            toast: $('toast'), originalSort: $('originalSort'), modifiedSort: $('modifiedSort'),
            // New elements
            optIgnoreWS: $('optIgnoreWS'), optIgnoreCase: $('optIgnoreCase'),
            viewMode: $('viewMode'), syntaxLang: $('syntaxLang'),
            btnExport: $('btnExport'), exportMenu: $('exportMenu'), btnShare: $('btnShare'), btnMergeMode: $('btnMergeMode'),
            modeTabs: $('modeTabs'), mainContent: $('mainContent'),
            imageDiffSection: $('imageDiffSection'), merge3Section: $('merge3Section'),
            mergePanel: $('mergePanel'), mergeOutput: $('mergeOutput'),
            btnCopyMergeResult: $('btnCopyMergeResult'), btnDownloadMergeResult: $('btnDownloadMergeResult'), btnCloseMerge: $('btnCloseMerge'),
            findBarOriginal: $('findBarOriginal'), findBarModified: $('findBarModified'),
            findInputOriginal: $('findInputOriginal'), findInputModified: $('findInputModified'),
            findCountOriginal: $('findCountOriginal'), findCountModified: $('findCountModified'),
            replaceInputOriginal: $('replaceInputOriginal'), replaceInputModified: $('replaceInputModified'),
            // Image diff
            imageDiffMode: $('imageDiffMode'), btnImageCompare: $('btnImageCompare'),
            imageUploadOriginal: $('imageUploadOriginal'), imageUploadModified: $('imageUploadModified'),
            imageDiffResult: $('imageDiffResult'), imageDiffCanvas: $('imageDiffCanvas'), imageSwipeHandle: $('imageSwipeHandle'),
            // 3-way merge
            merge3Base: $('merge3Base'), merge3Ours: $('merge3Ours'), merge3Theirs: $('merge3Theirs'),
            btnMerge3: $('btnMerge3'), btnCopyMerged: $('btnCopyMerged'),
            merge3Result: $('merge3Result'), merge3Output: $('merge3Output'),
        };
    }

    /* ==================== Events ==================== */
    function bindEvents() {
        els.themeToggle.addEventListener('click', toggleTheme);
        els.btnCompare.addEventListener('click', doCompare);
        els.btnSwap.addEventListener('click', swapContent);
        els.btnClear.addEventListener('click', clearAll);
        els.btnHistory.addEventListener('click', showHistory);
        els.historyClose.addEventListener('click', () => els.historyModal.style.display = 'none');
        els.historyClearAll.addEventListener('click', () => { Storage.clearHistory(); renderHistoryList(); showToast('历史记录已清空'); });
        els.historyModal.addEventListener('click', (e) => { if (e.target === els.historyModal) els.historyModal.style.display = 'none'; });
        els.diffMode.addEventListener('change', () => { if (currentDiffData) doCompare(); });
        els.viewMode.addEventListener('change', () => { if (currentDiffData) doCompare(); });
        els.syntaxLang.addEventListener('change', () => { if (currentDiffData) doCompare(); });
        els.optIgnoreWS.addEventListener('change', () => { if (currentDiffData) doCompare(); });
        els.optIgnoreCase.addEventListener('change', () => { if (currentDiffData) doCompare(); });

        els.globalEncoding.addEventListener('change', () => {
            const val = els.globalEncoding.value;
            $$('.panel-encoding').forEach(sel => sel.value = val);
        });

        els.originalText.addEventListener('scroll', () => { els.originalLineNums.scrollTop = els.originalText.scrollTop; });
        els.modifiedText.addEventListener('scroll', () => { els.modifiedLineNums.scrollTop = els.modifiedText.scrollTop; });

        const debouncedUpdateLN = debounce(side => updateLineNumbers(side), 100);
        els.originalText.addEventListener('input', () => { debouncedUpdateLN('original'); resetSortIfEdited('original'); });
        els.modifiedText.addEventListener('input', () => { debouncedUpdateLN('modified'); resetSortIfEdited('modified'); });

        els.originalText.addEventListener('paste', () => setTimeout(() => formatJsonIfPossible('original'), 0));
        els.modifiedText.addEventListener('paste', () => setTimeout(() => formatJsonIfPossible('modified'), 0));

        $$('.btn-upload').forEach(btn => {
            btn.addEventListener('click', () => {
                const input = document.querySelector(`.file-input[data-side="${btn.dataset.side}"]`);
                input.click();
            });
        });
        $$('.file-input').forEach(input => {
            input.addEventListener('change', (e) => { if (e.target.files.length > 0) handleFileUpload(e.target.files[0], input.dataset.side); });
        });

        ['original', 'modified'].forEach(side => {
            const textarea = side === 'original' ? els.originalText : els.modifiedText;
            const wrap = textarea.closest('.editor-wrap');
            wrap.addEventListener('dragover', (e) => { e.preventDefault(); wrap.classList.add('dragover'); });
            wrap.addEventListener('dragleave', () => wrap.classList.remove('dragover'));
            wrap.addEventListener('drop', (e) => { e.preventDefault(); wrap.classList.remove('dragover'); if (e.dataTransfer.files.length > 0) handleFileUpload(e.dataTransfer.files[0], side); });
        });

        els.originalSort.addEventListener('change', () => applySort('original'));
        els.modifiedSort.addEventListener('change', () => applySort('modified'));

        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); doCompare(); }
            if (e.key === 'Escape') {
                if (els.historyModal.style.display !== 'none') els.historyModal.style.display = 'none';
                closeFindBar('original'); closeFindBar('modified');
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
                const activeSide = document.activeElement === els.originalText ? 'original' : document.activeElement === els.modifiedText ? 'modified' : null;
                if (activeSide) { e.preventDefault(); toggleFindBar(activeSide); }
            }
        });

        // Find/Replace
        ['original', 'modified'].forEach(side => {
            const findInput = side === 'original' ? els.findInputOriginal : els.findInputModified;
            const findCase = $(side === 'original' ? 'findCaseOriginal' : 'findCaseModified');

            const debouncedFind = debounce(() => doFind(side), 150);
            findInput.addEventListener('input', debouncedFind);
            findInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.shiftKey ? findPrev(side) : findNext(side); } });
            findCase.addEventListener('change', () => doFind(side));
        });

        $$('.find-prev').forEach(btn => btn.addEventListener('click', () => findPrev(btn.dataset.side)));
        $$('.find-next').forEach(btn => btn.addEventListener('click', () => findNext(btn.dataset.side)));
        $$('.find-close').forEach(btn => btn.addEventListener('click', () => closeFindBar(btn.dataset.side)));
        $('replaceOneOriginal').addEventListener('click', () => doReplace('original', false));
        $('replaceAllOriginal').addEventListener('click', () => doReplace('original', true));
        $('replaceOneModified').addEventListener('click', () => doReplace('modified', false));
        $('replaceAllModified').addEventListener('click', () => doReplace('modified', true));

        // Export dropdown
        els.btnExport.addEventListener('click', (e) => { e.stopPropagation(); els.exportMenu.classList.toggle('open'); });
        document.addEventListener('click', () => els.exportMenu.classList.remove('open'));
        els.exportMenu.addEventListener('click', (e) => {
            const action = e.target.dataset.action;
            if (action === 'export-html') exportAsHtml();
            else if (action === 'export-text') exportAsText();
            else if (action === 'export-clipboard') exportToClipboard();
            else if (action === 'export-image') exportAsImage();
            els.exportMenu.classList.remove('open');
        });

        // Share
        els.btnShare.addEventListener('click', shareUrl);

        // Merge mode
        els.btnMergeMode.addEventListener('click', toggleMergeMode);
        els.btnCopyMergeResult.addEventListener('click', copyMergeResult);
        els.btnDownloadMergeResult.addEventListener('click', downloadMergeResult);
        els.btnCloseMerge.addEventListener('click', () => { els.mergePanel.style.display = 'none'; mergeDecisions = {}; });

        // Merge accept/reject via delegation
        els.diffOutput.addEventListener('click', (e) => {
            const btn = e.target.closest('.merge-accept, .merge-reject');
            if (btn) {
                const rowIdx = parseInt(btn.dataset.row);
                const action = btn.classList.contains('merge-accept') ? 'accept' : 'reject';
                mergeDecisions[rowIdx] = action;
                btn.closest('.diff-row').classList.add(`merge-${action}ed`);
                updateMergeOutput();
                return;
            }
            // Line-click navigation
            const row = e.target.closest('.diff-row[data-left-line], .diff-row[data-right-line]');
            if (row) {
                const leftLine = row.dataset.leftLine;
                const rightLine = row.dataset.rightLine;
                if (leftLine) scrollToLine('original', parseInt(leftLine));
                if (rightLine) scrollToLine('modified', parseInt(rightLine));
            }
        });

        // Mode tabs
        $$('.mode-tab').forEach(tab => {
            tab.addEventListener('click', () => switchMode(tab.dataset.mode));
        });

        // Image diff
        setupImageDiff();

        // 3-way merge
        els.btnMerge3.addEventListener('click', do3WayMerge);
        els.btnCopyMerged.addEventListener('click', () => {
            navigator.clipboard.writeText(els.merge3Output.textContent).then(() => showToast('已复制到剪贴板', 'success'));
        });
    }

    /* ==================== Mode Tabs ==================== */
    function switchMode(mode) {
        currentMode = mode;
        $$('.mode-tab').forEach(t => t.classList.toggle('active', t.dataset.mode === mode));
        els.mainContent.style.display = mode === 'text' ? '' : 'none';
        els.imageDiffSection.style.display = mode === 'image' ? '' : 'none';
        els.merge3Section.style.display = mode === 'merge3' ? '' : 'none';
    }

    /* ==================== Find/Replace ==================== */
    let _findMatches = { original: [], modified: [] };
    let _findIndex = { original: -1, modified: -1 };

    function toggleFindBar(side) {
        const bar = side === 'original' ? els.findBarOriginal : els.findBarModified;
        const input = side === 'original' ? els.findInputOriginal : els.findInputModified;
        if (bar.style.display === 'none') {
            bar.style.display = '';
            input.focus();
            const textarea = side === 'original' ? els.originalText : els.modifiedText;
            const sel = textarea.value.substring(textarea.selectionStart, textarea.selectionEnd);
            if (sel) { input.value = sel; doFind(side); }
        } else {
            closeFindBar(side);
        }
    }

    function closeFindBar(side) {
        const bar = side === 'original' ? els.findBarOriginal : els.findBarModified;
        bar.style.display = 'none';
        _findMatches[side] = [];
        _findIndex[side] = -1;
    }

    function doFind(side) {
        const textarea = side === 'original' ? els.originalText : els.modifiedText;
        const input = side === 'original' ? els.findInputOriginal : els.findInputModified;
        const countEl = side === 'original' ? els.findCountOriginal : els.findCountModified;
        const caseEl = $(side === 'original' ? 'findCaseOriginal' : 'findCaseModified');
        const query = input.value;

        if (!query) { _findMatches[side] = []; _findIndex[side] = -1; countEl.textContent = '0/0'; return; }

        const text = textarea.value;
        const flags = caseEl.checked ? 'g' : 'gi';
        const matches = [];
        try {
            const re = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
            let m;
            while ((m = re.exec(text)) !== null) { matches.push({ start: m.index, end: m.index + m[0].length }); if (matches.length > 10000) break; }
        } catch { /* invalid regex */ }

        _findMatches[side] = matches;
        _findIndex[side] = matches.length > 0 ? 0 : -1;
        countEl.textContent = matches.length > 0 ? `1/${matches.length}` : '0/0';
        if (matches.length > 0) highlightFind(side);
    }

    function findNext(side) {
        const matches = _findMatches[side];
        if (matches.length === 0) return;
        _findIndex[side] = (_findIndex[side] + 1) % matches.length;
        highlightFind(side);
    }

    function findPrev(side) {
        const matches = _findMatches[side];
        if (matches.length === 0) return;
        _findIndex[side] = (_findIndex[side] - 1 + matches.length) % matches.length;
        highlightFind(side);
    }

    function highlightFind(side) {
        const textarea = side === 'original' ? els.originalText : els.modifiedText;
        const countEl = side === 'original' ? els.findCountOriginal : els.findCountModified;
        const match = _findMatches[side][_findIndex[side]];
        if (!match) return;
        textarea.focus();
        textarea.setSelectionRange(match.start, match.end);
        countEl.textContent = `${_findIndex[side] + 1}/${_findMatches[side].length}`;
        // Scroll to selection
        const linesBefore = textarea.value.substring(0, match.start).split('\n').length;
        textarea.scrollTop = (linesBefore - 3) * LH;
    }

    function doReplace(side, all) {
        const textarea = side === 'original' ? els.originalText : els.modifiedText;
        const findInput = side === 'original' ? els.findInputOriginal : els.findInputModified;
        const replaceInput = side === 'original' ? els.replaceInputOriginal : els.replaceInputModified;
        const caseEl = $(side === 'original' ? 'findCaseOriginal' : 'findCaseModified');
        const query = findInput.value;
        const replacement = replaceInput.value;

        if (!query) return;

        if (all) {
            const flags = caseEl.checked ? 'g' : 'gi';
            textarea.value = textarea.value.replace(new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags), replacement);
            showToast(`已替换全部匹配`, 'success');
        } else {
            const match = _findMatches[side][_findIndex[side]];
            if (!match) return;
            textarea.value = textarea.value.substring(0, match.start) + replacement + textarea.value.substring(match.end);
            showToast('已替换 1 处', 'success');
        }
        updateLineNumbers(side);
        doFind(side);
    }

    /* ==================== Line Navigation ==================== */
    function scrollToLine(side, lineNum) {
        const textarea = side === 'original' ? els.originalText : els.modifiedText;
        textarea.scrollTop = Math.max(0, (lineNum - 3) * LH);
        textarea.focus();
    }

    /* ==================== Export ==================== */
    function buildDiffText() {
        const rows = currentDiffData.rows;
        const parts = [];
        for (const row of rows) {
            const l = row.left;
            const r = row.right;
            if (l.type === 'deleted' && r.type === 'added') {
                parts.push('- ' + l.text, '+ ' + r.text);
            } else if (l.type === 'deleted') {
                parts.push('- ' + l.text);
            } else if (r.type === 'added') {
                parts.push('+ ' + r.text);
            } else {
                parts.push('  ' + l.text);
            }
        }
        return parts.join('\n') + '\n';
    }

    function exportAsHtml() {
        if (!currentDiffData) { showToast('请先进行对比', 'error'); return; }
        const styles = `body{font-family:monospace;margin:20px;background:#fff;color:#333}table{border-collapse:collapse;width:100%}td{padding:2px 8px;border:1px solid #ddd;font-size:13px;white-space:pre-wrap}.added{background:#e6ffec}.deleted{background:#ffebe9}.unchanged{background:#fff}.header{font-size:18px;font-weight:bold;margin-bottom:12px}.stats{margin-bottom:16px;color:#666}`;
        const rows = currentDiffData.rows;
        let tableHtml = '<table>';
        for (const row of rows) {
            const lClass = row.left.type === 'deleted' ? 'deleted' : row.left.type === 'added' ? 'added' : 'unchanged';
            const rClass = row.right.type === 'added' ? 'added' : row.right.type === 'deleted' ? 'deleted' : 'unchanged';
            tableHtml += `<tr><td class="${lClass}">${DiffEngine.escapeHtml(row.left.text)}</td><td class="${rClass}">${DiffEngine.escapeHtml(row.right.text)}</td></tr>`;
        }
        tableHtml += '</table>';
        const stats = currentDiffData.stats;
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>DiffMaster 导出</title><style>${styles}</style></head><body><div class="header">DiffMaster 对比结果</div><div class="stats">新增: ${stats.added} | 删除: ${stats.deleted} | 修改: ${stats.modified}</div>${tableHtml}</body></html>`;

        const blob = new Blob([html], { type: 'text/html' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `diff-${Date.now()}.html`;
        a.click();
        URL.revokeObjectURL(a.href);
        showToast('HTML 已导出', 'success');
    }

    function exportAsText() {
        if (!currentDiffData) { showToast('请先进行对比', 'error'); return; }
        const text = buildDiffText();
        const blob = new Blob([text], { type: 'text/plain' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `diff-${Date.now()}.txt`;
        a.click();
        URL.revokeObjectURL(a.href);
        showToast('文本已导出', 'success');
    }

    function exportToClipboard() {
        if (!currentDiffData) { showToast('请先进行对比', 'error'); return; }
        navigator.clipboard.writeText(buildDiffText()).then(() => showToast('已复制到剪贴板', 'success'));
    }

    function exportAsImage() {
        if (!currentDiffData) { showToast('请先进行对比', 'error'); return; }
        const lib = typeof html2canvas !== 'undefined' ? html2canvas
            : (typeof window !== 'undefined' && typeof window.html2canvas !== 'undefined' ? window.html2canvas : null);
        if (!lib) { showToast('图片导出库未加载', 'error'); return; }

        showToast('正在生成图片...', '');

        const bgColor = getComputedStyle(document.documentElement).getPropertyValue('--bg-primary').trim() || '#ffffff';
        const fontMono = getComputedStyle(document.documentElement).getPropertyValue('--font-mono').trim() || 'monospace';
        const textColor = getComputedStyle(document.documentElement).getPropertyValue('--text-primary').trim() || '#24292f';
        const LH = 19.5; // line height
        const mode = currentDiffData.mode;
        const view = currentDiffData.view;
        const lang = document.getElementById('syntaxLang')?.value || 'auto';

        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'position:fixed;top:0;left:-99999px;display:flex;flex-direction:row;width:100%;background:' + bgColor + ';font-family:' + fontMono + ';font-size:13px;line-height:' + LH + 'px;visibility:hidden;pointer-events:none;';
        document.body.appendChild(wrapper);
        wrapper.getBoundingClientRect();

        function buildTextPanelHTML(lines) {
            const numWidth = 40;
            let html = '';
            for (let i = 0; i < lines.length; i++) {
                const lineNum = i + 1;
                const escaped = DiffEngine.escapeHtml(lines[i]);
                html += '<div style="display:flex;align-items:center;height:' + LH + 'px;box-sizing:border-box;">' +
                    '<span style="width:' + numWidth + 'px;min-width:' + numWidth + 'px;text-align:right;padding:0 6px;color:#8c959f;font-size:11px;user-select:none;border-right:1px solid rgba(0,0,0,0.1);box-sizing:border-box;">' + lineNum + '</span>' +
                    '<span style="flex:1;padding:0 12px;white-space:pre;overflow:hidden;color:' + textColor + ';box-sizing:border-box;">' + (escaped || '&nbsp;') + '</span>' +
                '</div>';
            }
            return html;
        }

        function buildDiffPanelHTML() {
            const rows = currentDiffData.rows;
            if (!rows || rows.length === 0) return '<div style="padding:8px;">无差异</div>';
            const showRow = new Array(rows.length).fill(false);
            const contextLines = 3;
            for (let i = 0; i < rows.length; i++) {
                if (rows[i].left.type !== 'unchanged' || rows[i].right.type !== 'unchanged') {
                    const start = Math.max(0, i - contextLines);
                    for (let j = start; j <= Math.min(rows.length - 1, i + contextLines); j++) showRow[j] = true;
                }
            }
            const useHighlight = lang && lang !== 'auto' && lang !== 'plaintext';
            const visibleIndices = [];
            for (let i = 0; i < rows.length; i++) { if (showRow[i]) visibleIndices.push(i); }
            const hlLeftTexts = [], hlRightTexts = [];
            const hlLeftMap = new Map(), hlRightMap = new Map();
            if (useHighlight) {
                for (const i of visibleIndices) {
                    const { left, right } = rows[i];
                    const isModifiedPair = left.type === 'deleted' && right.type === 'added';
                    if (mode === 'lines' || !isModifiedPair) {
                        hlLeftMap.set(i, hlLeftTexts.length);
                        hlLeftTexts.push(left.text);
                        hlRightMap.set(i, hlRightTexts.length);
                        hlRightTexts.push(right.text);
                    }
                }
            }
            const hlLeftResults = useHighlight ? DiffEngine.syntaxHighlightLines(hlLeftTexts, lang) : [];
            const hlRightResults = useHighlight ? DiffEngine.syntaxHighlightLines(hlRightTexts, lang) : [];
            const numWidth = 40;
            const leftBorder = 'border-right:1px solid rgba(0,0,0,0.1)';
            const sideWidth = '50%';
            let html = '';
            let hiddenStart = -1;
            for (let i = 0; i < rows.length; i++) {
                if (!showRow[i]) {
                    if (hiddenStart === -1) hiddenStart = i;
                    continue;
                }
                if (hiddenStart !== -1) {
                    const hiddenCount = i - hiddenStart;
                    html += '<div style="display:flex;align-items:center;height:' + LH + 'px;box-sizing:border-box;background:#f6f8fa;color:#6e7781;font-size:12px;' + leftBorder + '">' +
                        '<span style="width:' + numWidth + 'px;min-width:' + numWidth + 'px;text-align:right;padding:0 6px;border-right:1px solid rgba(0,0,0,0.1);box-sizing:border-box;"></span>' +
                        '<span style="padding:0 12px;">&#8942; ' + hiddenCount + ' 行未变化内容（点击展开）</span>' +
                    '</div>';
                    hiddenStart = -1;
                }
                const { left, right } = rows[i];
                const isModifiedPair = left.type === 'deleted' && right.type === 'added';
                let leftContent, rightContent;
                if (mode !== 'lines' && isModifiedPair) {
                    const inline = DiffEngine.highlightInlineChanges(left.text, right.text, mode);
                    leftContent = inline.oldHtml;
                    rightContent = inline.newHtml;
                } else if (useHighlight) {
                    leftContent = hlLeftResults[hlLeftMap.get(i)] || '';
                    rightContent = hlRightResults[hlRightMap.get(i)] || '';
                } else {
                    leftContent = DiffEngine.escapeHtml(left.text);
                    rightContent = DiffEngine.escapeHtml(right.text);
                }
                const leftType = left.type;
                const rightType = right.type;
                const leftBg = leftType === 'added' ? 'rgba(34,211,83,0.15)' : leftType === 'deleted' ? 'rgba(255,129,130,0.15)' : '';
                const rightBg = rightType === 'added' ? 'rgba(34,211,83,0.15)' : rightType === 'deleted' ? 'rgba(255,129,130,0.15)' : '';
                const leftIndicator = leftType === 'deleted' ? '&#10006;' : leftType === 'added' ? '&#10004;' : '';
                const rightIndicator = rightType === 'added' ? '&#10004;' : rightType === 'deleted' ? '&#10006;' : '';
                html += '<div style="display:flex;align-items:stretch;height:' + LH + 'px;box-sizing:border-box;">';
                html += '<div style="width:' + sideWidth + ';display:flex;align-items:center;background:' + leftBg + ';' + leftBorder + '">' +
                    '<span style="width:' + numWidth + 'px;min-width:' + numWidth + 'px;text-align:right;padding:0 6px;color:#8c959f;font-size:11px;user-select:none;border-right:1px solid rgba(0,0,0,0.1);box-sizing:border-box;">' + (left.num != null ? left.num : '') + '</span>' +
                    '<span style="width:16px;min-width:16px;text-align:center;color:' + (leftType === 'deleted' ? '#cf222e' : leftType === 'added' ? '#1a7f37' : 'transparent') + ';box-sizing:border-box;">' + leftIndicator + '</span>' +
                    '<span style="flex:1;padding:0 12px;white-space:pre;overflow:hidden;color:' + textColor + ';box-sizing:border-box;">' + (leftContent || '&nbsp;') + '</span>' +
                '</div>';
                html += '<div style="width:' + sideWidth + ';display:flex;align-items:center;background:' + rightBg + ';">' +
                    '<span style="width:' + numWidth + 'px;min-width:' + numWidth + 'px;text-align:right;padding:0 6px;color:#8c959f;font-size:11px;user-select:none;border-right:1px solid rgba(0,0,0,0.1);box-sizing:border-box;">' + (right.num != null ? right.num : '') + '</span>' +
                    '<span style="width:16px;min-width:16px;text-align:center;color:' + (rightType === 'added' ? '#1a7f37' : rightType === 'deleted' ? '#cf222e' : 'transparent') + ';box-sizing:border-box;">' + rightIndicator + '</span>' +
                    '<span style="flex:1;padding:0 12px;white-space:pre;overflow:hidden;color:' + textColor + ';box-sizing:border-box;">' + (rightContent || '&nbsp;') + '</span>' +
                '</div>';
                html += '</div>';
            }
            return html;
        }

        function buildUnifiedDiffPanelHTML() {
            const lines = currentDiffData.lines;
            if (!lines || lines.length === 0) return '<div style="padding:8px;">无差异</div>';
            const numWidth = 40;
            let html = '';
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const bg = line.type === 'added' ? 'rgba(34,211,83,0.15)' : line.type === 'deleted' ? 'rgba(255,129,130,0.15)' : '';
                const indicator = line.type === 'added' ? '+' : line.type === 'deleted' ? '-' : ' ';
                const text = DiffEngine.escapeHtml(line.text);
                html += '<div style="display:flex;align-items:center;height:' + LH + 'px;box-sizing:border-box;background:' + bg + ';border-bottom:1px solid rgba(0,0,0,0.05);">' +
                    '<span style="width:' + numWidth + 'px;min-width:' + numWidth + 'px;text-align:right;padding:0 6px;color:#8c959f;font-size:11px;user-select:none;border-right:1px solid rgba(0,0,0,0.1);box-sizing:border-box;">' + (line.num != null ? line.num : '') + '</span>' +
                    '<span style="width:16px;min-width:16px;text-align:center;color:' + (line.type === 'added' ? '#1a7f37' : line.type === 'deleted' ? '#cf222e' : '#8c959f') + ';box-sizing:border-box;">' + indicator + '</span>' +
                    '<span style="flex:1;padding:0 12px;white-space:pre;overflow:hidden;color:' + textColor + ';box-sizing:border-box;">' + (text || '&nbsp;') + '</span>' +
                '</div>';
            }
            return html;
        }

        const origLines = els.originalText.value.split('\n');
        const origDiv = document.createElement('div');
        origDiv.style.cssText = 'flex:1;min-width:0;overflow:visible;padding:8px 0;box-sizing:border-box;border-right:1px solid rgba(0,0,0,0.1);';
        origDiv.innerHTML = buildTextPanelHTML(origLines);
        wrapper.appendChild(origDiv);

        const diffDiv = document.createElement('div');
        diffDiv.style.cssText = 'flex:1.5;min-width:0;overflow:visible;padding:8px 0;box-sizing:border-box;background:' + bgColor + ';';
        diffDiv.innerHTML = view === 'unified' ? buildUnifiedDiffPanelHTML() : buildDiffPanelHTML();
        wrapper.appendChild(diffDiv);

        const modLines = els.modifiedText.value.split('\n');
        const modDiv = document.createElement('div');
        modDiv.style.cssText = 'flex:1;min-width:0;overflow:visible;padding:8px 0;box-sizing:border-box;border-left:1px solid rgba(0,0,0,0.1);';
        modDiv.innerHTML = buildTextPanelHTML(modLines);
        wrapper.appendChild(modDiv);

        const totalWidth = wrapper.scrollWidth;
        const totalHeight = wrapper.scrollHeight;

        lib(wrapper, {
            backgroundColor: bgColor,
            scale: 2,
            useCORS: true,
            logging: false,
            width: totalWidth,
            height: totalHeight,
            windowWidth: totalWidth,
            windowHeight: totalHeight,
            scrollWidth: totalWidth,
            scrollHeight: totalHeight,
            x: 0,
            y: 0,
            ignoreElements: () => false,
        }).then(canvas => {
            const cleanup = () => { if (wrapper.parentNode) wrapper.parentNode.removeChild(wrapper); };
            canvas.toBlob(blob => {
                try {
                    if (!blob) { showToast('图片导出失败', 'error'); return; }
                    const a = document.createElement('a');
                    a.href = URL.createObjectURL(blob);
                    a.download = 'diff-' + Date.now() + '.png';
                    a.click();
                    URL.revokeObjectURL(a.href);
                    showToast('图片已导出', 'success');
                } finally {
                    cleanup();
                }
            }, 'image/png');
        }).catch(e => {
            showToast('图片导出失败', 'error');
            if (wrapper.parentNode) wrapper.parentNode.removeChild(wrapper);
        });
    }
    /* ==================== Share URL ==================== */
    function shareUrl() {
        const original = els.originalText.value;
        const modified = els.modifiedText.value;
        if (!original && !modified) { showToast('请先输入内容', 'error'); return; }

        try {
            const data = JSON.stringify({ o: original, m: modified });
            const compressed = LZString.compressToEncodedURIComponent(data);
            const url = `${location.origin}${location.pathname}#d=${compressed}`;
            navigator.clipboard.writeText(url).then(() => showToast('分享链接已复制到剪贴板', 'success'));
        } catch (e) {
            showToast('内容过长，无法生成链接', 'error');
        }
    }

    function loadFromUrl() {
        const hash = location.hash;
        if (!hash.startsWith('#d=')) return;
        try {
            const compressed = hash.slice(3);
            const data = JSON.parse(LZString.decompressFromEncodedURIComponent(compressed));
            if (data.o) els.originalText.value = data.o;
            if (data.m) els.modifiedText.value = data.m;
            updateLineNumbers('original');
            updateLineNumbers('modified');
            formatJsonIfPossible('original');
            formatJsonIfPossible('modified');
            showToast('已从分享链接加载内容', 'success');
            setTimeout(doCompare, 100);
        } catch (e) {
            showToast('分享链接解析失败', 'error');
        }
    }

    /* ==================== Merge Mode ==================== */
    let isMergeMode = false;

    function toggleMergeMode() {
        isMergeMode = !isMergeMode;
        els.btnMergeMode.classList.toggle('btn-primary', isMergeMode);
        els.btnMergeMode.classList.toggle('btn-secondary', !isMergeMode);
        if (isMergeMode) {
            mergeDecisions = {};
            els.mergePanel.style.display = '';
            if (currentDiffData) doCompare();
        } else {
            els.mergePanel.style.display = 'none';
            mergeDecisions = {};
            if (currentDiffData) doCompare();
        }
    }

    function updateMergeOutput() {
        if (!currentDiffData) return;
        const merged = DiffEngine.buildMergedText(currentDiffData.rows, mergeDecisions);
        els.mergeOutput.value = merged;
    }

    function copyMergeResult() {
        navigator.clipboard.writeText(els.mergeOutput.value).then(() => showToast('合并结果已复制', 'success'));
    }

    function downloadMergeResult() {
        const blob = new Blob([els.mergeOutput.value], { type: 'text/plain' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `merged-${Date.now()}.txt`;
        a.click();
        URL.revokeObjectURL(a.href);
        showToast('合并结果已下载', 'success');
    }

    /* ==================== Image Diff ==================== */
    let imageOriginal = null;
    let imageModified = null;

    function setupImageDiff() {
        ['imageUploadOriginal', 'imageUploadModified'].forEach(id => {
            const zone = els[id];
            const fileInput = zone.querySelector('input[type="file"]');
            const canvas = zone.querySelector('.image-canvas');
            const placeholder = zone.querySelector('.upload-placeholder');

            zone.addEventListener('click', () => fileInput.click());
            zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.style.borderColor = 'var(--accent-blue)'; });
            zone.addEventListener('dragleave', () => { zone.style.borderColor = ''; });
            zone.addEventListener('drop', (e) => {
                e.preventDefault();
                zone.style.borderColor = '';
                if (e.dataTransfer.files.length > 0) loadImage(e.dataTransfer.files[0], id);
            });
            fileInput.addEventListener('change', (e) => { if (e.target.files.length > 0) loadImage(e.target.files[0], id); });
        });

        els.btnImageCompare.addEventListener('click', doImageDiff);

        // Swipe handle
        let swiping = false;
        els.imageSwipeHandle.addEventListener('mousedown', (e) => { e.preventDefault(); swiping = true; });
        document.addEventListener('mousemove', (e) => {
            if (!swiping) return;
            const rect = els.imageDiffResult.getBoundingClientRect();
            const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
            els.imageSwipeHandle.style.left = x + 'px';
            updateSwipeClip(x, rect.width);
        });
        document.addEventListener('mouseup', () => { swiping = false; });
    }

    function loadImage(file, zoneId) {
        const zone = els[zoneId];
        const canvas = zone.querySelector('.image-canvas');
        const placeholder = zone.querySelector('.upload-placeholder');
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
            canvas.width = img.width;
            canvas.height = img.height;
            canvas.getContext('2d').drawImage(img, 0, 0);
            canvas.style.display = '';
            placeholder.style.display = 'none';
            if (zoneId === 'imageUploadOriginal') imageOriginal = img;
            else imageModified = img;
            URL.revokeObjectURL(url);
        };
        img.onerror = () => URL.revokeObjectURL(url);
        img.src = url;
    }

    function doImageDiff() {
        if (!imageOriginal || !imageModified) { showToast('请上传两张图片', 'error'); return; }
        const mode = els.imageDiffMode.value;
        const canvas = els.imageDiffCanvas;
        const w = Math.max(imageOriginal.width, imageModified.width);
        const h = Math.max(imageOriginal.height, imageModified.height);
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');

        if (mode === 'side-by-side') {
            canvas.width = imageOriginal.width + imageModified.width;
            ctx.drawImage(imageOriginal, 0, 0);
            ctx.drawImage(imageModified, imageOriginal.width, 0);
            els.imageSwipeHandle.style.display = 'none';
        } else if (mode === 'overlay') {
            ctx.globalAlpha = 0.5;
            ctx.drawImage(imageOriginal, 0, 0);
            ctx.drawImage(imageModified, 0, 0);
            ctx.globalAlpha = 1;
            els.imageSwipeHandle.style.display = 'none';
        } else if (mode === 'swipe') {
            ctx.drawImage(imageOriginal, 0, 0);
            const clipW = w / 2;
            ctx.save();
            ctx.beginPath();
            ctx.rect(clipW, 0, w - clipW, h);
            ctx.clip();
            ctx.drawImage(imageModified, 0, 0);
            ctx.restore();
            els.imageSwipeHandle.style.display = '';
            els.imageSwipeHandle.style.left = clipW + 'px';
        } else if (mode === 'diff') {
            const oc = document.createElement('canvas');
            oc.width = w; oc.height = h;
            const octx = oc.getContext('2d');
            octx.drawImage(imageOriginal, 0, 0);
            const oData = octx.getImageData(0, 0, w, h);

            const mc = document.createElement('canvas');
            mc.width = w; mc.height = h;
            const mctx = mc.getContext('2d');
            mctx.drawImage(imageModified, 0, 0);
            const mData = mctx.getImageData(0, 0, w, h);

            const diffData = ctx.createImageData(w, h);
            for (let i = 0; i < oData.data.length; i += 4) {
                const dr = Math.abs(oData.data[i] - mData.data[i]);
                const dg = Math.abs(oData.data[i + 1] - mData.data[i + 1]);
                const db = Math.abs(oData.data[i + 2] - mData.data[i + 2]);
                if (dr + dg + db > 30) {
                    diffData.data[i] = 255; diffData.data[i + 1] = 0; diffData.data[i + 2] = 0; diffData.data[i + 3] = 255;
                } else {
                    diffData.data[i] = oData.data[i]; diffData.data[i + 1] = oData.data[i + 1]; diffData.data[i + 2] = oData.data[i + 2]; diffData.data[i + 3] = 100;
                }
            }
            ctx.putImageData(diffData, 0, 0);
            els.imageSwipeHandle.style.display = 'none';
        }

        els.imageDiffResult.style.display = '';
    }

    function updateSwipeClip(x, totalW) {
        const canvas = els.imageDiffCanvas;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(imageOriginal, 0, 0);
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, 0, totalW - x, canvas.height);
        ctx.clip();
        ctx.drawImage(imageModified, 0, 0);
        ctx.restore();
    }

    /* ==================== 3-Way Merge ==================== */
    function do3WayMerge() {
        const base = els.merge3Base.value;
        const ours = els.merge3Ours.value;
        const theirs = els.merge3Theirs.value;
        if (!base || !ours || !theirs) { showToast('请填写所有三个版本', 'error'); return; }

        const bLines = base.split('\n');
        const oLines = ours.split('\n');
        const tLines = theirs.split('\n');

        const output = simpleMerge(bLines, oLines, tLines);
        const conflictsFound = output.some(l => l.startsWith('<<<<<<<'));

        els.merge3Result.style.display = '';
        els.merge3Output.textContent = output.join('\n');

        if (conflictsFound) {
            showToast('合并完成，存在冲突（需手动解决）', 'warning');
        } else {
            showToast('合并完成，无冲突', 'success');
        }
    }

    /**
     * Position-aware 3-way merge.
     * Walk base line-by-line; at each position consult ours/theirs edit maps.
     * Both edit identically -> apply once. Both edit differently -> conflict.
     * Only one side edits -> take that side. Neither -> keep base line.
     */
    function simpleMerge(base, ours, theirs) {
        const oursOps = buildOpsByBase(base, ours);
        const theirsOps = buildOpsByBase(base, theirs);
        const result = [];
        let i = 0;
        while (i <= base.length) {
            const oOp = oursOps.get(i);
            const tOp = theirsOps.get(i);
            const oHas = !!(oOp && (oOp.removed > 0 || oOp.inserted.length > 0));
            const tHas = !!(tOp && (tOp.removed > 0 || tOp.inserted.length > 0));

            if (oHas && tHas) {
                const sameRemoved = oOp.removed === tOp.removed;
                const sameInserted = oOp.inserted.length === tOp.inserted.length
                    && oOp.inserted.every((l, k) => l === tOp.inserted[k]);
                if (sameRemoved && sameInserted) {
                    result.push(...oOp.inserted);
                    i += oOp.removed;
                } else {
                    result.push('<<<<<<< Ours');
                    result.push(...oOp.inserted);
                    result.push('=======');
                    result.push(...tOp.inserted);
                    result.push('>>>>>>> Theirs');
                    i += Math.max(oOp.removed, tOp.removed);
                }
            } else if (oHas) {
                result.push(...oOp.inserted);
                i += oOp.removed;
            } else if (tHas) {
                result.push(...tOp.inserted);
                i += tOp.removed;
            }

            if (i < base.length) {
                result.push(base[i]);
                i++;
            } else {
                break;
            }
        }
        return result;
    }

    /**
     * Map<basePos, { removed, inserted }> describing how `target` differs
     * from `base`. basePos is the index in base where the edit starts;
     * removed = base lines consumed; inserted = replacement lines.
     */
    function buildOpsByBase(base, target) {
        const ops = new Map();
        const parts = Diff.diffArrays(base, target);
        let basePos = 0;
        for (let p = 0; p < parts.length; p++) {
            const part = parts[p];
            if (!part.added && !part.removed) {
                basePos += part.value.length;
                continue;
            }
            const next = parts[p + 1];
            if (part.removed && next && next.added) {
                ops.set(basePos, { removed: part.value.length, inserted: next.value.slice() });
                basePos += part.value.length;
                p++;
            } else if (part.removed) {
                ops.set(basePos, { removed: part.value.length, inserted: [] });
                basePos += part.value.length;
            } else if (part.added) {
                const existing = ops.get(basePos);
                if (existing) existing.inserted.push(...part.value);
                else ops.set(basePos, { removed: 0, inserted: part.value.slice() });
            }
        }
        return ops;
    }

    /* ==================== Core Compare ==================== */
    function doCompare() {
        let original = getSortedContent('original');
        let modified = getSortedContent('modified');

        if (!original && !modified) {
            showToast('请先输入内容', 'error');
            return;
        }

        const LARGE_CONTENT = 1_000_000;
        if (original.length > LARGE_CONTENT || modified.length > LARGE_CONTENT) {
            showToast('内容过长（超过 1MB），对比可能较慢', 'warning');
        }

        try {
            const mode = els.diffMode.value;
            const view = els.viewMode.value;
            const lang = els.syntaxLang.value;
            const detectedLang = (lang === 'auto') ? DiffEngine.detectLanguage(original || modified) : lang;

            const diffOptions = {};
            if (els.optIgnoreWS.checked) diffOptions.ignoreWhitespace = true;
            if (els.optIgnoreCase.checked) diffOptions.ignoreCase = true;
            const optKey = JSON.stringify(diffOptions);

            // Use cached diff computation if inputs and options haven't changed
            const cacheValid = _diffCache
                && _diffCache.original === original
                && _diffCache.modified === modified
                && _diffCache.optKey === optKey;

            if (!cacheValid) {
                const sideBySide = DiffEngine.buildSideBySide(original, modified, diffOptions);
                const unified = DiffEngine.buildUnified(original, modified, diffOptions);
                _diffCache = { original, modified, optKey, sideBySide, unified };
            }

            if (view === 'unified') {
                const { lines, stats } = _diffCache.unified;
                currentDiffData = { lines, stats, mode, view };
                const html = DiffEngine.renderUnified(lines, detectedLang);
                els.diffOutput.innerHTML = html || '<div class="diff-placeholder"><p>两段内容完全相同</p></div>';
                _rowIndex = null;
                els.statAdded.textContent = stats.added;
                els.statDeleted.textContent = stats.deleted;
                els.statModified.textContent = stats.modified;
                els.statTotal.textContent = stats.added + stats.deleted + stats.modified;
                setupSyncScroll();
            } else {
                const { rows, stats } = _diffCache.sideBySide;
                currentDiffData = { rows, stats, mode, view };
                const html = DiffEngine.render(rows, mode, detectedLang, isMergeMode);
                els.diffOutput.innerHTML = html || '<div class="diff-placeholder"><p>两段内容完全相同</p></div>';
                _rowIndex = null;
                els.statAdded.textContent = stats.added;
                els.statDeleted.textContent = stats.deleted;
                els.statModified.textContent = stats.modified;
                els.statTotal.textContent = stats.added + stats.deleted + stats.modified;
                setupSyncScroll();
                if (isMergeMode) { mergeDecisions = {}; updateMergeOutput(); }
            }

            if (!cacheValid && els.statTotal.textContent !== '0') {
                Storage.saveRecord(original, modified, { added: parseInt(els.statAdded.textContent), deleted: parseInt(els.statDeleted.textContent), modified: parseInt(els.statModified.textContent) });
            }
        } catch (e) {
            showToast('对比失败: ' + e.message, 'error');
        }
    }

    /* ==================== Scroll Sync ==================== */
    let _syncHandlers = { diff: null, original: null, modified: null };
    let _rowIndex = null;

    function buildRowIndex() {
        const children = els.diffOutput.children;
        const index = [];
        for (let i = 0; i < children.length; i++) {
            const el = children[i];
            const top = el.offsetTop; // relative to diff-output content area (already includes padding)
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

    function setupSyncScroll() {
        const diffOutput = els.diffOutput;
        const originalText = els.originalText;
        const modifiedText = els.modifiedText;

        if (_syncHandlers.diff) diffOutput.removeEventListener('scroll', _syncHandlers.diff);
        if (_syncHandlers.original) originalText.removeEventListener('scroll', _syncHandlers.original);
        if (_syncHandlers.modified) modifiedText.removeEventListener('scroll', _syncHandlers.modified);

        requestAnimationFrame(() => buildRowIndex());

        let scrolling = false;
        let rafId = 0;

        // Binary search for diff row at a given scrollTop
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

        // Which editor line is at the visual top of the textarea?
        function editorLineAtTop(textarea) {
            return Math.floor(Math.max(0, textarea.scrollTop - PAD) / LH) + 1;
        }

        // Scroll editor so that the given line is at the visual top (+ pixelOffset)
        function scrollEditorToLine(textarea, lineNum, pixelOffset) {
            textarea.scrollTop = Math.max(0, PAD + (lineNum - 1) * LH + pixelOffset);
        }

        // Scroll the diff panel so that the given entry's top aligns with scrollTop=0 (+ pixelOffset)
        function scrollDiffToEntry(entry, pixelOffset) {
            diffOutput.scrollTop = Math.max(0, entry.top + pixelOffset);
        }

        function syncToEditors() {
            if (scrolling || !isScrollSync) return;
            scrolling = true;
            cancelAnimationFrame(rafId);
            rafId = requestAnimationFrame(() => {
                if (!_rowIndex) buildRowIndex();
                const entry = findRowAtScroll(diffOutput.scrollTop);
                if (entry) {
                    const offset = diffOutput.scrollTop - entry.top;
                    if (entry.leftLine > 0) scrollEditorToLine(originalText, entry.leftLine, offset);
                    if (entry.rightLine > 0) scrollEditorToLine(modifiedText, entry.rightLine, offset);
                }
                scrolling = false;
            });
        }

        function syncFromEditor(source, side) {
            if (scrolling || !isScrollSync) return;
            scrolling = true;
            cancelAnimationFrame(rafId);
            rafId = requestAnimationFrame(() => {
                if (!_rowIndex) buildRowIndex();
                const lineNum = editorLineAtTop(source);
                const pixelOffset = Math.max(0, source.scrollTop - PAD - (lineNum - 1) * LH);

                // Find the diff row for this line
                const attr = side === 'original' ? 'leftLine' : 'rightLine';
                const map = attr === 'leftLine' ? _rowIndex.leftLineMap : _rowIndex.rightLineMap;
                const entry = map.get(lineNum);
                if (entry) {
                    scrollDiffToEntry(entry, pixelOffset);
                } else {
                    // Line is folded away — use ratio fallback
                    const ratio = source.scrollTop / (source.scrollHeight - source.clientHeight || 1);
                    diffOutput.scrollTop = ratio * (diffOutput.scrollHeight - diffOutput.clientHeight);
                }

                // Sync the other editor to show the same visual line
                const other = source === originalText ? modifiedText : originalText;
                const otherAttr = side === 'original' ? 'rightLine' : 'leftLine';
                const otherMap = otherAttr === 'leftLine' ? _rowIndex.leftLineMap : _rowIndex.rightLineMap;
                // Try to find the same line number in the other side's diff rows
                const otherEntry = otherMap.get(lineNum);
                if (otherEntry) {
                    // Same line exists in other side — scroll to matching position
                    const otherTargetLine = otherAttr === 'leftLine' ? otherEntry.leftLine : otherEntry.rightLine;
                    if (otherTargetLine > 0) {
                        scrollEditorToLine(other, otherTargetLine, pixelOffset);
                    }
                } else {
                    // Line doesn't exist in other side (it was added/deleted),
                    // find nearest available line
                    const otherLineNum = findNearestLine(otherMap, lineNum);
                    if (otherLineNum > 0) {
                        scrollEditorToLine(other, otherLineNum, pixelOffset);
                    }
                }

                scrolling = false;
            });
        }

        // Find nearest line number in the map. Searches the full map range
        // so very large added/deleted blocks don't fall through.
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

        _syncHandlers.diff = syncToEditors;
        _syncHandlers.original = () => syncFromEditor(originalText, 'original');
        _syncHandlers.modified = () => syncFromEditor(modifiedText, 'modified');

        diffOutput.addEventListener('scroll', _syncHandlers.diff, { passive: true });
        originalText.addEventListener('scroll', _syncHandlers.original, { passive: true });
        modifiedText.addEventListener('scroll', _syncHandlers.modified, { passive: true });
    }

    /* ==================== Utility Functions ==================== */
    function updateLineNumbers(side) {
        const textarea = side === 'original' ? els.originalText : els.modifiedText;
        const lineNums = side === 'original' ? els.originalLineNums : els.modifiedLineNums;
        const count = (textarea.value.match(/\n/g) || []).length + 1;
        const parts = new Array(count);
        for (let i = 0; i < count; i++) parts[i] = '<span>' + (i + 1) + '</span>';
        lineNums.innerHTML = parts.join('');
    }

    async function handleFileUpload(file, side) {
        const MAX_FILE_SIZE = 10 * 1024 * 1024;
        if (file.size > MAX_FILE_SIZE) {
            showToast(`文件过大（${(file.size / 1024 / 1024).toFixed(1)}MB），最大支持 10MB`, 'error');
            return;
        }
        const encoding = getEncoding(side);
        try {
            const text = await EncodingDetector.readFile(file, encoding);
            const textarea = side === 'original' ? els.originalText : els.modifiedText;
            textarea.value = text;
            formatJsonIfPossible(side);
            updateLineNumbers(side);
            showToast(`文件 "${file.name}" 已加载`, 'success');
        } catch (e) {
            showToast(`文件读取失败: ${e.message}`, 'error');
        }
    }

    function getEncoding(side) {
        const sel = document.querySelector(`.panel-encoding[data-side="${side}"]`);
        return sel ? sel.value : els.globalEncoding.value;
    }

    function formatJsonIfPossible(side) {
        const textarea = side === 'original' ? els.originalText : els.modifiedText;
        const text = textarea.value.trim();
        if (!text) return false;
        const { success, data } = JsonSorter.tryParseJson(text);
        if (success) {
            const formatted = JSON.stringify(data, null, 2);
            if (formatted !== textarea.value) {
                const start = textarea.selectionStart;
                const end = textarea.selectionEnd;
                textarea.value = formatted;
                textarea.selectionStart = start;
                textarea.selectionEnd = end;
                updateLineNumbers(side);
            }
            return true;
        }
        return false;
    }

    const _originalValues = { original: null, modified: null };

    function resetSortIfEdited(side) {
        const sortSel = side === 'original' ? els.originalSort : els.modifiedSort;
        if (sortSel.value !== 'default') {
            sortSel.value = 'default';
            _originalValues[side] = null;
        }
    }

    function applySort(side) {
        const textarea = side === 'original' ? els.originalText : els.modifiedText;
        const sortSel = side === 'original' ? els.originalSort : els.modifiedSort;
        const direction = sortSel.value;

        if (_originalValues[side] === null) {
            _originalValues[side] = textarea.value;
        }

        if (direction === 'default') {
            if (_originalValues[side] !== null) {
                textarea.value = _originalValues[side];
            }
            _originalValues[side] = null;
        } else {
            const base = _originalValues[side] !== null ? _originalValues[side] : textarea.value;
            const jsonResult = JsonSorter.applySort(base, null, direction);
            if (jsonResult.success) {
                textarea.value = jsonResult.result;
            } else {
                const lines = base.split('\n');
                lines.sort((a, b) => {
                    const cmp = a.localeCompare(b, 'zh-CN');
                    return direction === 'asc' ? cmp : -cmp;
                });
                textarea.value = lines.join('\n');
            }
        }
        updateLineNumbers(side);
    }

    function getSortedContent(side) {
        const textarea = side === 'original' ? els.originalText : els.modifiedText;
        const sortSel = side === 'original' ? els.originalSort : els.modifiedSort;
        const direction = sortSel.value;

        if (direction === 'default') return textarea.value;

        const base = _originalValues[side] !== null ? _originalValues[side] : textarea.value;
        const jsonResult = JsonSorter.applySort(base, null, direction);
        if (jsonResult.success) return jsonResult.result;

        const lines = base.split('\n');
        lines.sort((a, b) => {
            const cmp = a.localeCompare(b, 'zh-CN');
            return direction === 'asc' ? cmp : -cmp;
        });
        return lines.join('\n');
    }

    function swapContent() {
        const temp = els.originalText.value;
        els.originalText.value = els.modifiedText.value;
        els.modifiedText.value = temp;
        const tempSort = els.originalSort.value;
        els.originalSort.value = els.modifiedSort.value;
        els.modifiedSort.value = tempSort;
        const tempOrig = _originalValues.original;
        _originalValues.original = _originalValues.modified;
        _originalValues.modified = tempOrig;
        updateLineNumbers('original');
        updateLineNumbers('modified');
        showToast('内容已交换', 'success');
    }

    function clearAll() {
        els.originalText.value = '';
        els.modifiedText.value = '';
        els.originalSort.value = 'default';
        els.modifiedSort.value = 'default';
        _originalValues.original = null;
        _originalValues.modified = null;
        updateLineNumbers('original');
        updateLineNumbers('modified');
        els.diffOutput.innerHTML = '<div class="diff-placeholder"><p>在左右两侧输入内容，点击「对比」按钮查看差异</p><p>支持 JSON、纯文本、XML、YAML、代码等格式</p></div>';
        _rowIndex = null;
        els.statAdded.textContent = '0';
        els.statDeleted.textContent = '0';
        els.statModified.textContent = '0';
        els.statTotal.textContent = '0';
        currentDiffData = null;
        _diffCache = null;
        isMergeMode = false;
        mergeDecisions = {};
        els.mergePanel.style.display = 'none';
        if (_syncHandlers.diff) els.diffOutput.removeEventListener('scroll', _syncHandlers.diff);
        if (_syncHandlers.original) els.originalText.removeEventListener('scroll', _syncHandlers.original);
        if (_syncHandlers.modified) els.modifiedText.removeEventListener('scroll', _syncHandlers.modified);
        _syncHandlers = { diff: null, original: null, modified: null };
    }

    /* ==================== History ==================== */
    function showHistory() {
        els.historyModal.style.display = 'flex';
        renderHistoryList();
    }

    function renderHistoryList() {
        const records = Storage.getHistory();
        els.historyList.textContent = '';
        if (records.length === 0) {
            const empty = document.createElement('p');
            empty.className = 'empty-state';
            empty.textContent = '暂无历史记录';
            els.historyList.appendChild(empty);
            return;
        }

        for (const record of records) {
            const time = Storage.formatTime(record.timestamp);
            const preview = (record.original || '').slice(0, 60).replace(/\n/g, ' ');
            const added = Number(record.stats.added) || 0;
            const deleted = Number(record.stats.deleted) || 0;
            const modified = Number(record.stats.modified) || 0;

            const item = document.createElement('div');
            item.className = 'history-item';
            item.dataset.id = record.id;

            const info = document.createElement('div');
            info.className = 'history-item-info';
            const title = document.createElement('div');
            title.className = 'history-item-title';
            title.textContent = preview + '...';
            const meta = document.createElement('div');
            meta.className = 'history-item-meta';
            meta.textContent = `${time} · ✓${added} ✗${deleted} ○${modified}`;
            info.appendChild(title);
            info.appendChild(meta);

            const actions = document.createElement('div');
            actions.className = 'history-item-actions';
            const loadBtn = document.createElement('button');
            loadBtn.className = 'btn-icon';
            loadBtn.title = '加载';
            loadBtn.setAttribute('aria-label', '加载历史记录');
            loadBtn.textContent = '📂';
            loadBtn.addEventListener('click', (e) => { e.stopPropagation(); loadHistoryRecord(record.id); });
            const delBtn = document.createElement('button');
            delBtn.className = 'btn-icon';
            delBtn.title = '删除';
            delBtn.setAttribute('aria-label', '删除历史记录');
            delBtn.textContent = '🗑';
            delBtn.addEventListener('click', (e) => { e.stopPropagation(); Storage.deleteRecord(record.id); renderHistoryList(); showToast('记录已删除'); });
            actions.appendChild(loadBtn);
            actions.appendChild(delBtn);

            item.appendChild(info);
            item.appendChild(actions);
            els.historyList.appendChild(item);
        }
    }

    function loadHistoryRecord(id) {
        const record = Storage.getRecord(id);
        if (!record) return;
        els.originalText.value = record.original;
        els.modifiedText.value = record.modified;
        els.originalSort.value = 'default';
        els.modifiedSort.value = 'default';
        _originalValues.original = null;
        _originalValues.modified = null;
        formatJsonIfPossible('original');
        formatJsonIfPossible('modified');
        updateLineNumbers('original');
        updateLineNumbers('modified');
        els.historyModal.style.display = 'none';
        doCompare();
        const truncated = (record.originalLength > record.original.length) || (record.modifiedLength > record.modified.length);
        if (truncated) showToast('历史记录已加载（内容较长，仅保存了前 2000 字符）', 'warning');
        else showToast('历史记录已加载', 'success');
    }

    /* ==================== Toast ==================== */
    function showToast(message, type = '') {
        els.toast.textContent = message;
        els.toast.className = 'toast' + (type ? ` toast-${type}` : '');
        els.toast.style.display = 'block';
        clearTimeout(els.toast._timer);
        els.toast._timer = setTimeout(() => { els.toast.style.display = 'none'; }, 2500);
    }

    /* ==================== Resize ==================== */
    function initResize() {
        setupResize(els.resizeHandle1, els.originalPanel, els.diffPanel);
        setupResize(els.resizeHandle2, els.diffPanel, els.modifiedPanel);
    }

    function setupResize(handle, leftPanel, rightPanel) {
        if (!handle) return;
        handle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            const main = document.querySelector('.main-content');
            const isColumn = getComputedStyle(main).flexDirection === 'column';
            const startPos = isColumn ? e.clientY : e.clientX;
            const startLeftSize = isColumn ? leftPanel.getBoundingClientRect().height : leftPanel.getBoundingClientRect().width;
            const startRightSize = isColumn ? rightPanel.getBoundingClientRect().height : rightPanel.getBoundingClientRect().width;
            handle.classList.add('active');
            document.body.style.cursor = isColumn ? 'row-resize' : 'col-resize';
            document.body.style.userSelect = 'none';

            function onMove(ev) {
                const delta = isColumn ? ev.clientY - startPos : ev.clientX - startPos;
                const newLeft = startLeftSize + delta;
                const newRight = startRightSize - delta;
                const prop = isColumn ? 'minHeight' : 'minWidth';
                const minLeft = parseInt(getComputedStyle(leftPanel)[prop], 10) || 80;
                const minRight = parseInt(getComputedStyle(rightPanel)[prop], 10) || 80;
                if (newLeft >= minLeft && newRight >= minRight) {
                    leftPanel.style.flex = 'none';
                    rightPanel.style.flex = 'none';
                    const sizeProp = isColumn ? 'height' : 'width';
                    leftPanel.style[sizeProp] = newLeft + 'px';
                    rightPanel.style[sizeProp] = newRight + 'px';
                }
            }

            function onUp() {
                handle.classList.remove('active');
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
                window.removeEventListener('blur', onUp);
            }

            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
            window.addEventListener('blur', onUp);
        });
    }

    /* ==================== Theme ==================== */
    const THEME_KEY = 'diffmaster_theme';

    function initTheme() {
        const saved = localStorage.getItem(THEME_KEY);
        applyTheme(saved || 'light');
    }

    function toggleTheme() {
        const current = document.documentElement.getAttribute('data-theme') || 'light';
        const next = current === 'light' ? 'dark' : 'light';
        applyTheme(next);
        localStorage.setItem(THEME_KEY, next);
    }

    function applyTheme(theme) {
        if (theme === 'dark') {
            document.documentElement.setAttribute('data-theme', 'dark');
            els.themeIcon.textContent = '🌙';
            els.themeLabel.textContent = 'Dark';
        } else {
            document.documentElement.removeAttribute('data-theme');
            els.themeIcon.textContent = '☀️';
            els.themeLabel.textContent = 'Light';
        }
    }

    // Initialize on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    return { doCompare, swapContent, clearAll, showHistory, showToast };
})();
