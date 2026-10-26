from datetime import timedelta
from unittest import TestCase

from django.utils import timezone

from .recommender import Candidate, decay, jaccard, related_score, personalized_score, mix_ranked, rank_feed


class ScoringTests(TestCase):
    def setUp(self):
        self.now = timezone.now()

    def item(self, pk, author=None, tags=None, days=0, likes=0, boards=()):
        return Candidate(pk, pk if author is None else author, frozenset(tags or [f'tag-{pk}']), self.now - timedelta(days=days), likes, boards=frozenset(boards))

    def test_decay_has_fourteen_day_half_life_and_no_future_inflation(self):
        self.assertEqual(decay(8, 14), 4)
        self.assertEqual(decay(-8, 28), -2)
        self.assertEqual(decay(8, -1), 8)

    def test_related_score_matches_formula_and_empty_tags(self):
        source = self.item(1, author=2, tags=['blue', 'nature'], boards=[1, 2])
        candidate = self.item(2, author=2, tags=['blue', 'design'], boards=[2, 3])
        self.assertAlmostEqual(related_score(source, candidate, self.now), .6 / 3 + .15 + .15 / 3 + .1)
        self.assertEqual(jaccard(frozenset(), frozenset()), 0)

    def test_affinity_and_negative_feedback_affect_scores(self):
        pin = self.item(1, tags=['nature'])
        self.assertGreater(personalized_score(pin, {'nature': 3}, self.now), personalized_score(pin, {'nature': -5}, self.now))

    def test_blend_has_seven_two_one_slots_and_no_duplicates(self):
        personal = [self.item(pk) for pk in range(1, 31)]
        explore = [self.item(pk) for pk in range(101, 131)]
        newest = [self.item(pk) for pk in range(201, 231)]
        first = mix_ranked(personal, explore, newest)[:10]
        labels = [label for _, label in first]
        self.assertEqual([labels.count(label) for label in ('personal', 'explore', 'newest')], [7, 2, 1])
        self.assertEqual(len(set(pin.id for pin, _ in first)), 10)

    def test_diversity_applies_to_author_and_primary_tag(self):
        pool = [self.item(pk, author=pk % 3, tags=[f'tag-{pk % 4}']) for pk in range(30)]
        order = rank_feed(pool, {'tag-1': 5}, set(), self.now)
        by_id = {pin.id: pin for pin in pool}
        for index in range(len(order) - 2):
            three = [by_id[pk] for pk in order[index:index + 3]]
            self.assertGreater(len({pin.author for pin in three}), 1)
            self.assertGreater(len({pin.primary_tag for pin in three}), 1)
        self.assertEqual(len(set(order)), len(order))

    def test_new_user_starts_with_popular_and_explores_new_tags(self):
        popular = self.item(1, likes=100)
        pool = [popular, self.item(2), self.item(3)]
        self.assertEqual(rank_feed(pool, {}, set(), self.now)[0], popular.id)
