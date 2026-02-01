"""
Validadores de segurança para a aplicação Champions Church.
"""

import re
import bleach
from django.core.exceptions import ValidationError
from django.core.validators import RegexValidator


# ==============================================
# VALIDADORES DE TELEFONE
# ==============================================

telefone_validator = RegexValidator(
    regex=r'^\d{10,11}$',
    message='Telefone deve conter apenas números (10 ou 11 dígitos)',
    code='invalid_phone'
)


def validar_telefone(telefone):
    """Valida e limpa número de telefone."""
    if not telefone:
        return None
    
    # Remover tudo que não for dígito
    telefone_limpo = re.sub(r'\D', '', telefone)
    
    # Verificar tamanho
    if len(telefone_limpo) < 10 or len(telefone_limpo) > 11:
        raise ValidationError('Telefone inválido. Deve ter 10 ou 11 dígitos.')
    
    return telefone_limpo


# ==============================================
# VALIDADORES DE EMAIL
# ==============================================

def validar_email(email):
    """Valida formato de email."""
    if not email:
        return None
    
    # Regex básico para email
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    if not re.match(pattern, email):
        raise ValidationError('Email inválido.')
    
    # Sanitizar
    return email.lower().strip()


# ==============================================
# SANITIZAÇÃO DE TEXTO
# ==============================================

def sanitizar_texto(texto, max_length=None, allow_html=False):
    """
    Sanitiza texto removendo caracteres perigosos.
    
    Args:
        texto: Texto a ser sanitizado
        max_length: Tamanho máximo permitido
        allow_html: Se permite algumas tags HTML básicas
    """
    if not texto:
        return texto
    
    texto = str(texto).strip()
    
    # Remover caracteres nulos e de controle
    texto = re.sub(r'[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]', '', texto)
    
    # Se não permite HTML, remover todas as tags
    if not allow_html:
        texto = bleach.clean(texto, tags=[], strip=True)
    else:
        # Permitir apenas tags seguras
        tags_permitidas = ['b', 'i', 'u', 'strong', 'em', 'br', 'p']
        texto = bleach.clean(texto, tags=tags_permitidas, strip=True)
    
    # Limitar tamanho
    if max_length and len(texto) > max_length:
        texto = texto[:max_length]
    
    return texto


def sanitizar_nome(nome):
    """Sanitiza nome de pessoa."""
    if not nome:
        raise ValidationError('Nome é obrigatório.')
    
    nome = sanitizar_texto(nome, max_length=200)
    
    # Verificar se tem pelo menos 2 caracteres
    if len(nome) < 2:
        raise ValidationError('Nome deve ter pelo menos 2 caracteres.')
    
    # Verificar caracteres permitidos (letras, espaços, acentos, hífen, apóstrofo)
    if not re.match(r'^[\w\s\'-áéíóúâêîôûãõàèìòùäëïöüçÁÉÍÓÚÂÊÎÔÛÃÕÀÈÌÒÙÄËÏÖÜÇ]+$', nome, re.UNICODE):
        raise ValidationError('Nome contém caracteres inválidos.')
    
    return nome


# ==============================================
# VALIDADORES DE VALORES MONETÁRIOS
# ==============================================

def validar_valor_monetario(valor):
    """Valida valor monetário."""
    try:
        valor = float(valor)
    except (TypeError, ValueError):
        raise ValidationError('Valor inválido.')
    
    if valor < 0:
        raise ValidationError('Valor não pode ser negativo.')
    
    if valor > 100000:  # Limite razoável
        raise ValidationError('Valor excede o limite permitido.')
    
    return round(valor, 2)


# ==============================================
# VALIDADORES DE UUID
# ==============================================

def validar_uuid(uuid_string):
    """Valida formato UUID."""
    import uuid
    
    try:
        uuid.UUID(str(uuid_string))
        return str(uuid_string)
    except (ValueError, TypeError):
        raise ValidationError('Código inválido.')


# ==============================================
# PROTEÇÃO CONTRA INJECTION
# ==============================================

def detectar_sql_injection(texto):
    """Detecta possíveis tentativas de SQL injection."""
    if not texto:
        return False
    
    padroes_suspeitos = [
        r"(\s|^)(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER|CREATE)(\s|$)",
        r"(-{2}|/\*|\*/)",  # Comentários SQL
        r"(;.*--)",  # Comandos encadeados
        r"(\'.*OR.*\'.*=.*\')",  # Bypass de autenticação
        r"(EXEC|EXECUTE|xp_)",  # Stored procedures
    ]
    
    texto_upper = texto.upper()
    for padrao in padroes_suspeitos:
        if re.search(padrao, texto_upper, re.IGNORECASE):
            return True
    
    return False


def detectar_xss(texto):
    """Detecta possíveis tentativas de XSS."""
    if not texto:
        return False
    
    padroes_suspeitos = [
        r"<script",
        r"javascript:",
        r"on\w+\s*=",  # Event handlers
        r"<iframe",
        r"<object",
        r"<embed",
        r"eval\s*\(",
        r"document\.",
        r"window\.",
    ]
    
    texto_lower = texto.lower()
    for padrao in padroes_suspeitos:
        if re.search(padrao, texto_lower, re.IGNORECASE):
            return True
    
    return False


def validar_entrada_segura(texto, campo='campo'):
    """
    Valida entrada contra ataques comuns.
    Lança ValidationError se detectar padrões suspeitos.
    """
    if not texto:
        return texto
    
    if detectar_sql_injection(texto):
        raise ValidationError(f'{campo} contém caracteres não permitidos.')
    
    if detectar_xss(texto):
        raise ValidationError(f'{campo} contém caracteres não permitidos.')
    
    return texto
