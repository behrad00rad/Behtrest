"""Bounded Words configuration; uploaded canvases use the ordinary pin pipeline."""
import base64
import io
import json
import re
from PIL import Image, ImageOps
from common.api import ApiError, consume_limit
from django.conf import settings

FONTS = {'upright', 'sans', 'meme', 'serif', 'handwritten', 'mono', 'rounded'}
ASSETS = {'coast', 'sky', 'forest'}
BAD_LANGUAGE = re.compile(r'(?<!\w)(?:fuck(?:ing)?|shit|bitch|asshole|nigger|faggot)(?!\w)', re.I)


def language_warning(text):
    return bool(BAD_LANGUAGE.search(text))


def config_from_input(raw):
    if not isinstance(raw, str) or len(raw) > 300000:
        raise ApiError('invalid_config', 'Words configuration is too large.')
    try:
        data = json.loads(raw)
        if not isinstance(data, dict) or set(data) != {'text', 'font', 'size', 'align', 'colors', 'background', 'ratio'}:
            raise ValueError()
        text = data['text']
        if not isinstance(text, str) or not 1 <= len(text.strip()) <= 280 or len(text) > 280:
            raise ValueError()
        if data['font'] not in FONTS or data['align'] not in {'left', 'center', 'right'} or data['ratio'] not in {'4:5', '1:1', '9:16'}:
            raise ValueError()
        if type(data['size']) not in (int, float) or not 24 <= data['size'] <= 240:
            raise ValueError()
        colors, bg = data['colors'], data['background']
        hexcolor = lambda value: isinstance(value, str) and re.fullmatch(r'#[0-9a-fA-F]{6}', value)
        if not isinstance(colors, dict) or set(colors) != {'text', 'highlight'} or not hexcolor(colors['text']) or (colors['highlight'] is not None and not hexcolor(colors['highlight'])):
            raise ValueError()
        if not isinstance(bg, dict) or set(bg) != {'kind', 'color', 'color2', 'asset', 'photo', 'overlay'}:
            raise ValueError()
        if bg['kind'] not in {'solid', 'gradient', 'texture', 'image'} or not hexcolor(bg['color']) or not hexcolor(bg['color2']) or bg['asset'] not in ASSETS:
            raise ValueError()
        if type(bg['overlay']) not in (int, float) or not 0 <= bg['overlay'] <= .9:
            raise ValueError()
        photo = bg['photo']
        if photo is not None:
            if not isinstance(photo, str) or len(photo) > 280000 or not re.match(r'^data:image/(?:jpeg|png|webp);base64,', photo):
                raise ValueError()
            content = base64.b64decode(photo.split(',', 1)[1], validate=True)
            with Image.open(io.BytesIO(content)) as source:
                if source.format not in {'JPEG', 'PNG', 'WEBP'} or getattr(source, 'n_frames', 1) != 1 or max(source.size) > 1200 or source.width * source.height > 1000000:
                    raise ValueError()
                source.load()
                clean = Image.new('RGB', source.size)
                clean.paste(ImageOps.exif_transpose(source).convert('RGB'))
                output = io.BytesIO(); clean.save(output, 'JPEG', quality=80)
            normalized = 'data:image/jpeg;base64,' + base64.b64encode(output.getvalue()).decode('ascii')
            if len(normalized) > 280000:
                raise ValueError()
            bg['photo'] = normalized
        data['text'] = text.strip()
        return data
    except (ValueError, TypeError, KeyError, OSError, AttributeError, Image.DecompressionBombError):
        raise ApiError('invalid_config', 'Check the Words text, colors, background and size. Text must be 1-280 characters.')


def apply_card(post, data, user, *, creating=False):
    config = config_from_input(data.get('config', ''))
    if creating and settings.API_RATE_LIMITS_ENABLED:
        wait = consume_limit('text_card_publish', str(user.pk), 10, 3600)
        if wait:
            raise ApiError('rate_limited', 'You can publish 10 Words cards per hour. Try again later.', 429)
    post.type, post.text_card_config, post.text_content = 'text_card', config, config['text']
    if not data.get('alt_text', '').strip():
        data['alt_text'] = config['text']
    return config
