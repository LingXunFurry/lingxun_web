"""Isolated, sequential decoder: native image memory is released at process exit."""

import sys

import pyvips


if __name__ == '__main__':
    pyvips.cache_set_max_mem(16 * 1024 * 1024)
    pyvips.cache_set_max(0)
    source, target, dimension, quality = sys.argv[1:]
    image = pyvips.Image.thumbnail(
        source, int(dimension), height=int(dimension), size='down',
        fail_on='error', no_rotate=False,
    )
    image.webpsave(target, Q=int(quality), strip=True, effort=4)
