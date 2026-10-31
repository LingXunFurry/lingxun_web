"""Local diagnostic only: pip install psutil; python benchmark_image_worker.py."""
import gc
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time

from PIL import Image
import psutil


with tempfile.TemporaryDirectory() as directory:
    root = Path(directory)
    for extension, mode, size in [('jpg', 'RGB', (12000, 8000)), ('png', 'RGB', (8000, 6000)), ('webp', 'RGB', (8000, 6000)), ('png', 'RGBA', (8000, 6000))]:
        source, target = root / f'original.{extension}', root / 'small.webp'
        image = Image.new(mode, size, (40, 65, 90, 128) if mode == 'RGBA' else (40, 65, 90))
        image.save(source)
        image.close()
        del image
        gc.collect()
        start = time.monotonic()
        process = subprocess.Popen(
            [sys.executable, '-m', 'app.image_worker', str(source), str(target), '1920', '80'],
            env={**os.environ, 'VIPS_CONCURRENCY': '1'}, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        )
        peak = 0
        while process.poll() is None:
            try:
                parent = psutil.Process(process.pid)
                peak = max(peak, sum(p.memory_info().rss for p in [parent, *parent.children(recursive=True)]))
            except psutil.NoSuchProcess:
                pass
            time.sleep(.01)
        _, error = process.communicate()
        assert process.returncode == 0, error.decode(errors='replace')
        assert peak < 256 * 1024 * 1024, f'Decoder exceeded 256MiB: {peak}'
        with Image.open(target) as result:
            assert max(result.size) <= 1920
            print(json.dumps({'format': extension, 'mode': mode, 'pixels': size[0] * size[1], 'peak_MiB': round(peak / 1048576, 1), 'seconds': round(time.monotonic() - start, 2), 'output': result.size}))
