from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('eventos', '0026_destaquehomeitem'),
    ]

    operations = [
        migrations.AddField(
            model_name='configuracaosite',
            name='wa_msg_inscricao_gratis',
            field=models.TextField(blank=True, help_text='Mensagem para inscrição em evento grátis.', verbose_name='Template WhatsApp - Inscrição grátis'),
        ),
        migrations.AddField(
            model_name='configuracaosite',
            name='wa_msg_inscricao_paga_confirmada',
            field=models.TextField(blank=True, help_text='Mensagem para pagamento confirmado (evento pago).', verbose_name='Template WhatsApp - Inscrição paga confirmada'),
        ),
        migrations.AddField(
            model_name='configuracaosite',
            name='wa_msg_inscricao_paga_pendente',
            field=models.TextField(blank=True, help_text='Mensagem para inscrição paga ainda pendente de confirmação.', verbose_name='Template WhatsApp - Inscrição paga pendente'),
        ),
        migrations.AddField(
            model_name='configuracaosite',
            name='wa_msg_reset_senha',
            field=models.TextField(blank=True, help_text='Mensagem para reset de senha. Ex.: Olá {{nome}}, sua senha é {{senha}}.', verbose_name='Template WhatsApp - Reset de senha'),
        ),
    ]

