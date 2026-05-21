/**
 * CDN dependency loader check.
 * Runs immediately to fail fast if `diff` is missing,
 * then warns about optional libs after a grace period.
 */
(() => {
    if (typeof Diff === 'undefined') {
        const overlay = document.createElement('div');
        overlay.className = 'cdn-fatal-overlay';
        overlay.textContent = '核心依赖(diff)加载失败，请检查网络连接后刷新页面';
        document.body.prepend(overlay);
        throw new Error('diff library failed to load');
    }
    setTimeout(() => {
        const missing = [];
        if (typeof hljs === 'undefined') missing.push('highlight.js');
        if (typeof LZString === 'undefined') missing.push('lz-string');
        if (missing.length > 0) {
            console.warn('[DiffMaster] CDN 依赖加载失败: ' + missing.join(', ') + '，部分功能不可用');
        }
    }, 3000);
})();
