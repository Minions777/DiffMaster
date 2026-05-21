/**
 * Merge Module
 * Inline merge mode (per-hunk accept/reject) + 3-way merge.
 *
 * Public API: MergeManager.init(deps) -> { toggleMergeMode, applyDecision,
 *   updateMergeOutput, copyMergeResult, downloadMergeResult, do3WayMerge,
 *   resetMergeState, isMergeActive, getDecisions }
 *
 * `deps` = { els, getCurrentDiffData, showToast, doCompare }
 */
const MergeManager = (() => {
    let _deps = null;
    let _isMergeMode = false;
    let _decisions = {};

    function init(deps) {
        _deps = deps;
        return {
            toggleMergeMode, applyDecision, updateMergeOutput,
            copyMergeResult, downloadMergeResult, do3WayMerge,
            resetMergeState, isMergeActive, getDecisions,
        };
    }

    function isMergeActive() { return _isMergeMode; }
    function getDecisions() { return _decisions; }

    function toggleMergeMode() {
        const els = _deps.els;
        _isMergeMode = !_isMergeMode;
        els.btnMergeMode.classList.toggle('btn-primary', _isMergeMode);
        els.btnMergeMode.classList.toggle('btn-secondary', !_isMergeMode);
        if (_isMergeMode) {
            _decisions = {};
            els.mergePanel.style.display = '';
            if (_deps.getCurrentDiffData()) _deps.doCompare();
        } else {
            els.mergePanel.style.display = 'none';
            _decisions = {};
            if (_deps.getCurrentDiffData()) _deps.doCompare();
        }
    }

    function applyDecision(rowIdx, action) {
        _decisions[rowIdx] = action;
        updateMergeOutput();
    }

    function resetMergeState(closePanel) {
        _decisions = {};
        if (closePanel) {
            _isMergeMode = false;
            _deps.els.mergePanel.style.display = 'none';
        }
    }

    function updateMergeOutput() {
        const data = _deps.getCurrentDiffData();
        if (!data || !data.rows) return;
        const merged = DiffEngine.buildMergedText(data.rows, _decisions);
        _deps.els.mergeOutput.value = merged;
    }

    function copyMergeResult() {
        navigator.clipboard.writeText(_deps.els.mergeOutput.value)
            .then(() => _deps.showToast('合并结果已复制', 'success'));
    }

    function downloadMergeResult() {
        const blob = new Blob([_deps.els.mergeOutput.value], { type: 'text/plain' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `merged-${Date.now()}.txt`;
        a.click();
        URL.revokeObjectURL(a.href);
        _deps.showToast('合并结果已下载', 'success');
    }

    /* ==================== 3-Way Merge ==================== */

    function do3WayMerge() {
        const els = _deps.els;
        const base = els.merge3Base.value;
        const ours = els.merge3Ours.value;
        const theirs = els.merge3Theirs.value;
        if (!base || !ours || !theirs) {
            _deps.showToast('请填写所有三个版本', 'error');
            return;
        }

        const output = simpleMerge(base.split('\n'), ours.split('\n'), theirs.split('\n'));
        const conflictsFound = output.some(l => l.startsWith('<<<<<<<'));

        els.merge3Result.style.display = '';
        els.merge3Output.textContent = output.join('\n');

        if (conflictsFound) {
            _deps.showToast('合并完成，存在冲突（需手动解决）', 'warning');
        } else {
            _deps.showToast('合并完成，无冲突', 'success');
        }
    }

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

    return { init, _simpleMerge: simpleMerge, _buildOpsByBase: buildOpsByBase };
})();
