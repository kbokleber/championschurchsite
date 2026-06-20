"""Models da fila assincrona (JobFila + WhatsappMensagem)."""

from django.db import models


class JobFila(models.Model):
    """Trabalho assincrono persistido.

    Cada trabalho (envio de WhatsApp, processamento de webhook MP, baixa de
    estoque etc.) gera um registro que e processado por um worker RQ. Os
    workers recuperam jobs perdidos apos reinicio do backend, evitando
    perda de mensagens/pagamentos quando o processo cai no meio do envio.
    """

    STATUS_CHOICES = [
        ('pendente', 'Pendente'),
        ('executando', 'Executando'),
        ('sucesso', 'Sucesso'),
        ('falha', 'Falha'),
        ('cancelado', 'Cancelado'),
    ]

    FILA_CHOICES = [
        ('critica', 'Critica (pagamentos/estoque)'),
        ('whatsapp', 'WhatsApp'),
        ('baixa', 'Baixa prioridade (webhooks/auditoria)'),
    ]

    tipo = models.CharField(max_length=80, db_index=True)
    fila = models.CharField(max_length=20, choices=FILA_CHOICES, default='baixa', db_index=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pendente', db_index=True)

    payload = models.JSONField(default=dict, blank=True)

    tentativas = models.PositiveIntegerField(default=0)
    max_tentativas = models.PositiveIntegerField(default=5)
    proxima_execucao_em = models.DateTimeField(null=True, blank=True, db_index=True)
    ultima_execucao_em = models.DateTimeField(null=True, blank=True)
    duracao_ms = models.PositiveIntegerField(null=True, blank=True)
    ultimo_erro = models.TextField(blank=True)

    referencia_tipo = models.CharField(max_length=80, blank=True, db_index=True)
    referencia_id = models.CharField(max_length=80, blank=True, db_index=True)

    job_id = models.CharField(max_length=80, blank=True)

    criado_em = models.DateTimeField(auto_now_add=True)
    atualizado_em = models.DateTimeField(auto_now=True)
    concluido_em = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = 'Job de Fila'
        verbose_name_plural = 'Jobs de Fila'
        ordering = ['-criado_em']
        indexes = [
            models.Index(fields=['status', 'tipo']),
            models.Index(fields=['fila', 'status']),
            models.Index(fields=['proxima_execucao_em']),
        ]

    def __str__(self):
        return f'#{self.pk} {self.tipo} ({self.status})'


class TentativaJob(models.Model):
    """Historico de cada tentativa de execucao de um JobFila."""

    job = models.ForeignKey(JobFila, on_delete=models.CASCADE, related_name='tentativas_log')
    iniciado_em = models.DateTimeField(auto_now_add=True)
    terminou_em = models.DateTimeField(null=True, blank=True)
    sucesso = models.BooleanField(default=False)
    erro = models.TextField(blank=True)
    http_status = models.IntegerField(null=True, blank=True)

    class Meta:
        verbose_name = 'Tentativa de Job'
        verbose_name_plural = 'Tentativas de Job'
        ordering = ['-iniciado_em']

    def __str__(self):
        return f'Tentativa #{self.pk} job={self.job_id} sucesso={self.sucesso}'


class WhatsappMensagem(models.Model):
    """Registro especializado de mensagens WhatsApp.

    Mantem a mensagem renderizada e dados de envio para auditoria rapida,
    alem de apontar para o JobFila correspondente.
    """

    TIPO_CHOICES = [
        ('inscricao_gratis', 'Inscricao gratuita'),
        ('inscricao_paga_pendente', 'Inscricao paga - pendente'),
        ('inscricao_paga_confirmada', 'Inscricao paga - confirmada'),
        ('inscricao_isenta_admin', 'Inscricao isenta (admin)'),
        ('reset_senha', 'Reset de senha'),
        ('cobranca_confirmada', 'Cobranca confirmada'),
        ('recibo_loja', 'Recibo loja'),
        ('lembrete_reserva_loja', 'Lembrete reserva loja'),
    ]

    job = models.OneToOneField(JobFila, on_delete=models.CASCADE, related_name='whatsapp')
    tipo = models.CharField(max_length=40, choices=TIPO_CHOICES, db_index=True)
    telefone = models.CharField(max_length=30, db_index=True)
    mensagem_renderizada = models.TextField(blank=True)
    instancia_override = models.CharField(max_length=120, blank=True)
    api_key_override = models.CharField(max_length=255, blank=True)

    class Meta:
        verbose_name = 'Mensagem WhatsApp'
        verbose_name_plural = 'Mensagens WhatsApp'
        ordering = ['-job__criado_em']

    def __str__(self):
        return f'{self.tipo} -> {self.telefone} ({self.job.status})'
