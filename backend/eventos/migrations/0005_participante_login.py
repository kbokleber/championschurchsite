"""
Migration para adicionar sistema de login para participantes.
Telefone passa a ser o identificador único para login.
"""

import uuid
from django.db import migrations, models


def gerar_telefones_unicos(apps, schema_editor):
    """Gera telefones únicos para membros que não possuem."""
    Membro = apps.get_model('eventos', 'Membro')
    
    telefones_usados = set()
    
    for membro in Membro.objects.all():
        # Normalizar telefone (apenas números)
        telefone = ''.join(filter(str.isdigit, membro.telefone or ''))
        
        # Se não tem telefone ou é duplicado, gerar um temporário
        if not telefone or telefone in telefones_usados:
            # Usar o ID do membro para gerar um telefone temporário único
            telefone = f"0000000{membro.id:04d}"
        
        telefones_usados.add(telefone)
        membro.telefone = telefone
        membro.save(update_fields=['telefone'])


def reverter_telefones(apps, schema_editor):
    """Reverter não faz nada."""
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('eventos', '0004_inscricao_qrcode_fields'),
    ]

    operations = [
        # Passo 1: Adicionar campos de senha
        migrations.AddField(
            model_name='membro',
            name='senha',
            field=models.CharField(
                blank=True,
                help_text='Senha para acesso à área do participante',
                max_length=128,
                verbose_name='Senha'
            ),
        ),
        migrations.AddField(
            model_name='membro',
            name='senha_texto',
            field=models.CharField(
                blank=True,
                help_text='Senha em texto para envio via WhatsApp',
                max_length=10,
                verbose_name='Senha (texto)'
            ),
        ),
        
        # Passo 2: Tornar email opcional
        migrations.AlterField(
            model_name='membro',
            name='email',
            field=models.EmailField(
                blank=True,
                null=True,
                verbose_name='E-mail'
            ),
        ),
        
        # Passo 3: Remover unique do email
        migrations.AlterField(
            model_name='membro',
            name='email',
            field=models.EmailField(
                blank=True,
                null=True,
                verbose_name='E-mail'
            ),
        ),
        
        # Passo 4: Alterar campo telefone (ainda sem unique)
        migrations.AlterField(
            model_name='membro',
            name='telefone',
            field=models.CharField(
                help_text='Número usado para login e receber mensagens',
                max_length=20,
                verbose_name='Telefone/WhatsApp',
                default=''
            ),
            preserve_default=False,
        ),
        
        # Passo 5: Gerar telefones únicos para registros existentes
        migrations.RunPython(gerar_telefones_unicos, reverter_telefones),
        
        # Passo 6: Aplicar unique no telefone
        migrations.AlterField(
            model_name='membro',
            name='telefone',
            field=models.CharField(
                help_text='Número usado para login e receber mensagens',
                max_length=20,
                unique=True,
                verbose_name='Telefone/WhatsApp'
            ),
        ),
        
        # Passo 7: Atualizar Meta
        migrations.AlterModelOptions(
            name='membro',
            options={
                'ordering': ['nome'],
                'verbose_name': 'Participante',
                'verbose_name_plural': 'Participantes'
            },
        ),
    ]
