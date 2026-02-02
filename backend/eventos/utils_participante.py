import jwt
from datetime import datetime, timedelta
from django.conf import settings
from django.utils import timezone as tz

def gerar_token_participante(membro):
    """
    Gera um token JWT para um participante.
    """
    payload = {
        'participante_id': membro.id,
        'telefone': membro.telefone,
        'nome': membro.nome,
        'exp': datetime.utcnow() + timedelta(days=30),
        'iat': datetime.utcnow(),
        'type': 'participante'
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm='HS256')

def formatar_telefone_display(telefone):
    """
    Formata telefone para exibição amigável.
    """
    if not telefone:
        return ""
    
    # Remove qualquer máscara existente
    numeros = "".join(filter(str.isdigit, telefone))
    
    if len(numeros) == 11:
        return f"({numeros[:2]}) {numeros[2:7]}-{numeros[7:]}"
    elif len(numeros) == 10:
        return f"({numeros[:2]}) {numeros[2:6]}-{numeros[6:]}"
    
    return telefone

def formatar_data_br(dt):
    """
    Converte data para fuso horário local (Brasil) e formata como string.
    """
    if dt is None:
        return None
        
    if tz.is_aware(dt):
        dt_local = tz.localtime(dt)
    else:
        dt_local = dt
        
    return dt_local.strftime('%d/%m/%Y %H:%M')
