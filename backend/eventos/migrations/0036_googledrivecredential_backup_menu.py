from django.db import migrations, models
import django.db.models.deletion
from django.conf import settings


def add_menu_backup_import(apps, schema_editor):
    PermissaoMenu = apps.get_model('eventos', 'PermissaoMenu')
    PermissaoMenu.objects.update_or_create(
        codigo='backup_import',
        defaults={
            'nome': 'Backup e Restore',
            'descricao': 'Exportar e restaurar banco e mídia (local ou Google Drive)',
            'ordem': 14,
            'ativo': True,
        },
    )


def remove_menu_backup_import(apps, schema_editor):
    PermissaoMenu = apps.get_model('eventos', 'PermissaoMenu')
    PermissaoMenu.objects.filter(codigo='backup_import').delete()


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('eventos', '0035_set_default_wa_msg_reserva_loja'),
    ]

    operations = [
        migrations.CreateModel(
            name='GoogleDriveCredential',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('refresh_token_encrypted', models.TextField(blank=True, verbose_name='Refresh token (criptografado)')),
                ('email', models.EmailField(blank=True, max_length=254, verbose_name='E-mail Google')),
                ('connected_at', models.DateTimeField(blank=True, null=True, verbose_name='Conectado em')),
                ('user', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='google_drive_credential', to=settings.AUTH_USER_MODEL, verbose_name='Usuário')),
            ],
            options={
                'verbose_name': 'Credencial Google Drive',
                'verbose_name_plural': 'Credenciais Google Drive',
            },
        ),
        migrations.RunPython(add_menu_backup_import, remove_menu_backup_import),
    ]
