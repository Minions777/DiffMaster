/**
 * DiffMaster Main Application Controller
 *
 * Orchestrates DOM caching, event binding, core compare flow, and delegates
 * feature areas to focused modules:
 *   ExportManager  - export/share
 *   MergeManager   - inline + 3-way merge
 *   HistoryUI      - history modal
 *   SyncScroll     - bidirectional scroll
 *   ResizeManager  - panel drag-resize
 *   ImageDiff      - image comparison modes
 *   FindReplace    - editor find/replace (per-side)
 */
const App = (() => {
    const $ = id => document.getElementById(id);
    const $$ = sel => document.querySelectorAll(sel);

    function debounce(fn, ms) {
        let timer;
        return function(...args) {
            clearTimeout(timer);
            timer = setTimeout(() => fn.apply(this, args), ms);
        };
    }

    let els = {};
    let currentDiffData = null;
    let isScrollSync = true;
    let currentMode = 'text';
    let _diffCache = null;
    const LH = DiffEngine.CONFIG.LINE_HEIGHT;
    const PAD = 8;

    let exportApi = null;
    let mergeApi = null;
    let historyApi = null;
    let syncApi = null;
    let imageDiffApi = null;
    let findReplaceApis = { original: null, modified: null };

    function init() {
        cacheElements();
        syncEncodingOptions();
        bindEvents();
        ThemeManager.init();
        ResizeManager.init(els);

        exportApi = ExportManager.init({
            els,
            getCurrentDiffData: () => currentDiffData,
            showToast,
            doCompare,
            updateLineNumbers,
            formatJsonIfPossible,
        });

        mergeApi = MergeManager.init({
            els,
            getCurrentDiffData: () => currentDiffData,
            showToast,
            doCompare,
        });

        historyApi = HistoryUI.init({
            els,
            showToast,
            doCompare,
            formatJsonIfPossible,
            updateLineNumbers,
            resetSortState: () => {
                els.originalSort.value = 'default';
                els.modifiedSort.value = 'default';
                _originalValues.original = null;
                _originalValues.modified = null;
            },
        });

        syncApi = SyncScroll.init({
            els,
            isEnabled: () => isScrollSync,
        });

        updateLineNumbers('original');
        updateLineNumbers('modified');
        exportApi.loadFromUrl();
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
            statsChart: $('statsChart'),
            historyModal: $('historyModal'), historyList: $('historyList'), historyClose: $('historyClose'), historyClearAll: $('historyClearAll'),
            toast: $('toast'), originalSort: $('originalSort'), modifiedSort: $('modifiedSort'),
            optIgnoreWS: $('optIgnoreWS'), optIgnoreCase: $('optIgnoreCase'), optAutoCompare: $('optAutoCompare'),
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
            imageDiffMode: $('imageDiffMode'), btnImageCompare: $('btnImageCompare'),
            imageUploadOriginal: $('imageUploadOriginal'), imageUploadModified: $('imageUploadModified'),
            imageDiffResult: $('imageDiffResult'), imageDiffCanvas: $('imageDiffCanvas'), imageSwipeHandle: $('imageSwipeHandle'),
            merge3Base: $('merge3Base'), merge3Ours: $('merge3Ours'), merge3Theirs: $('merge3Theirs'),
            btnMerge3: $('btnMerge3'), btnCopyMerged: $('btnCopyMerged'),
            merge3Result: $('merge3Result'), merge3Output: $('merge3Output'),
            diffSearchBar: $('diffSearchBar'), diffSearchInput: $('diffSearchInput'), diffSearchCount: $('diffSearchCount'),
        };
    }

    /* ==================== Events ==================== */
    function bindEvents() {
        els.themeToggle.addEventListener('click', ThemeManager.toggle);
        els.btnCompare.addEventListener('click', doCompare);
        els.btnSwap.addEventListener('click', swapContent);
        els.btnClear.addEventListener('click', clearAll);
        els.btnHistory.addEventListener('click', () => historyApi.showHistory());
        els.historyClose.addEventListener('click', () => els.historyModal.style.display = 'none');
        els.historyClearAll.addEventListener('click', () => {
            Storage.clearHistory();
            historyApi.renderHistoryList();
            showToast('历史记录已清空');
        });
        els.historyModal.addEventListener('click', (e) => {
            if (e.target === els.historyModal) els.historyModal.style.display = 'none';
        });
        els.diffMode.addEventListener('change', () => { if (currentDiffData) doCompare(); });
        els.viewMode.addEventListener('change', () => { if (currentDiffData) doCompare(); });
        els.syntaxLang.addEventListener('change', () => { if (currentDiffData) doCompare(); });
        els.optIgnoreWS.addEventListener('change', () => { if (currentDiffData) doCompare(); });
        els.optIgnoreCase.addEventListener('change', () => { if (currentDiffData) doCompare(); });
        els.optAutoCompare.addEventListener('change', () => {
            if (els.optAutoCompare.checked && currentDiffData) {
                showToast('自动对比已启用', 'success');
            }
        });

        els.globalEncoding.addEventListener('change', () => {
            const val = els.globalEncoding.value;
            $$('.panel-encoding').forEach(sel => sel.value = val);
        });

        els.originalText.addEventListener('scroll', () => { els.originalLineNums.scrollTop = els.originalText.scrollTop; });
        els.modifiedText.addEventListener('scroll', () => { els.modifiedLineNums.scrollTop = els.modifiedText.scrollTop; });

        const debouncedUpdateLN = debounce(side => updateLineNumbers(side), 100);
        const debouncedAutoCompare = debounce(() => {
            if (els.optAutoCompare.checked) doCompare();
        }, 500);

        els.originalText.addEventListener('input', () => {
            debouncedUpdateLN('original');
            resetSortIfEdited('original');
            updateSortVisibility('original');
            debouncedAutoCompare();
        });
        els.modifiedText.addEventListener('input', () => {
            debouncedUpdateLN('modified');
            resetSortIfEdited('modified');
            updateSortVisibility('modified');
            debouncedAutoCompare();
        });

        els.originalText.addEventListener('paste', () => setTimeout(() => formatJsonIfPossible('original'), 0));
        els.modifiedText.addEventListener('paste', () => setTimeout(() => formatJsonIfPossible('modified'), 0));

        $$('.btn-upload').forEach(btn => {
            btn.addEventListener('click', () => {
                const input = document.querySelector(`.file-input[data-side="${btn.dataset.side}"]`);
                input.click();
            });
        });
        $$('.file-input').forEach(input => {
            input.addEventListener('change', (e) => {
                if (e.target.files.length > 0) handleFileUpload(e.target.files[0], input.dataset.side);
            });
        });

        ['original', 'modified'].forEach(side => {
            const textarea = side === 'original' ? els.originalText : els.modifiedText;
            const wrap = textarea.closest('.editor-wrap');
            wrap.addEventListener('dragover', (e) => { e.preventDefault(); wrap.classList.add('dragover'); });
            wrap.addEventListener('dragleave', () => wrap.classList.remove('dragover'));
            wrap.addEventListener('drop', (e) => {
                e.preventDefault();
                wrap.classList.remove('dragover');
                if (e.dataTransfer.files.length > 0) handleFileUpload(e.dataTransfer.files[0], side);
            });
        });

        const diffOutputWrap = els.diffOutput.closest('.diff-output-wrap') || els.diffPanel;
        diffOutputWrap.addEventListener('dragover', (e) => { e.preventDefault(); diffOutputWrap.classList.add('dragover'); });
        diffOutputWrap.addEventListener('dragleave', () => diffOutputWrap.classList.remove('dragover'));
        diffOutputWrap.addEventListener('drop', (e) => {
            e.preventDefault();
            diffOutputWrap.classList.remove('dragover');
            if (e.dataTransfer.files.length > 0) handleFileUpload(e.dataTransfer.files[0], 'original');
        });

        els.originalSort.addEventListener('change', () => applySort('original'));
        els.modifiedSort.addEventListener('change', () => applySort('modified'));

        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); doCompare(); }
            if (e.key === 'Escape') {
                if (els.historyModal.style.display !== 'none') els.historyModal.style.display = 'none';
                if (findReplaceApis.original) findReplaceApis.original.close();
                if (findReplaceApis.modified) findReplaceApis.modified.close();
                if (els.diffSearchBar && els.diffSearchBar.style.display !== 'none') els.diffSearchBar.style.display = 'none';
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
                const activeSide = document.activeElement === els.originalText ? 'original'
                    : document.activeElement === els.modifiedText ? 'modified' : null;
                if (activeSide) {
                    e.preventDefault();
                    const api = findReplaceApis[activeSide];
                    if (api) api.open();
                }
                else if (currentDiffData) { e.preventDefault(); toggleDiffSearch(); }
            }
        });

        ['original', 'modified'].forEach(side => {
            const textarea = side === 'original' ? els.originalText : els.modifiedText;
            const findBar = side === 'original' ? els.findBarOriginal : els.findBarModified;
            const findInput = side === 'original' ? els.findInputOriginal : els.findInputModified;
            const replaceInput = side === 'original' ? els.replaceInputOriginal : els.replaceInputModified;
            const findCase = $(side === 'original' ? 'findCaseOriginal' : 'findCaseModified');
            const countEl = side === 'original' ? els.findCountOriginal : els.findCountModified;

            findReplaceApis[side] = FindReplace.createForSide(
                side, textarea, findBar, findInput, replaceInput, findCase, countEl
            );
        });

        $$('.find-prev').forEach(btn => btn.addEventListener('click', () => {
            const api = findReplaceApis[btn.dataset.side];
            if (api) api.findPrev();
        }));
        $$('.find-next').forEach(btn => btn.addEventListener('click', () => {
            const api = findReplaceApis[btn.dataset.side];
            if (api) api.findNext();
        }));
        $$('.find-close').forEach(btn => btn.addEventListener('click', () => {
            const api = findReplaceApis[btn.dataset.side];
            if (api) api.close();
        }));
        $('replaceOneOriginal').addEventListener('click', () => {
            if (findReplaceApis.original) {
                findReplaceApis.original.replace(false);
                updateLineNumbers('original');
            }
        });
        $('replaceAllOriginal').addEventListener('click', () => {
            if (findReplaceApis.original) {
                findReplaceApis.original.replace(true);
                updateLineNumbers('original');
                showToast('已替换全部匹配', 'success');
            }
        });
        $('replaceOneModified').addEventListener('click', () => {
            if (findReplaceApis.modified) {
                findReplaceApis.modified.replace(false);
                updateLineNumbers('modified');
            }
        });
        $('replaceAllModified').addEventListener('click', () => {
            if (findReplaceApis.modified) {
                findReplaceApis.modified.replace(true);
                updateLineNumbers('modified');
                showToast('已替换全部匹配', 'success');
            }
        });

        $$('.find-regex').forEach(btn => {
            btn.addEventListener('click', () => {
                btn.classList.toggle('active');
                const side = btn.dataset.side || (btn.id.includes('Original') ? 'original' : 'modified');
                const findInput = side === 'original' ? els.findInputOriginal : els.findInputModified;
                findInput.dataset.regex = btn.classList.contains('active') ? 'true' : 'false';
                const api = findReplaceApis[side];
                if (api) {
                    // Trigger re-search by dispatching input event
                    findInput.dispatchEvent(new Event('input'));
                }
            });
        });

        setupDiffSearch();

        els.diffOutput.addEventListener('click', (e) => {
            const lineNumEl = e.target.closest('.diff-line-num');
            if (lineNumEl && lineNumEl.textContent) {
                const row = lineNumEl.closest('.diff-row') || lineNumEl.closest('.diff-unified-row');
                if (row) {
                    const content = row.querySelector('.diff-line-content');
                    if (content) {
                        const text = content.textContent;
                        navigator.clipboard.writeText(text).then(() => showToast('已复制行: ' + lineNumEl.textContent, 'success'));
                    }
                }
            }
        });

        els.btnExport.addEventListener('click', (e) => { e.stopPropagation(); els.exportMenu.classList.toggle('open'); });
        document.addEventListener('click', () => els.exportMenu.classList.remove('open'));
        els.exportMenu.addEventListener('click', (e) => {
            const action = e.target.dataset.action;
            if (action === 'export-html') exportApi.exportAsHtml();
            else if (action === 'export-text') exportApi.exportAsText();
            else if (action === 'export-clipboard') exportApi.exportToClipboard();
            else if (action === 'export-image') exportApi.exportAsImage();
            els.exportMenu.classList.remove('open');
        });

        els.btnShare.addEventListener('click', () => exportApi.shareUrl());

        els.btnMergeMode.addEventListener('click', () => mergeApi.toggleMergeMode());
        els.btnCopyMergeResult.addEventListener('click', () => mergeApi.copyMergeResult());
        els.btnDownloadMergeResult.addEventListener('click', () => mergeApi.downloadMergeResult());
        els.btnCloseMerge.addEventListener('click', () => {
            els.mergePanel.style.display = 'none';
            mergeApi.resetMergeState(true);
        });

        els.diffOutput.addEventListener('click', (e) => {
            const fold = e.target.closest('.diff-fold');
            if (fold) {
                if (fold.classList.contains('diff-fold-unified')) {
                    const hidden = fold.nextElementSibling;
                    if (hidden && hidden.classList.contains('diff-fold-hidden')) {
                        hidden.style.display = '';
                        fold.remove();
                    }
                } else {
                    DiffEngine.expandFold(fold);
                }
                return;
            }

            const btn = e.target.closest('.merge-accept, .merge-reject');
            if (btn) {
                const rowIdx = parseInt(btn.dataset.row);
                const action = btn.classList.contains('merge-accept') ? 'accept' : 'reject';
                mergeApi.applyDecision(rowIdx, action);
                btn.closest('.diff-row').classList.add(`merge-${action}ed`);
                return;
            }

            const row = e.target.closest('.diff-row[data-left-line], .diff-row[data-right-line]');
            if (row) {
                const leftLine = row.dataset.leftLine;
                const rightLine = row.dataset.rightLine;
                if (leftLine) scrollToLine('original', parseInt(leftLine));
                if (rightLine) scrollToLine('modified', parseInt(rightLine));
            }
        });

        $$('.mode-tab').forEach(tab => {
            tab.addEventListener('click', () => switchMode(tab.dataset.mode));
        });

        imageDiffApi = ImageDiff.init(
            els.imageUploadOriginal,
            els.imageUploadModified,
            els.imageDiffResult,
            els.imageDiffCanvas,
            els.imageSwipeHandle,
            els.imageDiffMode,
            showToast
        );
        els.btnImageCompare.addEventListener('click', () => {
            if (imageDiffApi) imageDiffApi.doCompare();
        });

        els.btnMerge3.addEventListener('click', () => mergeApi.do3WayMerge());
        els.btnCopyMerged.addEventListener('click', () => {
            navigator.clipboard.writeText(els.merge3Output.textContent)
                .then(() => showToast('已复制到剪贴板', 'success'));
        });
    }

    function switchMode(mode) {
        currentMode = mode;
        $$('.mode-tab').forEach(t => t.classList.toggle('active', t.dataset.mode === mode));
        els.mainContent.style.display = mode === 'text' ? '' : 'none';
        els.imageDiffSection.style.display = mode === 'image' ? '' : 'none';
        els.merge3Section.style.display = mode === 'merge3' ? '' : 'none';
        if (mode !== 'image') ImageDiff.clearImages();
    }

    function scrollToLine(side, lineNum) {
        const textarea = side === 'original' ? els.originalText : els.modifiedText;
        textarea.scrollTop = Math.max(0, (lineNum - 3) * LH);
        textarea.focus();
    }

    /* ==================== Diff Area Search ==================== */
    let _diffSearchIndex = -1;
    let _diffSearchMatches = [];

    function setupDiffSearch() {
        const input = els.diffSearchInput;
        const countEl = els.diffSearchCount;
        const bar = els.diffSearchBar;

        const debouncedSearch = debounce(() => _doDiffSearch(input, countEl), 150);
        input.addEventListener('input', debouncedSearch);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.shiftKey ? _diffSearchPrev() : _diffSearchNext(); }
        });

        els.diffPanel.querySelector('.panel-header').addEventListener('dblclick', () => {
            bar.style.display = bar.style.display === 'none' ? '' : 'none';
            if (bar.style.display !== 'none') input.focus();
        });

        const closeBtn = document.querySelector('.diff-search-close');
        if (closeBtn) closeBtn.addEventListener('click', toggleDiffSearch);

        const nextBtn = document.querySelector('.diff-search-next');
        if (nextBtn) nextBtn.addEventListener('click', _diffSearchNext);
        const prevBtn = document.querySelector('.diff-search-prev');
        if (prevBtn) prevBtn.addEventListener('click', _diffSearchPrev);
    }

    function toggleDiffSearch() {
        if (!els.diffSearchBar) return;
        if (els.diffSearchBar.style.display === 'none') {
            els.diffSearchBar.style.display = '';
            els.diffSearchInput.focus();
        } else {
            els.diffSearchBar.style.display = 'none';
            _diffSearchMatches = [];
            _diffSearchIndex = -1;
            _clearDiffHighlights();
        }
    }

    function _doDiffSearch(input, countEl) {
        const query = input.value.trim();
        if (!query) {
            countEl.textContent = '0';
            _diffSearchIndex = -1;
            _diffSearchMatches = [];
            _clearDiffHighlights();
            return;
        }
        const output = els.diffOutput;
        const contentEls = output.querySelectorAll('.diff-line-content');
        _diffSearchMatches = [];
        contentEls.forEach((el) => {
            const text = el.textContent.toLowerCase();
            if (text.includes(query.toLowerCase())) _diffSearchMatches.push(el);
        });
        countEl.textContent = _diffSearchMatches.length;
        if (_diffSearchMatches.length > 0) {
            _diffSearchIndex = 0;
            _highlightDiffSearch();
        }
    }

    function _diffSearchNext() {
        if (_diffSearchMatches.length === 0) return;
        _diffSearchIndex = (_diffSearchIndex + 1) % _diffSearchMatches.length;
        _highlightDiffSearch();
    }

    function _diffSearchPrev() {
        if (_diffSearchMatches.length === 0) return;
        _diffSearchIndex = (_diffSearchIndex - 1 + _diffSearchMatches.length) % _diffSearchMatches.length;
        _highlightDiffSearch();
    }

    function _highlightDiffSearch() {
        _clearDiffHighlights();
        const el = _diffSearchMatches[_diffSearchIndex];
        if (!el) return;
        el.classList.add('diff-search-highlight');
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    function _clearDiffHighlights() {
        els.diffOutput.querySelectorAll('.diff-search-highlight')
            .forEach(el => el.classList.remove('diff-search-highlight'));
    }

    /* ==================== Stats Chart ==================== */
    function renderStatsChart(added, deleted, modified) {
        const svg = els.statsChart;
        if (!svg) return;
        const total = added + deleted + modified;
        if (total === 0) { svg.innerHTML = ''; return; }
        const maxVal = Math.max(added, deleted, modified, 1);
        const h = 24;
        const barW = 16;
        const gap = 4;
        const scale = (h - 4) / maxVal;
        svg.setAttribute('width', barW * 3 + gap * 2);
        svg.innerHTML =
            `<rect x="0" y="${h - added * scale - 2}" width="${barW}" height="${added * scale}" fill="var(--accent-green)" rx="2" opacity="0.8"/>` +
            `<rect x="${barW + gap}" y="${h - deleted * scale - 2}" width="${barW}" height="${deleted * scale}" fill="var(--accent-red)" rx="2" opacity="0.8"/>` +
            `<rect x="${(barW + gap) * 2}" y="${h - modified * scale - 2}" width="${barW}" height="${modified * scale}" fill="var(--accent-yellow)" rx="2" opacity="0.8"/>`;
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

            const cacheValid = _diffCache
                && _diffCache.original === original
                && _diffCache.modified === modified
                && _diffCache.optKey === optKey;

            if (!cacheValid) {
                const rawDiff = DiffEngine.computeRawDiff(original, modified, diffOptions);
                const sideBySide = DiffEngine.buildSideBySideFromRaw(rawDiff);
                const unified = DiffEngine.buildUnifiedFromRaw(rawDiff);
                _diffCache = { original, modified, optKey, sideBySide, unified };
            }

            if (view === 'unified') {
                const { lines, stats } = _diffCache.unified;
                currentDiffData = { lines, stats, mode, view };
                const html = DiffEngine.renderUnified(lines, detectedLang);
                els.diffOutput.innerHTML = html || '<div class="diff-placeholder"><p>两段内容完全相同</p></div>';
                syncApi.invalidate();
                updateStats(stats);
                syncApi.setup();
            } else {
                const isMergeMode = mergeApi.isMergeActive();
                const { rows, stats } = _diffCache.sideBySide;
                currentDiffData = { rows, stats, mode, view };
                const html = DiffEngine.render(rows, mode, detectedLang, isMergeMode);
                els.diffOutput.innerHTML = html || '<div class="diff-placeholder"><p>两段内容完全相同</p></div>';
                syncApi.invalidate();
                updateStats(stats);
                syncApi.setup();
                if (isMergeMode) {
                    mergeApi.resetMergeState(false);
                    mergeApi.updateMergeOutput();
                }
            }

            if (!cacheValid && els.statTotal.textContent !== '0') {
                Storage.saveRecord(original, modified, {
                    added: parseInt(els.statAdded.textContent),
                    deleted: parseInt(els.statDeleted.textContent),
                    modified: parseInt(els.statModified.textContent),
                });
            }
        } catch (e) {
            showToast('对比失败: ' + e.message, 'error');
        }
    }

    function updateStats(stats) {
        els.statAdded.textContent = stats.added;
        els.statDeleted.textContent = stats.deleted;
        els.statModified.textContent = stats.modified;
        els.statTotal.textContent = stats.added + stats.deleted + stats.modified;
        renderStatsChart(stats.added, stats.deleted, stats.modified);
    }

    /* ==================== Utilities ==================== */
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

        if (_originalValues[side] === null) _originalValues[side] = textarea.value;

        if (direction === 'default') {
            if (_originalValues[side] !== null) textarea.value = _originalValues[side];
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

    function updateSortVisibility(side) {
        const textarea = side === 'original' ? els.originalText : els.modifiedText;
        const sortControls = side === 'original'
            ? els.originalSort.closest('.sort-controls')
            : els.modifiedSort.closest('.sort-controls');
        if (!sortControls) return;
        const text = textarea.value.trim();
        if (!text) { sortControls.classList.remove('hidden'); return; }
        const { success } = JsonSorter.tryParseJson(text);
        sortControls.classList.toggle('hidden', !success);
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
        syncApi.invalidate();
        els.statAdded.textContent = '0';
        els.statDeleted.textContent = '0';
        els.statModified.textContent = '0';
        els.statTotal.textContent = '0';
        currentDiffData = null;
        _diffCache = null;
        mergeApi.resetMergeState(true);
        syncApi.teardown();
    }

    function showToast(message, type) {
        els.toast.textContent = message;
        els.toast.className = 'toast' + (type ? ` toast-${type}` : '');
        els.toast.style.display = 'block';
        clearTimeout(els.toast._timer);
        els.toast._timer = setTimeout(() => { els.toast.style.display = 'none'; }, 2500);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    return { doCompare, swapContent, clearAll, showToast };
})();
