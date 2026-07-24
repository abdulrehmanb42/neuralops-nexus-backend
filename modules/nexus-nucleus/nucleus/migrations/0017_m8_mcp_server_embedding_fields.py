# Generated manually for M8 — MCP embedding control fields

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('nucleus', '0016_m7_1_chat_session_and_timeout'),
    ]

    operations = [
        migrations.AddField(
            model_name='mcpserver',
            name='is_first_party',
            field=models.BooleanField(
                default=False,
                help_text=(
                    'True = marketplace-published MCP (we own it). '
                    'False = external/third-party (no embedding allowed).'
                ),
            ),
        ),
        migrations.AddField(
            model_name='mcpserver',
            name='embed_output',
            field=models.BooleanField(
                default=False,
                help_text=(
                    'Opt-in: embed MCP tool results to ChromaDB. '
                    'Only meaningful when is_first_party=True.'
                ),
            ),
        ),
    ]
