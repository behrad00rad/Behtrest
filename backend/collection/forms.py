from django import forms
from .models import Board, Comment, Post


class PostMetadataForm(forms.ModelForm):
    class Meta:
        model = Post
        fields = ("title", "description")


class CommentForm(forms.ModelForm):
    class Meta:
        model = Comment
        fields = ("text",)


class BoardForm(forms.ModelForm):
    class Meta:
        model = Board
        fields = ("name", "description", "is_private")
