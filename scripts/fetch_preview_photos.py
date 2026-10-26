"""Cache credited Lorem Picsum photos for the isolated preview (never at request time)."""
import concurrent.futures
import io
import json
from pathlib import Path
import urllib.request

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / '.local' / 'preview-photos'
PHOTO_IDS = (10, 11, 12, 15, 16, 17, 19, 20, 21, 25, 27, 28, 29, 42, 49, 58, 76, 82, 106, 119, 152, 164, 180, 292)


def fetch(url, limit):
    request = urllib.request.Request(url, headers={'User-Agent': 'Behtrest-local-preview/1.0'})
    with urllib.request.urlopen(request, timeout=30) as response:
        data = response.read(limit + 1)
    if len(data) > limit:
        raise ValueError('Photo response exceeded the download limit.')
    return data


def download(photo_id):
    image_path = CACHE / f'{photo_id}.jpg'
    info_path = CACHE / f'{photo_id}.json'
    if not info_path.exists():
        info = json.loads(fetch(f'https://picsum.photos/id/{photo_id}/info', 65536))
        info_path.write_text(json.dumps(info, ensure_ascii=False, indent=2), encoding='utf-8')
    if not image_path.exists():
        data = fetch(f'https://picsum.photos/id/{photo_id}/800/1000', 5 * 1024 * 1024)
        with Image.open(io.BytesIO(data)) as image:
            image.verify()
        image_path.write_bytes(data)
    return photo_id


if __name__ == '__main__':
    CACHE.mkdir(parents=True, exist_ok=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        for photo_id in pool.map(download, PHOTO_IDS):
            print(f'Photo {photo_id} cached with credit.', flush=True)
    sheet = Image.new('RGB', (960, 4 * 230), '#152334')
    draw = ImageDraw.Draw(sheet)
    for index, photo_id in enumerate(PHOTO_IDS):
        with Image.open(CACHE / f'{photo_id}.jpg') as image:
            image.thumbnail((152, 200))
            x, y = (index % 6) * 160, (index // 6) * 230
            sheet.paste(image, (x, y))
            draw.text((x + 5, y + 205), str(photo_id), fill='white')
    sheet.save(CACHE / 'contact-sheet.jpg')
