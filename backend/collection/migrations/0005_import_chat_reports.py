from django.db import migrations


def import_reports(apps, schema_editor):
    Report = apps.get_model("messaging", "Report")
    ContentReport = apps.get_model("collection", "ContentReport")
    db = schema_editor.connection.alias
    for item in Report.objects.using(db).select_related("message").iterator():
        ContentReport.objects.using(db).get_or_create(reporter_id=item.user_id, kind="message", target_id=item.message_id, defaults={"target_user_id": item.message.sender_id, "reason": item.reason, "evidence": item.evidence, "status": "actioned" if item.resolved else "open"})


class Migration(migrations.Migration):
    dependencies = [("collection", "0004_comment_is_hidden_post_is_hidden_activitysettings_and_more"), ("messaging", "0002_message_is_hidden")]
    operations = [migrations.RunPython(import_reports, migrations.RunPython.noop)]
