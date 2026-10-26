from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('accounts', '0003_referral_allowance_override_referral_enabled')]
    operations = [migrations.AddField(model_name='profile', name='interests', field=models.JSONField(blank=True, default=list))]
