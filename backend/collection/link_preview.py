"""Public link previews render into the same SPA shell, before JavaScript runs."""
import re
from pathlib import Path

from django.conf import settings
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils.html import escape, format_html
from django.views.decorators.http import require_GET

from common.api import endpoint, success
from .models import Post


def public_metadata(request, pk):
    post = get_object_or_404(Post.objects.select_related('owner'), pk=pk, owner__is_active=True, is_hidden=False, moderation_status='approved')
    return {
        'title': post.title,
        'description': post.description.split('\nPhoto:')[0].strip()[:300] or f'Inspiration shared by {post.owner.username} on Behtrest.',
        'image': request.build_absolute_uri(post.image.url),
        'url': request.build_absolute_uri(f'/pin/{post.pk}'),
        'image_alt': post.alt_text or post.title,
    }


@endpoint(['GET'])
def metadata(request, pk):
    return success(public_metadata(request, pk))


@require_GET
def pin_page(request, pk):
    data = public_metadata(request, pk)
    shell = Path(getattr(settings, 'FRONTEND_DIST', settings.BASE_DIR.parent / 'frontend' / 'dist')) / 'index.html'
    if not shell.is_file():
        return HttpResponse('Build the frontend before serving pin pages.', status=503, content_type='text/plain')
    html = shell.read_text(encoding='utf-8')
    tags = [('og:type', 'article'), ('og:site_name', 'Behtrest'), ('og:title', data['title']), ('og:description', data['description']), ('og:image', data['image']), ('og:image:alt', data['image_alt']), ('og:url', data['url'])]
    head = ''.join(str(format_html('<meta property="{}" content="{}">', key, value)) for key, value in tags)
    for key, value in [('twitter:card', 'summary_large_image'), ('twitter:title', data['title']), ('twitter:description', data['description']), ('twitter:image', data['image']), ('twitter:image:alt', data['image_alt'])]:
        head += str(format_html('<meta name="{}" content="{}">', key, value))
    head += str(format_html('<link rel="canonical" href="{}">', data['url']))
    html = re.sub(r'<title>.*?</title>', lambda _: f'<title>{escape(data["title"])} | Behtrest</title>', html, count=1, flags=re.S)
    html = html.replace('</head>', head + '</head>', 1)
    response = HttpResponse(html)
    response['Cache-Control'] = 'no-cache'
    return response
