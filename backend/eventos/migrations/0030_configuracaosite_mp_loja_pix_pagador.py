from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('eventos', '0029_definir_categoria_adulto_inscricoes_principais'),
    ]

    operations = [
        migrations.AddField(
            model_name='configuracaosite',
            name='mp_loja_pix_email',
            field=models.EmailField(
                blank=True,
                help_text='E-mail enviado ao Mercado Pago em vendas da loja/cantina (cliente não se identifica). Se vazio, usa o e-mail de contato da igreja.',
                max_length=254,
                verbose_name='E-mail pagador PIX (loja)',
            ),
        ),
        migrations.AddField(
            model_name='configuracaosite',
            name='mp_loja_pix_cpf_cnpj',
            field=models.CharField(
                blank=True,
                help_text='CPF (11 dígitos) ou CNPJ (14) da igreja para gerar PIX na loja sem pedir dados do comprador.',
                max_length=18,
                verbose_name='CPF/CNPJ pagador PIX (loja)',
            ),
        ),
    ]
