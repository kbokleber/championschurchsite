"""
Middleware de segurança para a aplicação Champions Church.
"""

import logging
import time
from collections import defaultdict
from django.http import JsonResponse
from django.conf import settings
from django.core.cache import cache

logger = logging.getLogger('eventos.security')


class RateLimitMiddleware:
    """
    Middleware para limitar taxa de requisições por IP.
    Protege contra ataques de força bruta e DDoS básico.
    """
    
    # Configurações de rate limit por endpoint
    # Desabilitado para permitir testes - pode ser reativado em produção se necessário
    RATE_LIMITS = {
        # '/api/token/': {'requests': 5, 'window': 60},  # Login: 5/minuto
        # '/api/participante/login/': {'requests': 5, 'window': 60},  # Login participante: 5/minuto
        # '/api/participante/registro/': {'requests': 10, 'window': 3600},  # Registro: 10/hora
        # '/api/mercadopago/criar-pix/': {'requests': 10, 'window': 60},  # Pagamento: 10/minuto
    }
    
    # Rate limit global - aumentado significativamente para não bloquear durante testes
    GLOBAL_RATE_LIMIT = {'requests': 10000, 'window': 60}  # 10000 req/minuto por IP (praticamente desabilitado)
    
    def __init__(self, get_response):
        self.get_response = get_response
        self.request_counts = defaultdict(list)
    
    def __call__(self, request):
        ip = self.get_client_ip(request)
        path = request.path
        current_time = time.time()
        
        # Verificar rate limit específico do endpoint
        for endpoint, limits in self.RATE_LIMITS.items():
            if path.startswith(endpoint):
                if self.is_rate_limited(ip, endpoint, limits, current_time):
                    logger.warning(f"Rate limit exceeded for IP {ip} on {endpoint}")
                    return JsonResponse({
                        'error': 'Muitas tentativas. Aguarde alguns minutos.',
                        'retry_after': limits['window']
                    }, status=429)
        
        # Verificar rate limit global
        if self.is_rate_limited(ip, 'global', self.GLOBAL_RATE_LIMIT, current_time):
            logger.warning(f"Global rate limit exceeded for IP {ip}")
            return JsonResponse({
                'error': 'Limite de requisições excedido. Tente novamente mais tarde.',
                'retry_after': 60
            }, status=429)
        
        response = self.get_response(request)
        return response
    
    def get_client_ip(self, request):
        """Obtém o IP real do cliente, considerando proxies."""
        x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
        if x_forwarded_for:
            ip = x_forwarded_for.split(',')[0].strip()
        else:
            ip = request.META.get('REMOTE_ADDR', '0.0.0.0')
        return ip
    
    def is_rate_limited(self, ip, key, limits, current_time):
        """Verifica se o IP excedeu o limite de requisições."""
        cache_key = f"ratelimit:{ip}:{key}"
        window = limits['window']
        max_requests = limits['requests']
        
        # Usar cache se disponível, senão usar memória
        try:
            timestamps = cache.get(cache_key, [])
        except:
            timestamps = self.request_counts[cache_key]
        
        # Limpar timestamps antigos
        timestamps = [t for t in timestamps if current_time - t < window]
        
        # Verificar limite
        if len(timestamps) >= max_requests:
            return True
        
        # Adicionar timestamp atual
        timestamps.append(current_time)
        
        try:
            cache.set(cache_key, timestamps, window)
        except:
            self.request_counts[cache_key] = timestamps
        
        return False


class SecurityHeadersMiddleware:
    """
    Middleware para adicionar headers de segurança às respostas.
    """
    
    def __init__(self, get_response):
        self.get_response = get_response
    
    def __call__(self, request):
        response = self.get_response(request)
        
        # Content Security Policy
        if not settings.DEBUG:
            response['Content-Security-Policy'] = (
                "default-src 'self'; "
                "script-src 'self' 'unsafe-inline' https://sdk.mercadopago.com https://*.googleapis.com https://*.gstatic.com https://analytics.kbosolucoes.com.br; "
                "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
                "img-src 'self' data: blob: https:; "
                "font-src 'self' data: https://fonts.gstatic.com; "
                "connect-src 'self' https://api.mercadopago.com https://analytics.kbosolucoes.com.br; "
                "frame-src 'self' https://www.google.com https://maps.google.com https://*.google.com; "
                "frame-ancestors 'none';"
            )
        
        # Outros headers de segurança
        response['X-Content-Type-Options'] = 'nosniff'
        response['X-Frame-Options'] = 'DENY'
        response['X-XSS-Protection'] = '1; mode=block'
        response['Referrer-Policy'] = 'strict-origin-when-cross-origin'
        # camera=(self) para permitir scanner de QR Code na página de check-in
        response['Permissions-Policy'] = 'geolocation=(), microphone=(), camera=(self)'
        
        return response


class RequestLoggingMiddleware:
    """
    Middleware para logging de requisições suspeitas.
    """
    
    # Padrões suspeitos em URLs/parâmetros
    SUSPICIOUS_PATTERNS = [
        '../', '..\\',  # Path traversal
        '<script', '</script',  # XSS
        'SELECT ', 'UNION ', 'INSERT ', 'DELETE ', 'DROP ',  # SQL Injection
        'eval(', 'exec(',  # Code injection
        '{{', '}}',  # Template injection
    ]
    
    def __init__(self, get_response):
        self.get_response = get_response
    
    def __call__(self, request):
        # Verificar padrões suspeitos
        full_path = request.get_full_path()
        body = ''
        
        try:
            body = request.body.decode('utf-8', errors='ignore')
        except:
            pass
        
        for pattern in self.SUSPICIOUS_PATTERNS:
            if pattern.lower() in full_path.lower() or pattern.lower() in body.lower():
                ip = self.get_client_ip(request)
                logger.warning(
                    f"Suspicious request detected from {ip}: "
                    f"Pattern '{pattern}' found in {request.method} {full_path}"
                )
                # Não bloquear, apenas logar (pode ter falsos positivos)
                break
        
        response = self.get_response(request)
        return response
    
    def get_client_ip(self, request):
        x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
        if x_forwarded_for:
            return x_forwarded_for.split(',')[0].strip()
        return request.META.get('REMOTE_ADDR', '0.0.0.0')
