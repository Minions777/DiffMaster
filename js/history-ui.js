/**
 * History UI Module
 * Renders comparison history modal and handles record load/delete.
 *
 * Public API: HistoryUI.init(deps) -> { showHistory, renderHistoryList,
 *   loadHistoryRecord }
 *
 * `deps` = { els, showToast, doCompare, formatJsonIfPossible,
 *   updateLineNumbers, resetSortState }
 */
const HistoryUI = (() => {
    let _deps = null;

    function init(deps) {
        _deps = deps;
        return { showHistory, renderHistoryList, loadHistoryRecord };
    }

    function showHistory() {
        _deps.els.historyModal.style.display = 'flex';
        renderHistoryList();
    }

    function renderHistoryList() {
        const els = _deps.els;
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
            delBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                Storage.deleteRecord(record.id);
                renderHistoryList();
                _deps.showToast('记录已删除');
            });
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
        const els = _deps.els;
        els.originalText.value = record.original;
        els.modifiedText.value = record.modified;
        _deps.resetSortState();
        _deps.formatJsonIfPossible('original');
        _deps.formatJsonIfPossible('modified');
        _deps.updateLineNumbers('original');
        _deps.updateLineNumbers('modified');
        els.historyModal.style.display = 'none';
        _deps.doCompare();
        const truncated = (record.originalLength > record.original.length)
            || (record.modifiedLength > record.modified.length);
        if (truncated) {
            _deps.showToast('历史记录已加载（内容较长，仅保存了前 2000 字符）', 'warning');
        } else {
            _deps.showToast('历史记录已加载', 'success');
        }
    }

    return { init };
})();
