import io
import json
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from PIL import Image
from .models import Post, Comment, PinLike, Board, SavedPost, ImageScan
from .tests import MediaTestCase
from .words import config_from_input

CONFIG={'text':'A quieter kind of courage','font':'serif','size':88,'align':'center','ratio':'4:5','colors':{'text':'#ffffff','highlight':None},'background':{'kind':'solid','color':'#183247','color2':'#546e87','asset':'coast','photo':None,'overlay':.35}}

@override_settings(API_RATE_LIMITS_ENABLED=False)
class WordsTests(MediaTestCase):
    def setUp(self):
        super().setUp()
        self.user=get_user_model().objects.create_user('words_author','words@example.invalid')
        self.other=get_user_model().objects.create_user('words_other','other@example.invalid')
        self.client.force_login(self.user)

    def picture(self):
        buffer=io.BytesIO();Image.new('RGB',(80,100),'navy').save(buffer,'PNG')
        return SimpleUploadedFile('words.png',buffer.getvalue(),content_type='image/png')

    def create(self, config=None, **extra):
        return self.client.post('/api/posts/',{'title':'My Words','image':self.picture(),'type':'text_card','config':json.dumps(config or CONFIG),**extra})

    def test_normal_pin_pipeline_and_searchable_alt_text(self):
        response=self.create(tags='quiet, courage');self.assertEqual(response.status_code,201,response.content)
        pin=Post.objects.get(pk=response.json()['data']['id'])
        self.assertEqual(pin.type,'text_card');self.assertEqual(pin.alt_text,CONFIG['text']);self.assertEqual(pin.text_content,CONFIG['text'])
        self.assertEqual(pin.text_card_config,CONFIG)
        self.assertEqual(self.client.get('/api/feed/?q=quieter').json()['data']['items'][0]['id'],pin.pk)
        # Editable config is owner-only and omitted from feed payloads.
        self.assertIsNone(self.client.get('/api/feed/?q=quieter').json()['data']['items'][0]['config'])
        self.assertEqual(self.client.get(f'/api/posts/{pin.pk}/').json()['data']['config'],CONFIG)
        self.client.force_login(self.other)
        self.assertIsNone(self.client.get(f'/api/posts/{pin.pk}/').json()['data']['config'])

    def test_owner_reopens_and_rerenders_without_losing_social_records(self):
        pin=Post.objects.get(pk=self.create().json()['data']['id']);original=pin.image.name
        comment=Comment.objects.create(post=pin,author=self.other,text='Worth keeping.')
        PinLike.objects.create(pin=pin,user=self.other);board=Board.objects.create(owner=self.other,name='Words');SavedPost.objects.create(board=board,post=pin)
        config={**CONFIG,'text':'A revised thought'}
        data={'title':'Revised','image':self.picture(),'type':'text_card','config':json.dumps(config)}
        self.client.force_login(self.other)
        self.assertEqual(self.client.post(f'/api/posts/{pin.pk}/text-card/',data).status_code,404)
        self.client.force_login(self.user);data['image']=self.picture()
        with self.captureOnCommitCallbacks(execute=True):
            response=self.client.post(f'/api/posts/{pin.pk}/text-card/',data)
        self.assertEqual(response.status_code,200,response.content)
        pin.refresh_from_db();self.assertNotEqual(original,pin.image.name);self.assertEqual(pin.text_content,'A revised thought')
        self.assertTrue(Comment.objects.filter(pk=comment.pk).exists());self.assertTrue(pin.likes.exists());self.assertTrue(pin.saves.exists())

    def test_font_size_accepts_240_and_rejects_larger(self):
        self.assertEqual(self.create({**CONFIG, 'font':'upright', 'size':240}).status_code,201)
        self.assertEqual(self.create({**CONFIG, 'size':242}).status_code,400)

    def test_invalid_config_and_non_card_config_rejected(self):
        for config in [{**CONFIG,'text':'x'*281},{**CONFIG,'font':'injected'},{**CONFIG,'background':{**CONFIG['background'],'photo':'https://example.com/image.jpg'}},{**CONFIG,'size':True}]:
            self.assertEqual(self.create(config).status_code,400)
        response=self.client.post('/api/posts/',{'title':'Image','image':self.picture(),'config':json.dumps(CONFIG)})
        self.assertEqual(response.status_code,400)

    def test_warning_does_not_block_publish(self):
        response=self.create({**CONFIG,'text':'This shit is exhausting.'})
        self.assertEqual(response.status_code,201,response.content);self.assertEqual(response.json()['data']['warnings'],['language'])

    @override_settings(API_RATE_LIMITS_ENABLED=True)
    def test_ten_per_hour_limit_survives_deleted_cards(self):
        from common.api import consume_limit
        for _ in range(10): consume_limit('text_card_publish',str(self.user.pk),10,3600)
        response=self.create();self.assertEqual(response.status_code,429,response.content)
        self.assertEqual(Post.objects.count(),0)

    @override_settings(IMAGE_MODERATION_ENABLED=True)
    def test_cards_keep_image_review_on_create_and_edit(self):
        response=self.create();self.assertEqual(response.status_code,201,response.content)
        pin=Post.objects.get(pk=response.json()['data']['id']);self.assertEqual(pin.moderation_status,'pending');self.assertTrue(ImageScan.objects.filter(post=pin).exists())
        response=self.client.post(f'/api/posts/{pin.pk}/text-card/',{'title':'Updated','image':self.picture(),'config':json.dumps(CONFIG)})
        self.assertEqual(response.status_code,200,response.content);self.assertEqual(ImageScan.objects.filter(post=pin).count(),1)
