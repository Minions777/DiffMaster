/**
 * Resize Module
 * Drag-handle resize for the 3-column main panel.
 *
 * Public API: ResizeManager.init(els) -> void
 */
const ResizeManager = (() => {

    function init(els) {
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

    return { init };
})();
