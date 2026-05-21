/**
 * Export Module
 * Handles export-as-HTML/Text/Clipboard/Image and share URL generation.
 *
 * Public API: ExportManager.init(deps) -> { exportAsHtml, exportAsText,
 *   exportToClipboard, exportAsImage, shareUrl, loadFromUrl }
 *
 * `deps` provides DOM refs and callbacks the module shouldn't own:
 *   { els, getCurrentDiffData, showToast, doCompare, updateLineNumbers,
 *     formatJsonIfPossible }
 */
const ExportManager = (() => {
    let _deps = null;

    function init(deps) {
        _deps = deps;
        return {
            exportAsHtml, exportAsText, exportToClipboard, exportAsImage,
            shareUrl, loadFromUrl,
        };
    }

    function buildDiffText() {
        const data = _deps.getCurrentDiffData();
        const rows = data.rows;
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
        const data = _deps.getCurrentDiffData();
        if (!data) { _deps.showToast('请先进行对比', 'error'); return; }
        const styles = `body{font-family:monospace;margin:20px;background:#fff;color:#333}table{border-collapse:collapse;width:100%}td{padding:2px 8px;border:1px solid #ddd;font-size:13px;white-space:pre-wrap}.added{background:#e6ffec}.deleted{background:#ffebe9}.unchanged{background:#fff}.header{font-size:18px;font-weight:bold;margin-bottom:12px}.stats{margin-bottom:16px;color:#666}`;
        const rows = data.rows;
        let tableHtml = '<table>';
        for (const row of rows) {
            const lClass = row.left.type === 'deleted' ? 'deleted' : row.left.type === 'added' ? 'added' : 'unchanged';
            const rClass = row.right.type === 'added' ? 'added' : row.right.type === 'deleted' ? 'deleted' : 'unchanged';
            tableHtml += `<tr><td class="${lClass}">${DiffEngine.escapeHtml(row.left.text)}</td><td class="${rClass}">${DiffEngine.escapeHtml(row.right.text)}</td></tr>`;
        }
        tableHtml += '</table>';
        const stats = data.stats;
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>DiffMaster 导出</title><style>${styles}</style></head><body><div class="header">DiffMaster 对比结果</div><div class="stats">新增: ${stats.added} | 删除: ${stats.deleted} | 修改: ${stats.modified}</div>${tableHtml}</body></html>`;

        downloadBlob(html, 'text/html', `diff-${Date.now()}.html`);
        _deps.showToast('HTML 已导出', 'success');
    }

    function exportAsText() {
        if (!_deps.getCurrentDiffData()) { _deps.showToast('请先进行对比', 'error'); return; }
        downloadBlob(buildDiffText(), 'text/plain', `diff-${Date.now()}.txt`);
        _deps.showToast('文本已导出', 'success');
    }

    function exportToClipboard() {
        if (!_deps.getCurrentDiffData()) { _deps.showToast('请先进行对比', 'error'); return; }
        navigator.clipboard.writeText(buildDiffText())
            .then(() => _deps.showToast('已复制到剪贴板', 'success'));
    }

    function downloadBlob(content, mime, filename) {
        const blob = new Blob([content], { type: mime });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        a.click();
        URL.revokeObjectURL(a.href);
    }

    function exportAsImage() {
        const data = _deps.getCurrentDiffData();
        if (!data) { _deps.showToast('请先进行对比', 'error'); return; }
        const lib = typeof html2canvas !== 'undefined' ? html2canvas
            : (typeof window !== 'undefined' && typeof window.html2canvas !== 'undefined' ? window.html2canvas : null);
        if (!lib) { _deps.showToast('图片导出库未加载', 'error'); return; }

        _deps.showToast('正在生成图片...', '');

        const bgColor = getComputedStyle(document.documentElement).getPropertyValue('--bg-primary').trim() || '#ffffff';
        const fontMono = getComputedStyle(document.documentElement).getPropertyValue('--font-mono').trim() || 'monospace';
        const textColor = getComputedStyle(document.documentElement).getPropertyValue('--text-primary').trim() || '#24292f';
        const LH = DiffEngine.CONFIG.LINE_HEIGHT;
        const mode = data.mode;
        const view = data.view;
        const lang = document.getElementById('syntaxLang')?.value || 'auto';
        const els = _deps.els;

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

        function buildSideBySidePanelHTML() {
            const rows = data.rows;
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
            const lines = data.lines;
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
        diffDiv.innerHTML = view === 'unified' ? buildUnifiedDiffPanelHTML() : buildSideBySidePanelHTML();
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
                    if (!blob) { _deps.showToast('图片导出失败', 'error'); return; }
                    const a = document.createElement('a');
                    a.href = URL.createObjectURL(blob);
                    a.download = 'diff-' + Date.now() + '.png';
                    a.click();
                    URL.revokeObjectURL(a.href);
                    _deps.showToast('图片已导出', 'success');
                } finally {
                    cleanup();
                }
            }, 'image/png');
        }).catch(() => {
            _deps.showToast('图片导出失败', 'error');
            if (wrapper.parentNode) wrapper.parentNode.removeChild(wrapper);
        });
    }

    function shareUrl() {
        const els = _deps.els;
        const original = els.originalText.value;
        const modified = els.modifiedText.value;
        if (!original && !modified) { _deps.showToast('请先输入内容', 'error'); return; }

        try {
            const data = JSON.stringify({
                o: original,
                m: modified,
                opts: {
                    view: els.viewMode.value,
                    mode: els.diffMode.value,
                    lang: els.syntaxLang.value,
                    ignoreWS: els.optIgnoreWS.checked,
                    ignoreCase: els.optIgnoreCase.checked,
                }
            });
            const compressed = LZString.compressToEncodedURIComponent(data);
            const url = `${location.origin}${location.pathname}#d=${compressed}`;
            navigator.clipboard.writeText(url)
                .then(() => _deps.showToast('分享链接已复制到剪贴板', 'success'));
        } catch {
            _deps.showToast('内容过长，无法生成链接', 'error');
        }
    }

    function loadFromUrl() {
        const hash = location.hash;
        if (!hash.startsWith('#d=')) return;
        const els = _deps.els;
        try {
            const compressed = hash.slice(3);
            const data = JSON.parse(LZString.decompressFromEncodedURIComponent(compressed));
            if (data.o) els.originalText.value = data.o;
            if (data.m) els.modifiedText.value = data.m;
            if (data.opts) {
                const o = data.opts;
                if (o.view) els.viewMode.value = o.view;
                if (o.mode) els.diffMode.value = o.mode;
                if (o.lang) els.syntaxLang.value = o.lang;
                if (o.ignoreWS != null) els.optIgnoreWS.checked = !!o.ignoreWS;
                if (o.ignoreCase != null) els.optIgnoreCase.checked = !!o.ignoreCase;
            }
            _deps.updateLineNumbers('original');
            _deps.updateLineNumbers('modified');
            _deps.formatJsonIfPossible('original');
            _deps.formatJsonIfPossible('modified');
            _deps.showToast('已从分享链接加载内容', 'success');
            setTimeout(_deps.doCompare, 100);
        } catch {
            _deps.showToast('分享链接解析失败', 'error');
        }
    }

    return { init };
})();
