# Generated manually for M7.1 — Session Management

import django.db.models.deletion
import uuid
from django.conf import settings
from django.db import migrations, models
from django.utils import timezone


class Migration(migrations.Migration):

    dependencies = [
        ('nucleus', '0015_add_display_name_to_user'),
    ]

    operations = [
        # 1. Add session_timeout_minutes to CompanyAIConfig
        migrations.AddField(
            model_name='companyaiconfig',
            name='session_timeout_minutes',
            field=models.PositiveIntegerField(
                default=30,
                help_text='How long an @session stays active without explicit close (minutes).',
            ),
        ),

        # 2. Create ChatSession table
        migrations.CreateModel(
            name='ChatSession',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('is_active', models.BooleanField(db_index=True, default=True)),
                ('deleted_at', models.DateTimeField(blank=True, null=True)),
                ('expires_at', models.DateTimeField(
                    help_text='Fixed expiry from session open time. Not rolling.',
                )),
                ('user', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='chat_sessions',
                    to=settings.AUTH_USER_MODEL,
                )),
                ('topic', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='chat_sessions',
                    to='nucleus.chattopic',
                )),
                ('personas', models.ManyToManyField(
                    blank=True,
                    related_name='chat_sessions',
                    to='nucleus.persona',
                )),
            ],
            options={
                'db_table': 'workspace_chat_session',
            },
        ),

        # 3. Unique constraint: one active session per (user, topic)
        migrations.AddConstraint(
            model_name='chatsession',
            constraint=models.UniqueConstraint(
                fields=['user', 'topic'],
                name='uniq_user_topic_chat_session',
            ),
        ),

        # 4. Indexes
        migrations.AddIndex(
            model_name='chatsession',
            index=models.Index(fields=['user', 'topic'], name='workspace_chatsession_user_topic_idx'),
        ),
        migrations.AddIndex(
            model_name='chatsession',
            index=models.Index(fields=['expires_at'], name='workspace_chatsession_expires_at_idx'),
        ),
    ]
