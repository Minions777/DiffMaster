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
            sel.innerHTML = els.globalEncoding.innerHTML;
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
    function getDiffOutputText() {
        const rows = els.diffOutput.querySelectorAll('.diff-row, .diff-unified-row');
        let text = '';
        rows.forEach(row => {
            const contents = row.querySelectorAll('.diff-line-content, .diff-line-prefix');
            contents.forEach(c => { text += c.textContent; });
            text += '\n';
        });
        return text;
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
        const rows = currentDiffData.rows;
        let text = '';
        for (const row of rows) {
            const l = row.left;
            const r = row.right;
            if (l.type === 'deleted' && r.type === 'added') {
                text += `- ${l.text}\n+ ${r.text}\n`;
            } else if (l.type === 'deleted') {
                text += `- ${l.text}\n`;
            } else if (r.type === 'added') {
                text += `+ ${r.text}\n`;
            } else {
                text += `  ${l.text}\n`;
            }
        }
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
        const rows = currentDiffData.rows;
        let text = '';
        for (const row of rows) {
            const l = row.left;
            const r = row.right;
            if (l.type === 'deleted' && r.type === 'added') {
                text += `- ${l.text}\n+ ${r.text}\n`;
            } else if (l.type === 'deleted') {
                text += `- ${l.text}\n`;
            } else if (r.type === 'added') {
                text += `+ ${r.text}\n`;
            } else {
                text += `  ${l.text}\n`;
            }
        }
        navigator.clipboard.writeText(text).then(() => showToast('已复制到剪贴板', 'success'));
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
        img.onload = () => {
            canvas.width = img.width;
            canvas.height = img.height;
            canvas.getContext('2d').drawImage(img, 0, 0);
            canvas.style.display = '';
            placeholder.style.display = 'none';
            if (zoneId === 'imageUploadOriginal') imageOriginal = img;
            else imageModified = img;
        };
        img.src = URL.createObjectURL(file);
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

        const baseLines = base.split('\n');
        const oursLines = ours.split('\n');
        const theirsLines = theirs.split('\n');

        // Simple 3-way merge: find differences from base
        const dOurs = Diff.diffLines(base, ours);
        const dTheirs = Diff.diffLines(base, theirs);

        // Build merged result
        const result = [];
        const baseParts = [];
        let pos = 0;

        // Collect ours changes
        const oursChanges = [];
        for (const part of dOurs) {
            if (part.added) oursChanges.push({ start: pos, end: pos, text: part.value, type: 'added' });
            else if (part.removed) oursChanges.push({ start: pos, end: pos + part.value.split('\n').length - 1, text: '', type: 'removed' });
            else pos += part.value.split('\n').length - (part.value.endsWith('\n') ? 1 : 0);
        }

        // Simple approach: apply non-conflicting changes
        const merged = [];
        const baseSplit = base.split('\n');
        const oursSplit = ours.split('\n');
        const theirsSplit = theirs.split('\n');

        // Find common lines and divergences
        let bi = 0, oi = 0, ti = 0;
        const dO = Diff.diffArrays(baseSplit, oursSplit);
        const dT = Diff.diffArrays(baseSplit, theirsSplit);

        // Simple merge: if both changed the same line differently, it's a conflict
        let conflicts = 0;
        const resultLines = [];
        let bIdx = 0;

        for (const part of dO) {
            if (!part.added && !part.removed) {
                for (const line of part.value) resultLines.push(line);
                bIdx += part.value.length;
            } else if (part.removed && !part.added) {
                // Deleted in ours, check if also changed in theirs
                bIdx += part.value.length;
            } else if (part.added) {
                for (const line of part.value) resultLines.push(line);
            }
        }

        // Apply theirs on top
        const step1 = resultLines.join('\n');
        const mergedResult = Diff.mergeDiff ? base : ours; // fallback

        // Use a simpler approach: start with ours, apply theirs' unique changes
        const finalResult = [];
        const oursSet = new Set(oursSplit);
        const theirsSet = new Set(theirsSplit);
        const baseSet = new Set(baseSplit);

        // Start with ours
        let conflictMarkers = '';
        const mergedText = ours; // Start with ours
        const d = Diff.diffLines(base, ours);
        const d2 = Diff.diffLines(base, theirs);

        // Simple 3-way: output ours with conflict markers where theirs differs
        let output = [];
        const bLines = base.split('\n');
        const oLines = ours.split('\n');
        const tLines = theirs.split('\n');

        // Use LCS-based merge
        output = simpleMerge(bLines, oLines, tLines);
        const conflictsFound = output.some(l => l.startsWith('<<<<<<<'));

        els.merge3Result.style.display = '';
        els.merge3Output.textContent = output.join('\n');

        if (conflictsFound) {
            showToast('合并完成，存在冲突（需手动解决）', 'warning');
        } else {
            showToast('合并完成，无冲突', 'success');
        }
    }

    function simpleMerge(base, ours, theirs) {
        const result = [];
        const dO = Diff.diffArrays(base, ours);
        const dT = Diff.diffArrays(base, theirs);

        // Collect changes from base
        const oursEdits = collectEdits(dO);
        const theirsEdits = collectEdits(dT);

        // Check for conflicts
        const conflictRegions = new Set();
        for (const oe of oursEdits) {
            for (const te of theirsEdits) {
                if (rangesOverlap(oe.start, oe.end, te.start, te.end)) {
                    for (let i = Math.min(oe.start, te.start); i <= Math.max(oe.end, te.end); i++) {
                        conflictRegions.add(i);
                    }
                }
            }
        }

        // Apply changes
        let bi = 0;
        let oi = 0;
        let ti = 0;

        // Simple strategy: apply ours first, then check theirs for non-conflicting
        const applied = new Set();
        for (const edit of oursEdits) {
            if (!conflictRegions.has(edit.start)) {
                // Non-conflicting, apply ours
                for (const line of edit.lines) result.push(line);
                applied.add(edit.start);
            }
        }

        // For conflicting regions, add markers
        const processed = new Set();
        for (const edit of oursEdits) {
            if (conflictRegions.has(edit.start) && !processed.has(edit.start)) {
                processed.add(edit.start);
                const theirsEdit = theirsEdits.find(te => rangesOverlap(edit.start, edit.end, te.start, te.end));
                if (theirsEdit) {
                    result.push('<<<<<<< Ours');
                    for (const line of edit.lines) result.push(line);
                    result.push('=======');
                    for (const line of theirsEdit.lines) result.push(line);
                    result.push('>>>>>>> Theirs');
                } else {
                    for (const line of edit.lines) result.push(line);
                }
            }
        }

        // Add unchanged lines
        const unchanged = [];
        let pos = 0;
        for (const part of dO) {
            if (!part.added && !part.removed) {
                for (const line of part.value) {
                    unchanged.push({ pos: pos++, text: line });
                }
            } else if (part.removed) {
                pos += part.value.length;
            }
        }

        return result.length > 0 ? result : base;
    }

    function collectEdits(diffResult) {
        const edits = [];
        let pos = 0;
        for (const part of diffResult) {
            if (!part.added && !part.removed) {
                pos += part.value.length;
            } else if (part.removed) {
                edits.push({ start: pos, end: pos + part.value.length - 1, lines: [], type: 'removed' });
                pos += part.value.length;
            } else if (part.added) {
                edits.push({ start: pos, end: pos, lines: part.value, type: 'added' });
            }
        }
        return edits;
    }

    function rangesOverlap(s1, e1, s2, e2) {
        return s1 <= e2 && s2 <= e1;
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

            if (els.statTotal.textContent !== '0') {
                Storage.saveRecord(original, modified, { added: parseInt(els.statAdded.textContent), deleted: parseInt(els.statDeleted.textContent), modified: parseInt(els.statModified.textContent) });
            }
        } catch (e) {
            showToast('对比失败: ' + e.message, 'error');
        }
    }

    /* ==================== Scroll Sync ==================== */
    let _syncHandlers = { diff: null, original: null, modified: null };
    const LH = DiffEngine.LINE_HEIGHT; // 19.5px
    const PAD = 8; // editor and diff-output top padding
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

        // Find nearest line number in the map
        function findNearestLine(map, target) {
            if (map.has(target)) return target;
            // Search outward from target
            for (let d = 1; d < 50; d++) {
                if (map.has(target + d)) return target + d;
                if (map.has(target - d)) return target - d;
            }
            return target;
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
        const lines = textarea.value.split('\n');
        let html = '';
        for (let i = 1; i <= lines.length; i++) {
            html += `<span>${i}</span>`;
        }
        lineNums.innerHTML = html;
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
        if (records.length === 0) {
            els.historyList.innerHTML = '<p class="empty-state">暂无历史记录</p>';
            return;
        }

        els.historyList.textContent = '';
        for (const record of records) {
            const time = Storage.formatTime(record.timestamp);
            const preview = (record.original || '').slice(0, 60).replace(/\n/g, ' ');
            const safeId = DiffEngine.escapeHtml(record.id);
            const safeAdded = Number(record.stats.added) || 0;
            const safeDeleted = Number(record.stats.deleted) || 0;
            const safeModified = Number(record.stats.modified) || 0;

            const item = document.createElement('div');
            item.className = 'history-item';
            item.dataset.id = record.id;
            item.innerHTML = `
                    <div class="history-item-info">
                        <div class="history-item-title">${DiffEngine.escapeHtml(preview)}...</div>
                        <div class="history-item-meta">${DiffEngine.escapeHtml(time)} · ✓${safeAdded} ✗${safeDeleted} ○${safeModified}</div>
                    </div>
                    <div class="history-item-actions">
                        <button class="btn-icon" data-action="load" data-id="${safeId}" title="加载">📂</button>
                        <button class="btn-icon" data-action="delete" data-id="${safeId}" title="删除">🗑</button>
                    </div>`;
            els.historyList.appendChild(item);
        }

        els.historyList.querySelectorAll('[data-action="load"]').forEach(btn => {
            btn.addEventListener('click', (e) => { e.stopPropagation(); loadHistoryRecord(btn.dataset.id); });
        });
        els.historyList.querySelectorAll('[data-action="delete"]').forEach(btn => {
            btn.addEventListener('click', (e) => { e.stopPropagation(); Storage.deleteRecord(btn.dataset.id); renderHistoryList(); showToast('记录已删除'); });
        });
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
