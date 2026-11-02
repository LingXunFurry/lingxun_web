(() => {
    const pending = new Map(), locked = new Set();
    let hideTimer;
    const banner = () => document.getElementById('uploadStatus');
    const show = (title, detail, busy, failed = false) => {
        window.clearTimeout(hideTimer);
        banner().hidden = false;
        banner().dataset.state = failed ? 'error' : busy ? 'uploading' : 'done';
        document.getElementById('uploadStatusTitle').textContent = title;
        document.getElementById('uploadStatusDetail').textContent = detail;
        document.getElementById('uploadStatusProgress').hidden = !busy;
    };
    const update = () => {
        const files = [...pending.values()].flatMap(item => item.files);
        show(`正在上传并处理 ${files.length} 个文件…`, `上传已开始，请勿重复操作 · ${files.map(file => file.name).join('、')}`, true);
    };
    window.withAdminUpload = (path, options, send) => {
        const files = [...options.body.values()].filter(value => value instanceof File && value.size > 0);
        const key = JSON.stringify([options.method || 'POST', path, files.map(file => [file.name, file.size, file.lastModified])]);
        if (pending.has(key)) { update(); return pending.get(key).promise; }
        const entry = { files, promise: null };
        pending.set(key, entry);
        document.querySelectorAll('#appView input[type=file], #appView form button[type=submit], #appView form button:not([type]), [data-gallery-replace], [data-content-save]').forEach(control => {
            if (!control.disabled) { locked.add(control); control.disabled = true; }
        });
        update();
        entry.promise = (async () => {
            let error;
            try { return await send(); }
            catch (failure) { error = failure; throw failure; }
            finally {
                pending.delete(key);
                if (pending.size) update();
                else {
                    locked.forEach(control => { if (control.isConnected) control.disabled = false; }); locked.clear();
                    show(error ? '上传未完成' : '上传完成', error ? error.message || '请检查网络后重新选择文件。' : '文件已上传并处理完成。', false, Boolean(error));
                    hideTimer = window.setTimeout(() => { banner().hidden = true; }, error ? 8000 : 3000);
                }
            }
        })();
        return entry.promise;
    };
})();
