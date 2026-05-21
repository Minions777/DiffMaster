/**
 * Image Diff Module
 * Handles image upload, comparison in multiple modes (side-by-side, overlay, swipe, pixel-diff)
 */
const ImageDiff = (() => {
    const MAX_IMAGE_DIMENSION = 5000;

    let _originalImage = null;
    let _modifiedImage = null;
    let _swiping = false;

    function init(imageUploadOriginal, imageUploadModified, imageDiffResult, imageDiffCanvas, imageSwipeHandle, imageDiffMode, showToast) {
        _showToast = showToast;

        setupZone(imageUploadOriginal, 'original');
        setupZone(imageUploadModified, 'modified');

        // Swipe handle
        imageSwipeHandle.addEventListener('mousedown', (e) => { e.preventDefault(); _swiping = true; });
        document.addEventListener('mousemove', (e) => {
            if (!_swiping) return;
            const rect = imageDiffResult.getBoundingClientRect();
            const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
            imageSwipeHandle.style.left = x + 'px';
            updateSwipeClip(x, rect.width, imageDiffCanvas);
        });
        document.addEventListener('mouseup', () => { _swiping = false; });

        return { doCompare: () => _doCompare(imageDiffMode, imageDiffCanvas, imageSwipeHandle, imageDiffResult) };
    }

    let _showToast;

    function setupZone(zone, side) {
        const fileInput = zone.querySelector('input[type="file"]');
        const canvas = zone.querySelector('.image-canvas');
        const placeholder = zone.querySelector('.upload-placeholder');

        zone.addEventListener('click', () => fileInput.click());
        zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.style.borderColor = 'var(--accent-blue)'; });
        zone.addEventListener('dragleave', () => { zone.style.borderColor = ''; });
        zone.addEventListener('drop', (e) => {
            e.preventDefault();
            zone.style.borderColor = '';
            if (e.dataTransfer.files.length > 0) loadImage(e.dataTransfer.files[0], zone, fileInput, canvas, placeholder, side);
        });
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) loadImage(e.target.files[0], zone, fileInput, canvas, placeholder, side);
        });
    }

    function loadImage(file, zone, fileInput, canvas, placeholder, side) {
        const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB for images
        if (file.size > MAX_FILE_SIZE) {
            _showToast && _showToast('图片文件过大（' + (file.size / 1024 / 1024).toFixed(1) + 'MB），最大支持 50MB', 'error');
            return;
        }

        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
            URL.revokeObjectURL(url);
            if (img.width > MAX_IMAGE_DIMENSION || img.height > MAX_IMAGE_DIMENSION) {
                _showToast && _showToast('图片尺寸过大（' + img.width + 'x' + img.height + '），最大支持 ' + MAX_IMAGE_DIMENSION + 'x' + MAX_IMAGE_DIMENSION, 'error');
                return;
            }
            canvas.width = img.width;
            canvas.height = img.height;
            canvas.getContext('2d').drawImage(img, 0, 0);
            canvas.style.display = '';
            placeholder.style.display = 'none';
            if (side === 'original') _originalImage = img;
            else _modifiedImage = img;
        };
        img.onerror = () => { URL.revokeObjectURL(url); _showToast && _showToast('图片加载失败', 'error'); };
        img.src = url;
    }

    function _doCompare(modeSelect, canvas, swipeHandle, resultEl) {
        if (!_originalImage || !_modifiedImage) { _showToast && _showToast('请上传两张图片', 'error'); return; }
        const mode = modeSelect.value;
        const w = Math.max(_originalImage.width, _modifiedImage.width);
        const h = Math.max(_originalImage.height, _modifiedImage.height);

        if (mode === 'side-by-side') {
            canvas.width = _originalImage.width + _modifiedImage.width;
            canvas.height = Math.max(_originalImage.height, _modifiedImage.height);
            const ctx = canvas.getContext('2d');
            ctx.drawImage(_originalImage, 0, 0);
            ctx.drawImage(_modifiedImage, _originalImage.width, 0);
            swipeHandle.style.display = 'none';
        } else if (mode === 'overlay') {
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.globalAlpha = 0.5;
            ctx.drawImage(_originalImage, 0, 0);
            ctx.drawImage(_modifiedImage, 0, 0);
            ctx.globalAlpha = 1;
            swipeHandle.style.display = 'none';
        } else if (mode === 'swipe') {
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(_originalImage, 0, 0);
            const clipW = w / 2;
            ctx.save();
            ctx.beginPath();
            ctx.rect(clipW, 0, w - clipW, h);
            ctx.clip();
            ctx.drawImage(_modifiedImage, 0, 0);
            ctx.restore();
            swipeHandle.style.display = '';
            swipeHandle.style.left = clipW + 'px';
        } else if (mode === 'diff') {
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');

            const oc = document.createElement('canvas');
            oc.width = w; oc.height = h;
            const octx = oc.getContext('2d');
            octx.drawImage(_originalImage, 0, 0);
            const oData = octx.getImageData(0, 0, w, h);

            const mc = document.createElement('canvas');
            mc.width = w; mc.height = h;
            const mctx = mc.getContext('2d');
            mctx.drawImage(_modifiedImage, 0, 0);
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
            swipeHandle.style.display = 'none';
        }

        resultEl.style.display = '';
    }

    function updateSwipeClip(x, totalW, canvas) {
        if (!_originalImage || !_modifiedImage) return;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(_originalImage, 0, 0);
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, 0, totalW - x, canvas.height);
        ctx.clip();
        ctx.drawImage(_modifiedImage, 0, 0);
        ctx.restore();
    }

    function getImages() { return { original: _originalImage, modified: _modifiedImage }; }

    return { init, getImages };
})();