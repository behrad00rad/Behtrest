from django import forms
from django.core.validators import URLValidator
from urllib.parse import urlsplit
from .models import Board, Comment, Post


class PostMetadataForm(forms.ModelForm):
    class Meta:
        model = Post
        fields = ("title", "description", "alt_text", "source_url", "allow_download")

    def clean_source_url(self):
        value = self.cleaned_data["source_url"]
        if value:
            URLValidator(schemes=["http", "https"])(value)
            parsed = urlsplit(value)
            if parsed.username or parsed.password:
                raise forms.ValidationError("Source links must not include credentials.")
        return value


class CommentForm(forms.ModelForm):
    def clean_text(self):
        text = self.cleaned_data['text'].strip()
        if len(text) < 2:
            raise forms.ValidationError('Use at least 2 characters.')
        return text

    class Meta:
        model = Comment
        fields = ("text",)


class BoardForm(forms.ModelForm):
    class Meta:
        model = Board
        fields = ("name", "description", "is_private")
