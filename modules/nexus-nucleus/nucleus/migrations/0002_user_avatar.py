# Generated manually (mirrors `python manage.py makemigrations` output) — #148

import django.db.models.fields.files
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('nucleus', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='avatar',
            field=django.db.models.fields.files.ImageField(
                blank=True,
                help_text=(
                    "Shared avatar for both human users and personas (personas via their "
                    "identity_user shadow user). Auto-assigned at random from a preset pool "
                    "on creation; editable later. See #148."
                ),
                null=True,
                upload_to='avatars/%Y/%m/',
            ),
        ),
    ]
