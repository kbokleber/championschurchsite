from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('eventos', '0052_configuracaosite_wa_msg_cobranca_confirmada'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='configuracaosite',
            name='wa_msg_cobranca_confirmada',
        ),
    ]