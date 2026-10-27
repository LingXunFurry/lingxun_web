"""Optional asset preparation: pip install 'fonttools[woff]'. Not a build dependency."""

import json
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[1]
FONTS = ROOT / 'public' / 'fonts'


def rename(font, family, weight):
    style = 'Bold' if weight == 700 else 'Regular'
    names = {1: family, 2: style, 3: f'{family}-{style}', 4: f'{family} {style}', 6: f'{family.replace(" ", "")}-{style}', 16: family, 17: style}
    for record in font['name'].names:
        if record.nameID in names:
            record.string = names[record.nameID].encode(record.getEncoding(), errors='replace')
    if 'CFF ' in font:
        cff = font['CFF '].cff
        cff.fontNames = [names[6]]
        cff.topDictIndex[0].FamilyName = family
        cff.topDictIndex[0].FullName = names[4]


def main():
    text = ''.join(chr(code) for code in range(32, 256))
    for folder in ('src', 'backend/app'):
        for path in sorted((ROOT / folder).rglob('*')):
            if path.suffix in {'.astro', '.ts', '.css', '.html', '.js', '.py', '.md'}:
                text += path.read_text(encoding='utf-8')
    unicodes = {ord(char) for char in text}
    rules, manifest = [], []
    for kind in ('Sans', 'Serif'):
        for style, weight in (('Regular', 400), ('Bold', 700)):
            source = FONTS / f'SourceHan{kind}SC-{style}.otf'
            for edition in ('Full', 'Core'):
                family = f'Tavern {kind} {edition}'
                filename = f'Tavern{kind}-{style}-{edition.lower()}.woff2'
                target = FONTS / filename
                font = TTFont(source)
                if edition == 'Core':
                    options = subset.Options()
                    options.recalc_timestamp = False
                    options.name_IDs = ['*']
                    sub = subset.Subsetter(options=options)
                    sub.populate(unicodes=unicodes)
                    sub.subset(font)
                rename(font, family, weight)
                font.flavor = 'woff2'
                font.save(target)
                font.close()
                rules.append(f'@font-face {{ font-family: "{family}"; src: url("/fonts/{filename}") format("woff2"); font-style: normal; font-weight: {weight}; font-display: swap; }}')
                manifest.append({'source': source.name, 'output': filename, 'family': family, 'bytes': target.stat().st_size, 'license': f'licenses/SourceHan{kind}-LICENSE.txt'})
                print(filename, target.stat().st_size, flush=True)
    (FONTS / 'tavern-fonts.css').write_text('\n'.join(rules) + '\n', encoding='utf-8')
    (FONTS / 'tavern-fonts.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main()
