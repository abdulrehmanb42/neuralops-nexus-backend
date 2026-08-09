from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('authn', '0002_initial'),
    ]

    operations = [
        migrations.DeleteModel(
            name='DeviceSession',
        ),
    ]
