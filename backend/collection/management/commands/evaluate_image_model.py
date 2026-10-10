"""Evaluate a locally supplied, labeled corpus without copying or downloading images."""
import json
import time
from pathlib import Path
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.core.files.uploadedfile import SimpleUploadedFile
from common.media import prepare_image
from collection.image_moderation import Detector


class Command(BaseCommand):
    help = 'Evaluate a local JSON manifest [{"id":"sample", "file":"image.jpg", "expected":"allow"|"block"}].'

    def add_arguments(self, parser):
        parser.add_argument("manifest")
        parser.add_argument("--output", required=True)
        parser.add_argument("--review", type=float, default=settings.IMAGE_MODERATION_REVIEW)
        parser.add_argument("--reject", type=float, default=settings.IMAGE_MODERATION_REJECT)

    def handle(self, *args, **options):
        review, reject = options['review'], options['reject']
        if not 0 <= review < reject <= 1: raise CommandError('Require 0 <= review < reject <= 1.')
        manifest = Path(options['manifest']).resolve()
        try: entries = json.loads(manifest.read_text(encoding='utf-8'))
        except (OSError, ValueError) as error: raise CommandError('Cannot read JSON manifest.') from error
        if not isinstance(entries, list) or not 1 <= len(entries) <= 10000: raise CommandError('Supply 1–10,000 labeled samples.')
        paths, ids = [], set()
        for entry in entries:
            if not isinstance(entry, dict) or entry.get('expected') not in ['allow', 'block'] or not isinstance(entry.get('id'), str) or not isinstance(entry.get('file'), str):
                raise CommandError('Each sample needs a string id/file and allow/block expectation.')
            path = (manifest.parent / entry['file']).resolve()
            if entry['id'] in ids or not path.is_relative_to(manifest.parent) or not path.is_file():
                raise CommandError('Use unique IDs and existing files within the manifest directory.')
            ids.add(entry['id']); paths.append(path)
        detector = Detector()
        rows = []
        for entry, path in zip(entries, paths):
            started = time.perf_counter()
            original, _, _, _ = prepare_image(SimpleUploadedFile(path.name, path.read_bytes()))
            scores = detector.predict(original)
            confidence = max(scores.values(), default=0)
            status = 'rejected' if confidence >= reject else 'review' if confidence >= review else 'approved'
            rows.append({'id': entry['id'], 'expected': entry['expected'], 'decision': status, 'scores': scores,
                         'milliseconds': round((time.perf_counter() - started) * 1000, 2)})
        allowed = [row for row in rows if row['expected'] == 'allow']
        blocked = [row for row in rows if row['expected'] == 'block']
        def rate(items, outcome):
            return round(sum(row['decision'] == outcome for row in items) / len(items), 4) if items else None
        summary = {'samples': len(rows), 'allowed_samples': len(allowed), 'blocked_samples': len(blocked),
                   'false_rejection_rate': rate(allowed, 'rejected'), 'blocked_approval_rate': rate(blocked, 'approved'),
                   'review_rate': rate(rows, 'review'), 'mean_milliseconds': round(sum(row['milliseconds'] for row in rows) / len(rows), 2)}
        report = {'thresholds': {'review': review, 'reject': reject}, 'summary': summary, 'samples': rows}
        Path(options['output']).write_text(json.dumps(report, indent=2), encoding='utf-8')
        self.stdout.write(json.dumps(summary))
