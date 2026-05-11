/**
 * DiffMaster Main Application Controller
 */
const App = (() => {
    // DOM Elements
    const $ = id => document.getElementById(id);
    const $$ = sel => document.querySelectorAll(sel);

    let els = {};
    let currentDiffData = null;
    let isScrollSync = true;

    function init() {
        cacheElements();
        bindEvents();
        initTheme();
        initResize();
        updateLineNumbers('original');
        updateLineNumbers('modified');
    }

    function cacheElements() {
        els = {
            themeToggle: $('themeToggle'),
            themeIcon: $('themeIcon'),
            themeLabel: $('themeLabel'),
            originalPanel: $('originalPanel'),
            diffPanel: $('diffPanel'),
            modifiedPanel: $('modifiedPanel'),
            resizeHandle1: $('resizeHandle1'),
            resizeHandle2: $('resizeHandle2'),
            originalText: $('originalText'),
            modifiedText: $('modifiedText'),
            originalLineNums: $('originalLineNums'),
            modifiedLineNums: $('modifiedLineNums'),
            diffOutput: $('diffOutput'),
            btnCompare: $('btnCompare'),
            btnSwap: $('btnSwap'),
            btnClear: $('btnClear'),
            btnHistory: $('btnHistory'),
            globalEncoding: $('globalEncoding'),
            diffMode: $('diffMode'),
            statAdded: $('statAdded'),
            statDeleted: $('statDeleted'),
            statModified: $('statModified'),
            statTotal: $('statTotal'),
            historyModal: $('historyModal'),
            historyList: $('historyList'),
            historyClose: $('historyClose'),
            historyClearAll: $('historyClearAll'),
            toast: $('toast'),
            originalSort: $('originalSort'),
            modifiedSort: $('modifiedSort'),
        };
    }

    function bindEvents() {
        // Theme toggle
        els.themeToggle.addEventListener('click', toggleTheme);

        // Compare button
        els.btnCompare.addEventListener('click', doCompare);

        // Swap button
        els.btnSwap.addEventListener('click', swapContent);

        // Clear button
        els.btnClear.addEventListener('click', clearAll);

        // History
        els.btnHistory.addEventListener('click', showHistory);
        els.historyClose.addEventListener('click', () => els.historyModal.style.display = 'none');
        els.historyClearAll.addEventListener('click', () => {
            Storage.clearHistory();
            renderHistoryList();
            showToast('历史记录已清空');
        });
        els.historyModal.addEventListener('click', (e) => {
            if (e.target === els.historyModal) els.historyModal.style.display = 'none';
        });

        // Diff mode change
        els.diffMode.addEventListener('change', () => {
            if (currentDiffData) doCompare();
        });

        // Global encoding change
        els.globalEncoding.addEventListener('change', () => {
            const val = els.globalEncoding.value;
            $$('.panel-encoding').forEach(sel => sel.value = val);
        });

        // Line numbers sync with textarea scroll
        els.originalText.addEventListener('scroll', () => {
            els.originalLineNums.scrollTop = els.originalText.scrollTop;
        });
        els.modifiedText.addEventListener('scroll', () => {
            els.modifiedLineNums.scrollTop = els.modifiedText.scrollTop;
        });

        // Update line numbers on input; reset sort if user manually edits
        els.originalText.addEventListener('input', () => {
            updateLineNumbers('original');
            resetSortIfEdited('original');
        });
        els.modifiedText.addEventListener('input', () => {
            updateLineNumbers('modified');
            resetSortIfEdited('modified');
        });

        // File upload buttons
        $$('.btn-upload').forEach(btn => {
            btn.addEventListener('click', () => {
                const side = btn.dataset.side;
                const input = document.querySelector(`.file-input[data-side="${side}"]`);
                input.click();
            });
        });

        // File input change
        $$('.file-input').forEach(input => {
            input.addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    handleFileUpload(e.target.files[0], input.dataset.side);
                }
            });
        });

        // Drag and drop on editors
        ['original', 'modified'].forEach(side => {
            const textarea = side === 'original' ? els.originalText : els.modifiedText;
            const wrap = textarea.closest('.editor-wrap');

            wrap.addEventListener('dragover', (e) => {
                e.preventDefault();
                wrap.classList.add('dragover');
            });
            wrap.addEventListener('dragleave', () => {
                wrap.classList.remove('dragover');
            });
            wrap.addEventListener('drop', (e) => {
                e.preventDefault();
                wrap.classList.remove('dragover');
                if (e.dataTransfer.files.length > 0) {
                    handleFileUpload(e.dataTransfer.files[0], side);
                }
            });
        });

        // Sort controls change
        els.originalSort.addEventListener('change', () => applySort('original'));
        els.modifiedSort.addEventListener('change', () => applySort('modified'));

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                doCompare();
            }
            if (e.key === 'Escape' && els.historyModal.style.display !== 'none') {
                els.historyModal.style.display = 'none';
            }
        });
    }

    /**
     * Update line numbers for a textarea
     */
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

    /**
     * Handle file upload
     */
    async function handleFileUpload(file, side) {
        const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
        if (file.size > MAX_FILE_SIZE) {
            showToast(`文件过大（${(file.size / 1024 / 1024).toFixed(1)}MB），最大支持 10MB`, 'error');
            return;
        }
        const encoding = getEncoding(side);
        try {
            const text = await EncodingDetector.readFile(file, encoding);
            const textarea = side === 'original' ? els.originalText : els.modifiedText;
            textarea.value = text;
            updateLineNumbers(side);
            showToast(`文件 "${file.name}" 已加载`, 'success');
        } catch (e) {
            showToast(`文件读取失败: ${e.message}`, 'error');
        }
    }

    /**
     * Get encoding for a side
     */
    function getEncoding(side) {
        const sel = document.querySelector(`.panel-encoding[data-side="${side}"]`);
        return sel ? sel.value : els.globalEncoding.value;
    }

    // detectJsonArray removed — sort controls are always visible

    /**
     * Sort lines of textarea content by line (ascending / descending / default)
     */
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

        // Capture the unsorted value once
        if (_originalValues[side] === null) {
            _originalValues[side] = textarea.value;
        }

        if (direction === 'default') {
            textarea.value = _originalValues[side];
            _originalValues[side] = null;
        } else {
            const base = _originalValues[side] !== null ? _originalValues[side] : textarea.value;

            // Try JSON array sort first
            const jsonResult = JsonSorter.applySort(base, null, direction);
            if (jsonResult.success) {
                textarea.value = jsonResult.result;
            } else {
                // Line-level sort
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

    /**
     * Get sorted content for one side (respects sort dropdown)
     */
    function getSortedContent(side) {
        const textarea = side === 'original' ? els.originalText : els.modifiedText;
        const sortSel = side === 'original' ? els.originalSort : els.modifiedSort;
        const direction = sortSel.value;

        if (direction === 'default') return textarea.value;

        const base = _originalValues[side] !== null ? _originalValues[side] : textarea.value;
        // Try JSON array sort first
        const jsonResult = JsonSorter.applySort(base, null, direction);
        if (jsonResult.success) return jsonResult.result;

        // Line-level sort
        const lines = base.split('\n');
        lines.sort((a, b) => {
            const cmp = a.localeCompare(b, 'zh-CN');
            return direction === 'asc' ? cmp : -cmp;
        });
        return lines.join('\n');
    }

    /**
     * Main compare function
     */
    function doCompare() {
        let original = getSortedContent('original');
        let modified = getSortedContent('modified');

        if (!original && !modified) {
            showToast('请先输入内容', 'error');
            return;
        }

        const mode = els.diffMode.value;

        // Build diff (use sorted content for comparison)
        const { rows, stats } = DiffEngine.buildSideBySide(original, modified);
        currentDiffData = { rows, stats, mode };

        // Render
        const html = DiffEngine.render(rows, mode);
        els.diffOutput.innerHTML = html || '<div class="diff-placeholder"><p>两段内容完全相同</p></div>';

        // Update stats
        els.statAdded.textContent = stats.added;
        els.statDeleted.textContent = stats.deleted;
        els.statModified.textContent = stats.modified;
        els.statTotal.textContent = stats.added + stats.deleted + stats.modified;

        // Setup sync scroll
        setupSyncScroll();

        // Save to history
        if (stats.added + stats.deleted + stats.modified > 0) {
            Storage.saveRecord(original, modified, stats);
        }
    }

    /**
     * Setup synchronized scrolling between diff output and editors
     */
    let _syncHandlers = { diff: null, original: null, modified: null };
    function setupSyncScroll() {
        const diffOutput = els.diffOutput;
        const originalText = els.originalText;
        const modifiedText = els.modifiedText;

        // Remove old listeners
        if (_syncHandlers.diff) diffOutput.removeEventListener('scroll', _syncHandlers.diff);
        if (_syncHandlers.original) originalText.removeEventListener('scroll', _syncHandlers.original);
        if (_syncHandlers.modified) modifiedText.removeEventListener('scroll', _syncHandlers.modified);

        let scrolling = false;

        function syncToEditors() {
            if (scrolling || !isScrollSync) return;
            scrolling = true;
            const ratio = diffOutput.scrollTop / (diffOutput.scrollHeight - diffOutput.clientHeight || 1);
            originalText.scrollTop = ratio * (originalText.scrollHeight - originalText.clientHeight);
            modifiedText.scrollTop = ratio * (modifiedText.scrollHeight - modifiedText.clientHeight);
            requestAnimationFrame(() => scrolling = false);
        }

        function syncFromEditor(source) {
            if (scrolling || !isScrollSync) return;
            scrolling = true;
            const ratio = source.scrollTop / (source.scrollHeight - source.clientHeight || 1);
            diffOutput.scrollTop = ratio * (diffOutput.scrollHeight - diffOutput.clientHeight);
            const other = source === originalText ? modifiedText : originalText;
            other.scrollTop = ratio * (other.scrollHeight - other.clientHeight);
            requestAnimationFrame(() => scrolling = false);
        }

        _syncHandlers.diff = syncToEditors;
        _syncHandlers.original = () => syncFromEditor(originalText);
        _syncHandlers.modified = () => syncFromEditor(modifiedText);

        diffOutput.addEventListener('scroll', _syncHandlers.diff);
        originalText.addEventListener('scroll', _syncHandlers.original);
        modifiedText.addEventListener('scroll', _syncHandlers.modified);
    }

    /**
     * Swap original and modified content
     */
    function swapContent() {
        const temp = els.originalText.value;
        els.originalText.value = els.modifiedText.value;
        els.modifiedText.value = temp;

        // Also swap sort selections
        const tempSort = els.originalSort.value;
        els.originalSort.value = els.modifiedSort.value;
        els.modifiedSort.value = tempSort;

        // Swap stored originals
        const tempOrig = _originalValues.original;
        _originalValues.original = _originalValues.modified;
        _originalValues.modified = tempOrig;

        updateLineNumbers('original');
        updateLineNumbers('modified');
        showToast('内容已交换', 'success');
    }

    /**
     * Clear all content
     */
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
        els.statAdded.textContent = '0';
        els.statDeleted.textContent = '0';
        els.statModified.textContent = '0';
        els.statTotal.textContent = '0';
        currentDiffData = null;
        // Remove sync scroll listeners
        if (_syncHandlers.diff) els.diffOutput.removeEventListener('scroll', _syncHandlers.diff);
        if (_syncHandlers.original) els.originalText.removeEventListener('scroll', _syncHandlers.original);
        if (_syncHandlers.modified) els.modifiedText.removeEventListener('scroll', _syncHandlers.modified);
        _syncHandlers = { diff: null, original: null, modified: null };
    }

    /**
     * Show history modal
     */
    function showHistory() {
        els.historyModal.style.display = 'flex';
        renderHistoryList();
    }

    /**
     * Render history list
     */
    function renderHistoryList() {
        const records = Storage.getHistory();
        if (records.length === 0) {
            els.historyList.innerHTML = '<p class="empty-state">暂无历史记录</p>';
            return;
        }

        let html = '';
        for (const record of records) {
            const time = Storage.formatTime(record.timestamp);
            const preview = (record.original || '').slice(0, 60).replace(/\n/g, ' ');
            html += `
                <div class="history-item" data-id="${record.id}">
                    <div class="history-item-info">
                        <div class="history-item-title">${DiffEngine.escapeHtml(preview)}...</div>
                        <div class="history-item-meta">${time} · ✓${record.stats.added} ✗${record.stats.deleted} ○${record.stats.modified}</div>
                    </div>
                    <div class="history-item-actions">
                        <button class="btn-icon" data-action="load" data-id="${record.id}" title="加载">📂</button>
                        <button class="btn-icon" data-action="delete" data-id="${record.id}" title="删除">🗑</button>
                    </div>
                </div>`;
        }
        els.historyList.innerHTML = html;

        // Bind actions
        els.historyList.querySelectorAll('[data-action="load"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                loadHistoryRecord(btn.dataset.id);
            });
        });
        els.historyList.querySelectorAll('[data-action="delete"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                Storage.deleteRecord(btn.dataset.id);
                renderHistoryList();
                showToast('记录已删除');
            });
        });
    }

    /**
     * Load a history record
     */
    function loadHistoryRecord(id) {
        const record = Storage.getRecord(id);
        if (!record) return;

        els.originalText.value = record.original;
        els.modifiedText.value = record.modified;
        els.originalSort.value = 'default';
        els.modifiedSort.value = 'default';
        _originalValues.original = null;
        _originalValues.modified = null;
        updateLineNumbers('original');
        updateLineNumbers('modified');
        els.historyModal.style.display = 'none';
        doCompare();

        const truncated = (record.originalLength > record.original.length) || (record.modifiedLength > record.modified.length);
        if (truncated) {
            showToast('历史记录已加载（内容较长，仅保存了前 2000 字符）', 'warning');
        } else {
            showToast('历史记录已加载', 'success');
        }
    }

    /**
     * Show toast notification
     */
    function showToast(message, type = '') {
        els.toast.textContent = message;
        els.toast.className = 'toast' + (type ? ` toast-${type}` : '');
        els.toast.style.display = 'block';
        clearTimeout(els.toast._timer);
        els.toast._timer = setTimeout(() => {
            els.toast.style.display = 'none';
        }, 2500);
    }

    /* ========== Resize ========== */
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
            }

            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
            window.addEventListener('blur', onUp);
        });
    }

    /* ========== Theme ========== */
    const THEME_KEY = 'diffmaster_theme';

    function initTheme() {
        const saved = localStorage.getItem(THEME_KEY);
        const theme = saved || 'light';
        applyTheme(theme);
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
