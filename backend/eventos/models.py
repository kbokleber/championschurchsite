"""
Models para o sistema da Champions Church.
Inclui: Membro, Evento e Inscrição.
"""

import uuid
import qrcode
import secrets
import string
from io import BytesIO
from django.db import models
from django.core.files.base import ContentFile
from django.core.validators import RegexValidator
from django.contrib.auth.hashers import make_password, check_password


def gerar_senha_aleatoria(tamanho=6):
    """Gera uma senha numérica aleatória de 6 dígitos."""
    return ''.join(secrets.choice(string.digits) for _ in range(tamanho))


class Membro(models.Model):
    """Modelo para membros/participantes da igreja."""
    
    SEXO_CHOICES = [
        ('M', 'Masculino'),
        ('F', 'Feminino'),
    ]
    
    STATUS_CHOICES = [
        ('ativo', 'Ativo'),
        ('inativo', 'Inativo'),
        ('visitante', 'Visitante'),
    ]
    
    nome = models.CharField(max_length=200, verbose_name='Nome Completo')
    
    # Telefone é o identificador principal para login (vazio para acompanhantes)
    telefone = models.CharField(
        max_length=20,
        verbose_name='Telefone/WhatsApp',
        help_text='Número usado para login e receber mensagens',
        blank=True,
        null=True
    )
    
    # Identificação de acompanhante
    is_acompanhante = models.BooleanField(
        default=False,
        verbose_name='É Acompanhante',
        help_text='Indica se este membro é acompanhante de outro'
    )
    responsavel = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='acompanhantes',
        verbose_name='Responsável',
        help_text='Membro responsável por este acompanhante'
    )
    
    # Email agora é opcional
    email = models.EmailField(
        verbose_name='E-mail',
        blank=True,
        null=True
    )
    
    # Senha para acesso ao sistema
    senha = models.CharField(
        max_length=128,
        verbose_name='Senha',
        blank=True,
        help_text='Senha para acesso à área do participante'
    )
    
    # Senha em texto (temporário, para envio via WhatsApp)
    senha_texto = models.CharField(
        max_length=10,
        verbose_name='Senha (texto)',
        blank=True,
        help_text='Senha em texto para envio via WhatsApp'
    )
    
    data_nascimento = models.DateField(
        verbose_name='Data de Nascimento',
        null=True,
        blank=True
    )
    sexo = models.CharField(
        max_length=1,
        choices=SEXO_CHOICES,
        verbose_name='Sexo',
        blank=True
    )
    endereco = models.TextField(verbose_name='Endereço', blank=True)
    data_cadastro = models.DateTimeField(auto_now_add=True, verbose_name='Data de Cadastro')
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='visitante',
        verbose_name='Status'
    )
    foto = models.ImageField(
        upload_to='membros/',
        verbose_name='Foto',
        null=True,
        blank=True
    )
    observacoes = models.TextField(verbose_name='Observações', blank=True)
    
    class Meta:
        verbose_name = 'Participante'
        verbose_name_plural = 'Participantes'
        ordering = ['nome']
    
    def __str__(self):
        return f"{self.nome} - {self.telefone}"
    
    def delete(self, *args, **kwargs):
        """Remove o arquivo de foto do storage ao excluir o membro."""
        if self.foto:
            self.foto.delete(save=False)
        super().delete(*args, **kwargs)
    
    def definir_senha(self, senha_texto=None):
        """Define a senha do participante."""
        if senha_texto is None:
            senha_texto = gerar_senha_aleatoria()
        self.senha_texto = senha_texto
        self.senha = make_password(senha_texto)
        return senha_texto
    
    def verificar_senha(self, senha_texto):
        """Verifica se a senha está correta."""
        return check_password(senha_texto, self.senha)
    
    @staticmethod
    def normalizar_telefone(telefone):
        """Remove formatação do telefone, mantendo apenas números."""
        return ''.join(filter(str.isdigit, telefone))


class Evento(models.Model):
    """Modelo para eventos da igreja."""
    
    TIPO_CHOICES = [
        ('culto', 'Culto'),
        ('conferencia', 'Conferência'),
        ('retiro', 'Retiro'),
        ('encontro', 'Encontro'),
        ('workshop', 'Workshop'),
        ('celula', 'Célula'),
        ('outro', 'Outro'),
    ]
    
    STATUS_CHOICES = [
        ('agendado', 'Agendado'),
        ('em_andamento', 'Em Andamento'),
        ('finalizado', 'Finalizado'),
        ('cancelado', 'Cancelado'),
    ]
    
    titulo = models.CharField(max_length=200, verbose_name='Título')
    descricao = models.TextField(verbose_name='Descrição')
    tipo = models.CharField(
        max_length=20,
        choices=TIPO_CHOICES,
        default='culto',
        verbose_name='Tipo de Evento'
    )
    data_inicio = models.DateTimeField(verbose_name='Data e Hora de Início')
    data_fim = models.DateTimeField(
        verbose_name='Data e Hora de Término',
        null=True,
        blank=True
    )
    local = models.CharField(max_length=300, verbose_name='Local')
    endereco = models.TextField(verbose_name='Endereço Completo', blank=True)
    vagas = models.PositiveIntegerField(
        verbose_name='Número de Vagas',
        null=True,
        blank=True,
        help_text='Deixe em branco para vagas ilimitadas'
    )
    imagem = models.ImageField(
        upload_to='eventos/',
        verbose_name='Imagem do Evento',
        null=True,
        blank=True
    )
    # Período de inscrição
    inscricao_inicio = models.DateTimeField(
        verbose_name='Início das Inscrições',
        null=True,
        blank=True,
        help_text='Data e hora de abertura das inscrições'
    )
    inscricao_fim = models.DateTimeField(
        verbose_name='Fim das Inscrições',
        null=True,
        blank=True,
        help_text='Data e hora de encerramento das inscrições'
    )
    # Controle de evento pago/gratuito
    evento_pago = models.BooleanField(
        default=False,
        verbose_name='Evento Pago',
        help_text='Marque se este evento possui taxa de inscrição'
    )
    valor_inscricao = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        verbose_name='Valor da Inscrição',
        null=True,
        blank=True,
        help_text='Valor em R$ (deixe em branco para eventos gratuitos)'
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='agendado',
        verbose_name='Status'
    )
    destaque = models.BooleanField(
        default=False,
        verbose_name='Evento em Destaque',
        help_text='Marque para exibir na página inicial'
    )
    criado_em = models.DateTimeField(auto_now_add=True, verbose_name='Criado em')
    atualizado_em = models.DateTimeField(auto_now=True, verbose_name='Atualizado em')
    
    class Meta:
        verbose_name = 'Evento'
        verbose_name_plural = 'Eventos'
        ordering = ['-data_inicio']
    
    def __str__(self):
        return f"{self.titulo} - {self.data_inicio.strftime('%d/%m/%Y')}"
    
    def delete(self, *args, **kwargs):
        """Remove a imagem do evento do storage ao excluir."""
        if self.imagem:
            self.imagem.delete(save=False)
        super().delete(*args, **kwargs)
    
    @property
    def vagas_disponiveis(self):
        """Retorna o número de vagas disponíveis."""
        if self.vagas is None:
            return None  # Vagas ilimitadas
        inscritos = self.inscricoes.filter(status='confirmada').count()
        return max(0, self.vagas - inscritos)
    
    @property
    def esta_lotado(self):
        """Verifica se o evento está lotado."""
        if self.vagas is None:
            return False
        return self.vagas_disponiveis == 0
    
    @property
    def inscricoes_abertas(self):
        """Verifica se as inscrições estão abertas."""
        from django.utils import timezone
        agora = timezone.now()
        
        # Status que permitem inscrições
        status_validos = ['agendado', 'em_andamento']
        
        # Se não tem período definido, considera sempre aberto (desde que não lotado e status válido)
        if self.inscricao_inicio is None and self.inscricao_fim is None:
            return not self.esta_lotado and self.status in status_validos
        
        # Verifica se está dentro do período
        inicio_ok = self.inscricao_inicio is None or agora >= self.inscricao_inicio
        fim_ok = self.inscricao_fim is None or agora <= self.inscricao_fim
        
        return inicio_ok and fim_ok and not self.esta_lotado and self.status in status_validos
    
    @property
    def status_inscricao(self):
        """Retorna o status das inscrições."""
        from django.utils import timezone
        agora = timezone.now()
        
        # Status que permitem inscrições
        status_validos = ['agendado', 'em_andamento']
        
        if self.status not in status_validos:
            return 'evento_encerrado'
        
        if self.esta_lotado:
            return 'lotado'
        
        if self.inscricao_inicio and agora < self.inscricao_inicio:
            return 'nao_iniciado'
        
        if self.inscricao_fim and agora > self.inscricao_fim:
            return 'encerrado'
        
        return 'aberto'


class CategoriaParticipante(models.Model):
    """Modelo para categorias de participantes (ex: Adulto, Criança, Adolescente)."""
    
    TIPO_VALOR_CHOICES = [
        ('fixo', 'Valor Fixo'),
        ('porcentagem', 'Porcentagem do Valor'),
    ]
    
    nome = models.CharField(
        max_length=100,
        verbose_name='Nome da Categoria',
        help_text='Ex: Adulto, Criança (até 12 anos), Adolescente (até 16 anos)'
    )
    descricao = models.CharField(
        max_length=300,
        verbose_name='Descrição',
        blank=True,
        help_text='Descrição opcional da categoria'
    )
    tipo_valor = models.CharField(
        max_length=20,
        choices=TIPO_VALOR_CHOICES,
        default='porcentagem',
        verbose_name='Tipo de Valor',
        help_text='Define se o valor é fixo ou uma porcentagem do valor do evento'
    )
    valor = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        verbose_name='Valor',
        default=100,
        help_text='Valor fixo em R$ ou porcentagem (0-100). Ex: 50 = R$50 ou 50%'
    )
    idade_minima = models.PositiveIntegerField(
        verbose_name='Idade Mínima',
        null=True,
        blank=True,
        help_text='Idade mínima para esta categoria (opcional)'
    )
    idade_maxima = models.PositiveIntegerField(
        verbose_name='Idade Máxima',
        null=True,
        blank=True,
        help_text='Idade máxima para esta categoria (opcional)'
    )
    ordem = models.PositiveIntegerField(
        verbose_name='Ordem de Exibição',
        default=0,
        help_text='Ordem para exibição na lista (menor = primeiro)'
    )
    ativo = models.BooleanField(
        default=True,
        verbose_name='Ativo',
        help_text='Categorias inativas não aparecem no formulário de inscrição'
    )
    criado_em = models.DateTimeField(auto_now_add=True, verbose_name='Criado em')
    
    class Meta:
        verbose_name = 'Categoria de Participante'
        verbose_name_plural = 'Categorias de Participantes'
        ordering = ['ordem', 'nome']
    
    def __str__(self):
        if self.tipo_valor == 'fixo':
            return f"{self.nome} (R$ {self.valor})"
        return f"{self.nome} ({self.valor}%)"
    
    def calcular_valor(self, valor_evento):
        """Calcula o valor para esta categoria baseado no valor do evento."""
        if valor_evento is None or valor_evento == 0:
            return 0
        
        if self.tipo_valor == 'fixo':
            return float(self.valor)
        else:
            # Porcentagem
            return float(valor_evento) * (float(self.valor) / 100)


class Inscricao(models.Model):
    """Modelo para inscrições em eventos."""
    
    STATUS_CHOICES = [
        ('pendente', 'Pendente'),
        ('confirmada', 'Confirmada'),
        ('cancelada', 'Cancelada'),
        ('lista_espera', 'Lista de Espera'),
    ]
    
    STATUS_PAGAMENTO_CHOICES = [
        ('nao_aplicavel', 'Não Aplicável'),
        ('pendente', 'Pendente'),
        ('pago', 'Pago'),
        ('isento', 'Isento'),
    ]
    
    membro = models.ForeignKey(
        Membro,
        on_delete=models.CASCADE,
        related_name='inscricoes',
        verbose_name='Membro'
    )
    evento = models.ForeignKey(
        Evento,
        on_delete=models.CASCADE,
        related_name='inscricoes',
        verbose_name='Evento'
    )
    # Categoria do participante
    categoria = models.ForeignKey(
        CategoriaParticipante,
        on_delete=models.SET_NULL,
        related_name='inscricoes',
        verbose_name='Categoria',
        null=True,
        blank=True,
        help_text='Categoria do participante (Adulto, Criança, etc.)'
    )
    # Responsável pela inscrição (para acompanhantes)
    responsavel = models.ForeignKey(
        Membro,
        on_delete=models.CASCADE,
        related_name='inscricoes_responsavel',
        verbose_name='Responsável',
        null=True,
        blank=True,
        help_text='Membro responsável por esta inscrição (para acompanhantes)'
    )
    is_acompanhante = models.BooleanField(
        default=False,
        verbose_name='É Acompanhante',
        help_text='Indica se esta inscrição é de um acompanhante'
    )
    # Controle financeiro
    valor_inscricao = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        verbose_name='Valor da Inscrição',
        default=0,
        help_text='Valor calculado para esta inscrição específica'
    )
    status_pagamento = models.CharField(
        max_length=20,
        choices=STATUS_PAGAMENTO_CHOICES,
        default='nao_aplicavel',
        verbose_name='Status do Pagamento'
    )
    data_pagamento = models.DateTimeField(
        verbose_name='Data do Pagamento',
        null=True,
        blank=True
    )
    # Código único para QR Code
    codigo = models.CharField(
        max_length=36,
        unique=True,
        editable=False,
        verbose_name='Código de Inscrição',
        help_text='Código único para check-in via QR Code'
    )
    qrcode = models.ImageField(
        upload_to='qrcodes/',
        verbose_name='QR Code',
        null=True,
        blank=True
    )
    data_inscricao = models.DateTimeField(
        auto_now_add=True,
        verbose_name='Data da Inscrição'
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='pendente',
        verbose_name='Status'
    )
    observacoes = models.TextField(
        verbose_name='Observações',
        blank=True
    )
    presente = models.BooleanField(
        default=False,
        verbose_name='Presença Confirmada'
    )
    data_checkin = models.DateTimeField(
        verbose_name='Data/Hora do Check-in',
        null=True,
        blank=True
    )
    
    class Meta:
        verbose_name = 'Inscrição'
        verbose_name_plural = 'Inscrições'
        ordering = ['-data_inscricao']
        unique_together = ['membro', 'evento']  # Um membro só pode se inscrever uma vez em cada evento
    
    def __str__(self):
        return f"{self.membro.nome} - {self.evento.titulo}"
    
    def save(self, *args, **kwargs):
        # Gerar código único se não existir
        if not self.codigo:
            self.codigo = str(uuid.uuid4())
        
        # Salvar primeiro para ter o ID
        super().save(*args, **kwargs)
        
        # Gerar QR Code apenas se:
        # 1. Ainda não tem QR code
        # 2. Pagamento NÃO está pendente (ou seja, já foi pago, isento ou não aplicável)
        if not self.qrcode and self.status_pagamento != 'pendente':
            self.gerar_qrcode()
    
    def gerar_qrcode(self):
        """Gera a imagem do QR Code para esta inscrição."""
        # Dados do QR Code (código único)
        qr_data = self.codigo
        
        # Criar QR Code
        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_L,
            box_size=10,
            border=4,
        )
        qr.add_data(qr_data)
        qr.make(fit=True)
        
        # Criar imagem
        img = qr.make_image(fill_color="black", back_color="white")
        
        # Salvar em memória
        buffer = BytesIO()
        img.save(buffer, format='PNG')
        buffer.seek(0)
        
        # Salvar no campo
        filename = f'qrcode_{self.codigo}.png'
        self.qrcode.save(filename, ContentFile(buffer.read()), save=True)
    
    def delete(self, *args, **kwargs):
        """Remove o arquivo do QR Code do storage ao excluir a inscrição."""
        if self.qrcode:
            self.qrcode.delete(save=False)
        super().delete(*args, **kwargs)


class Cobranca(models.Model):
    """Modelo para gerenciar cobranças de pagamento (integração com gateway)."""
    
    STATUS_CHOICES = [
        ('pendente', 'Pendente'),
        ('pago', 'Pago'),
        ('cancelado', 'Cancelado'),
        ('isento', 'Isento'),
        ('reembolsado', 'Reembolsado'),
    ]
    
    # Código único para identificação no gateway
    codigo = models.CharField(
        max_length=36,
        unique=True,
        editable=False,
        verbose_name='Código da Cobrança',
        help_text='Código único para integração com gateway de pagamento'
    )
    
    # Responsável pelo pagamento
    membro = models.ForeignKey(
        Membro,
        on_delete=models.CASCADE,
        related_name='cobrancas',
        verbose_name='Membro Responsável'
    )
    
    # Evento relacionado
    evento = models.ForeignKey(
        Evento,
        on_delete=models.CASCADE,
        related_name='cobrancas',
        verbose_name='Evento'
    )
    
    # Valor da cobrança
    valor = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        verbose_name='Valor da Cobrança'
    )
    
    # Descrição do que está sendo cobrado
    descricao = models.TextField(
        verbose_name='Descrição',
        blank=True,
        help_text='Detalhes dos itens incluídos nesta cobrança'
    )
    
    # Status da cobrança
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='pendente',
        verbose_name='Status'
    )
    
    # Datas
    data_criacao = models.DateTimeField(
        auto_now_add=True,
        verbose_name='Data de Criação'
    )
    data_pagamento = models.DateTimeField(
        verbose_name='Data do Pagamento',
        null=True,
        blank=True
    )
    
    # Referência externa (ID do gateway de pagamento)
    referencia_externa = models.CharField(
        max_length=100,
        verbose_name='Referência Externa',
        blank=True,
        help_text='ID da transação no gateway de pagamento'
    )
    
    # Método de pagamento
    metodo_pagamento = models.CharField(
        max_length=50,
        verbose_name='Método de Pagamento',
        blank=True,
        help_text='Ex: PIX, Cartão de Crédito, etc.'
    )
    
    class Meta:
        verbose_name = 'Cobrança'
        verbose_name_plural = 'Cobranças'
        ordering = ['-data_criacao']
    
    def __str__(self):
        return f"Cobrança {self.codigo} - {self.membro.nome} - R$ {self.valor}"
    
    def save(self, *args, **kwargs):
        if not self.codigo:
            self.codigo = str(uuid.uuid4())
        super().save(*args, **kwargs)


class CobrancaItem(models.Model):
    """Itens incluídos em uma cobrança."""
    
    cobranca = models.ForeignKey(
        Cobranca,
        on_delete=models.CASCADE,
        related_name='itens',
        verbose_name='Cobrança'
    )
    inscricao = models.ForeignKey(
        Inscricao,
        on_delete=models.CASCADE,
        related_name='itens_cobranca',
        verbose_name='Inscrição'
    )
    valor = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        verbose_name='Valor do Item'
    )
    descricao = models.CharField(
        max_length=200,
        verbose_name='Descrição',
        blank=True
    )
    
    class Meta:
        verbose_name = 'Item de Cobrança'
        verbose_name_plural = 'Itens de Cobrança'
    
    def __str__(self):
        return f"{self.inscricao.membro.nome} - R$ {self.valor}"


class Contato(models.Model):
    """Modelo para mensagens de contato do site."""
    
    nome = models.CharField(max_length=200, verbose_name='Nome')
    email = models.EmailField(verbose_name='E-mail')
    telefone = models.CharField(max_length=15, verbose_name='Telefone', blank=True)
    assunto = models.CharField(max_length=200, verbose_name='Assunto')
    mensagem = models.TextField(verbose_name='Mensagem')
    data_envio = models.DateTimeField(auto_now_add=True, verbose_name='Data de Envio')
    lido = models.BooleanField(default=False, verbose_name='Lido')
    respondido = models.BooleanField(default=False, verbose_name='Respondido')
    
    class Meta:
        verbose_name = 'Contato'
        verbose_name_plural = 'Contatos'
        ordering = ['-data_envio']
    
    def __str__(self):
        return f"{self.nome} - {self.assunto}"


class ConfiguracaoSite(models.Model):
    """Modelo singleton para configurações gerais do site."""
    
    # Informações básicas
    nome_igreja = models.CharField(
        max_length=200,
        verbose_name='Nome da Igreja',
        default='Champions Church'
    )
    slogan = models.CharField(
        max_length=300,
        verbose_name='Slogan',
        blank=True,
        help_text='Frase curta que aparece junto ao nome'
    )
    descricao = models.TextField(
        verbose_name='Descrição',
        blank=True,
        help_text='Texto sobre a igreja para o rodapé'
    )
    
    # Logo
    logo = models.ImageField(
        upload_to='configuracoes/',
        verbose_name='Logo',
        null=True,
        blank=True
    )
    logo_branco = models.ImageField(
        upload_to='configuracoes/',
        verbose_name='Logo Branco (para fundos escuros)',
        null=True,
        blank=True
    )
    favicon = models.ImageField(
        upload_to='configuracoes/',
        verbose_name='Favicon',
        null=True,
        blank=True
    )
    
    # Contato
    email = models.EmailField(
        verbose_name='E-mail de Contato',
        blank=True
    )
    telefone = models.CharField(
        max_length=20,
        verbose_name='Telefone',
        blank=True
    )
    whatsapp = models.CharField(
        max_length=20,
        verbose_name='WhatsApp',
        blank=True,
        help_text='Número com DDD (apenas números)'
    )
    
    # Endereço
    endereco = models.CharField(
        max_length=300,
        verbose_name='Endereço',
        blank=True
    )
    cidade = models.CharField(
        max_length=100,
        verbose_name='Cidade',
        blank=True
    )
    estado = models.CharField(
        max_length=2,
        verbose_name='Estado (UF)',
        blank=True
    )
    cep = models.CharField(
        max_length=10,
        verbose_name='CEP',
        blank=True
    )
    
    # Redes sociais
    facebook = models.URLField(
        verbose_name='Facebook',
        blank=True,
        help_text='URL completa do perfil/página'
    )
    instagram = models.URLField(
        verbose_name='Instagram',
        blank=True,
        help_text='URL completa do perfil'
    )
    youtube = models.URLField(
        verbose_name='YouTube',
        blank=True,
        help_text='URL completa do canal'
    )
    tiktok = models.URLField(
        verbose_name='TikTok',
        blank=True,
        help_text='URL completa do perfil'
    )
    twitter = models.URLField(
        verbose_name='Twitter/X',
        blank=True,
        help_text='URL completa do perfil'
    )
    
    # Horários de funcionamento
    horarios = models.TextField(
        verbose_name='Horários dos Cultos',
        blank=True,
        help_text='Ex: Domingos: 9h e 18h | Quartas: 19h30'
    )
    
    # Google Maps
    google_maps_embed = models.TextField(
        verbose_name='Código embed do Google Maps',
        blank=True,
        help_text='Cole o código iframe do Google Maps'
    )
    
    # Webhooks e Integrações
    webhook_inscricao = models.URLField(
        verbose_name='Webhook de Inscrição',
        blank=True,
        help_text='URL para enviar dados quando uma nova inscrição é realizada (ex: integração com WhatsApp)'
    )
    webhook_ativo = models.BooleanField(
        default=False,
        verbose_name='Webhook Ativo',
        help_text='Marque para ativar o envio de webhooks'
    )
    webhook_reset_senha = models.URLField(
        verbose_name='Webhook de Reset de Senha',
        blank=True,
        null=True,
        help_text='URL para enviar dados quando um participante solicita reset de senha'
    )
    
    # Mercado Pago - Configurações
    mp_ambiente = models.CharField(
        max_length=20,
        verbose_name='Ambiente Mercado Pago',
        choices=[
            ('sandbox', 'Sandbox (Testes)'),
            ('production', 'Produção'),
        ],
        default='sandbox',
        help_text='Selecione o ambiente de operação'
    )
    mp_ativo = models.BooleanField(
        default=False,
        verbose_name='Mercado Pago Ativo',
        help_text='Ativar integração com Mercado Pago para pagamentos'
    )
    
    # Mercado Pago - Credenciais Sandbox (Testes)
    mp_public_key_sandbox = models.CharField(
        max_length=100,
        verbose_name='Public Key (Sandbox)',
        blank=True,
        help_text='Chave pública do Mercado Pago para ambiente de testes'
    )
    mp_access_token_sandbox = models.CharField(
        max_length=100,
        verbose_name='Access Token (Sandbox)',
        blank=True,
        help_text='Token de acesso do Mercado Pago para ambiente de testes'
    )
    
    # Mercado Pago - Credenciais Produção
    mp_public_key_production = models.CharField(
        max_length=100,
        verbose_name='Public Key (Produção)',
        blank=True,
        help_text='Chave pública do Mercado Pago para produção'
    )
    mp_access_token_production = models.CharField(
        max_length=100,
        verbose_name='Access Token (Produção)',
        blank=True,
        help_text='Token de acesso do Mercado Pago para produção'
    )
    
    # Metadata
    atualizado_em = models.DateTimeField(auto_now=True, verbose_name='Atualizado em')
    
    class Meta:
        verbose_name = 'Configuração do Site'
        verbose_name_plural = 'Configurações do Site'
    
    def __str__(self):
        return f"Configurações - {self.nome_igreja}"
    
    def save(self, *args, **kwargs):
        # Garante que só existe uma instância (singleton)
        self.pk = 1
        super().save(*args, **kwargs)
    
    def delete(self, *args, **kwargs):
        """Remove os arquivos de mídia (logo, favicon) do storage ao excluir."""
        for field in (self.logo, self.logo_branco, self.favicon):
            if field:
                field.delete(save=False)
        super().delete(*args, **kwargs)
    
    @classmethod
    def get_config(cls):
        """Retorna a configuração atual ou cria uma nova se não existir."""
        config, created = cls.objects.get_or_create(pk=1)
        return config
    
    @property
    def mp_public_key(self):
        """Retorna a Public Key do ambiente atual."""
        if self.mp_ambiente == 'production':
            return self.mp_public_key_production
        return self.mp_public_key_sandbox
    
    @property
    def mp_access_token(self):
        """Retorna o Access Token do ambiente atual."""
        if self.mp_ambiente == 'production':
            return self.mp_access_token_production
        return self.mp_access_token_sandbox
    
    @property
    def mp_is_sandbox(self):
        """Verifica se está em ambiente sandbox."""
        return self.mp_ambiente == 'sandbox'
