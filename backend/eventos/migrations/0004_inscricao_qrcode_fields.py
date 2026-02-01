"""
Migration para adicionar campos de QR Code à inscrição.
Gera códigos únicos para inscrições existentes.
"""

import uuid
from django.db import migrations, models


def gerar_codigos_unicos(apps, schema_editor):
    """Gera códigos únicos para todas as inscrições existentes."""
    Inscricao = apps.get_model('eventos', 'Inscricao')
    for inscricao in Inscricao.objects.all():
        inscricao.codigo = str(uuid.uuid4())
        inscricao.save(update_fields=['codigo'])


def reverter_codigos(apps, schema_editor):
    """Reverte códigos para vazio."""
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('eventos', '0003_evento_evento_pago_evento_valor_inscricao'),
    ]

    operations = [
        # Passo 1: Adicionar campo codigo sem unique
        migrations.AddField(
            model_name='inscricao',
            name='codigo',
            field=models.CharField(
                blank=True,
                default='',
                help_text='Código único para check-in via QR Code',
                max_length=36,
                verbose_name='Código de Inscrição'
            ),
            preserve_default=False,
        ),
        
        # Passo 2: Gerar códigos únicos para inscrições existentes
        migrations.RunPython(gerar_codigos_unicos, reverter_codigos),
        
        # Passo 3: Adicionar constraint unique
        migrations.AlterField(
            model_name='inscricao',
            name='codigo',
            field=models.CharField(
                editable=False,
                help_text='Código único para check-in via QR Code',
                max_length=36,
                unique=True,
                verbose_name='Código de Inscrição'
            ),
        ),
        
        # Passo 4: Adicionar campo qrcode
        migrations.AddField(
            model_name='inscricao',
            name='qrcode',
            field=models.ImageField(
                blank=True,
                null=True,
                upload_to='qrcodes/',
                verbose_name='QR Code'
            ),
        ),
        
        # Passo 5: Adicionar campo data_checkin
        migrations.AddField(
            model_name='inscricao',
            name='data_checkin',
            field=models.DateTimeField(
                blank=True,
                null=True,
                verbose_name='Data/Hora do Check-in'
            ),
        ),
    ]
