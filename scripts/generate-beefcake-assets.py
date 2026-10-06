"""Genererar Beefcake-avatarerna och favicon ur originalen i assets-source/.

Kör: uv run --with pillow python scripts/generate-beefcake-assets.py

Allt i src/assets/beefcake/ är genererat. Handredigera aldrig, ändra beskärningen
här och kör om. Ikonerna i public/ skrivs bara med --icons: de är sedan 2026-10-04
appens egen symbol, och Cartman-huvudet ska inte skriva över den av misstag.
"""
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'assets-source'
AVATARS = ROOT / 'src' / 'assets' / 'beefcake'
PUBLIC = ROOT / 'public'

# beefcake2 är liggande 2816x1536, resten kvadratiska 2048. Kvadratisk
# beskärning runt figuren så alla fyra avatarerna får samma ram.
CROPS = {1: None, 2: (642, 0, 2178, 1536), 3: None, 4: None, 5: None, 6: None, 7: None}
LEVELS = (1, 2, 3, 4, 5, 6, 7)

# Huvudet i beefcake3, beskuret tight nog att läsas som ikon vid 16 px.
FAVICON_CROP = (360, 260, 1560, 1460)


def main() -> None:
    AVATARS.mkdir(parents=True, exist_ok=True)
    for level in LEVELS:
        image = Image.open(SRC / f'beefcake{level}.jpg').convert('RGB')
        if CROPS[level]:
            image = image.crop(CROPS[level])
        image.resize((320, 320), Image.LANCZOS).save(
            AVATARS / f'{level}.jpg', quality=84, optimize=True
        )
        # Firandet (klarat testset) och platån ("Vill du höja?"), en per nivå
        for kind in ('celebrate', 'plateau'):
            Image.open(SRC / f'{kind}{level}.jpg').convert('RGB').resize((320, 320), Image.LANCZOS).save(
                AVATARS / f'{kind}-{level}.jpg', quality=84, optimize=True
            )
    print('Klart: 7 avatarer, 7 firanden, 7 platåer')

    if '--icons' not in sys.argv:
        return
    head = Image.open(SRC / 'beefcake3.jpg').convert('RGB').crop(FAVICON_CROP)
    head.resize((512, 512), Image.LANCZOS).save(PUBLIC / 'pwa-512x512.png', optimize=True)
    head.resize((192, 192), Image.LANCZOS).save(PUBLIC / 'pwa-192x192.png', optimize=True)
    head.resize((180, 180), Image.LANCZOS).save(PUBLIC / 'apple-touch-icon.png', optimize=True)
    head.resize((256, 256), Image.LANCZOS).save(
        PUBLIC / 'favicon.ico', sizes=[(16, 16), (32, 32), (48, 48), (64, 64)]
    )
    print('Klart: favicon.ico, apple-touch-icon.png, pwa-192/512.png')


if __name__ == '__main__':
    main()
