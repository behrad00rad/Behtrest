"""Authoritative, dependency-free ranking. Candidate inputs can later come from embeddings."""
import math
from dataclasses import dataclass, field


@dataclass(frozen=True)
class Candidate:
    id: int
    author: int
    tags: frozenset
    created_at: object
    likes: int = 0
    saves: int = 0
    boards: frozenset = field(default_factory=frozenset)

    @property
    def primary_tag(self):
        return min(self.tags) if self.tags else ''


def decay(value, elapsed_days, half_life=14):
    return value * 0.5 ** (max(0, elapsed_days) / half_life)


def recency(candidate, now):
    return decay(1.0, (now - candidate.created_at).total_seconds() / 86400)


def jaccard(left, right):
    union = left | right
    return len(left & right) / len(union) if union else 0.0


def related_score(source, candidate, now):
    return (0.6 * jaccard(source.tags, candidate.tags)
            + 0.15 * (source.author == candidate.author)
            + 0.15 * jaccard(source.boards, candidate.boards)
            + 0.1 * recency(candidate, now))


def popularity(candidate):
    return math.log1p(candidate.likes + candidate.saves)


def affinity(candidate, weights):
    return sum(weights.get(tag, 0.0) for tag in candidate.tags) / max(1, len(candidate.tags))


def personalized_score(candidate, weights, now):
    return affinity(candidate, weights) + 0.3 * popularity(candidate) + 0.3 * recency(candidate, now)


def diverse(candidate, selected):
    if len(selected) < 2:
        return True
    a, b = selected[-2:]
    return not (a.author == b.author == candidate.author or (candidate.primary_tag and a.primary_tag == b.primary_tag == candidate.primary_tag))


def mix_ranked(personal, explore, newest):
    """7/2/1 slots per ten, with lane fallback and strict two-in-a-row diversity."""
    lanes = {'personal': personal, 'explore': explore, 'newest': newest}
    schedule = ('personal', 'personal', 'explore', 'personal', 'personal', 'newest', 'personal', 'explore', 'personal', 'personal')
    used, result = set(), []
    while True:
        preferred = schedule[len(result) % 10]
        chosen = None
        for name in (preferred, *(name for name in lanes if name != preferred)):
            chosen = next((item for item in lanes[name] if item.id not in used and diverse(item, [entry[0] for entry in result[-2:]])), None)
            if chosen:
                break
        if chosen is None:
            break
        result.append((chosen, name))
        used.add(chosen.id)
    return result


def rank_feed(candidates, weights, seen_tags, now):
    personal = sorted(candidates, key=lambda item: (personalized_score(item, weights, now) if weights else popularity(item) + .3 * recency(item, now), item.created_at, item.id), reverse=True)
    explore = sorted((item for item in candidates if item.tags - seen_tags), key=lambda item: (len(item.tags - seen_tags), popularity(item), item.created_at, item.id), reverse=True)
    newest = sorted(candidates, key=lambda item: (item.created_at, item.id), reverse=True)
    return [item.id for item, _ in mix_ranked(personal, explore, newest)]


EVENT_WEIGHTS = {'view': 0, 'click': 1, 'like': 3, 'save': 5, 'hide': -5}


def seed_weights(user, tags=None):
    from .models import UserTagInterest
    if not user.is_authenticated:
        return
    for tag in tags if tags is not None else user.profile.interests:
        UserTagInterest.objects.get_or_create(user=user, tag=tag, defaults={'weight': 1.0})


def user_weights(user, now):
    if not user.is_authenticated:
        return {}
    seed_weights(user)
    return {item.tag: decay(item.weight, (now - item.updated_at).total_seconds() / 86400) for item in user.tag_interests.all()}


def adjust_weights(user, pin, amount, now):
    from django.db import transaction
    from .models import UserTagInterest
    if not amount:
        return
    with transaction.atomic():
        seed_weights(user)
        for tag in pin.tags.all():
            item, _ = UserTagInterest.objects.select_for_update().get_or_create(user=user, tag=tag.name)
            item.weight = decay(item.weight, (now - item.updated_at).total_seconds() / 86400) + amount
            item.updated_at = now
            item.save(update_fields=['weight', 'updated_at'])
