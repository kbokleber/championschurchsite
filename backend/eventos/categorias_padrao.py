"""
Grupo padrão e faixas Adulto / Adolescente / Criança.
"""

from .models import CategoriaParticipante, GrupoCategoria, Inscricao

FAIXAS_PADRAO = (
    {
        'nome': 'Adulto',
        'descricao': 'Maiores de 18 anos',
        'tipo_valor': 'porcentagem',
        'valor': 100,
        'idade_minima': 18,
        'idade_maxima': None,
        'ordem': 1,
    },
    {
        'nome': 'Adolescente',
        'descricao': 'De 13 à 17 anos',
        'tipo_valor': 'porcentagem',
        'valor': 50,
        'idade_minima': 13,
        'idade_maxima': 17,
        'ordem': 2,
    },
    {
        'nome': 'Criança',
        'descricao': 'De 0 a 12 anos',
        'tipo_valor': 'porcentagem',
        'valor': 0,
        'idade_minima': 1,
        'idade_maxima': 12,
        'ordem': 3,
    },
)


def get_grupo_padrao():
    return garantir_grupo_padrao()


def _deduplicar_faixas_grupo(grupo, nome_faixa, cat_principal):
    """Remove faixas duplicadas no mesmo grupo, preservando inscrições."""
    duplicatas = CategoriaParticipante.objects.filter(
        grupo=grupo, nome=nome_faixa,
    ).exclude(pk=cat_principal.pk).order_by('pk')
    for dup in duplicatas:
        Inscricao.objects.filter(categoria=dup).update(categoria=cat_principal)
        dup.delete()


def _garantir_faixa_no_grupo(grupo, defs):
    """Garante uma única faixa por nome no grupo padrão."""
    qs = CategoriaParticipante.objects.filter(
        grupo=grupo, nome=defs['nome'],
    ).order_by('pk')
    cat = qs.first()
    if cat and qs.count() > 1:
        _deduplicar_faixas_grupo(grupo, defs['nome'], cat)
    if cat is None:
        cat = CategoriaParticipante.objects.create(
            grupo=grupo,
            padrao_sistema=True,
            ativo=True,
            **defs,
        )
    else:
        changed = []
        if not cat.padrao_sistema:
            cat.padrao_sistema = True
            changed.append('padrao_sistema')
        if not cat.ativo:
            cat.ativo = True
            changed.append('ativo')
        if changed:
            cat.save(update_fields=changed)
    return cat


def garantir_grupo_padrao():
    """Garante grupo Padrão com as 3 faixas; retorna instância do grupo."""
    grupo, _ = GrupoCategoria.objects.get_or_create(
        padrao_sistema=True,
        defaults={
            'nome': 'Padrão',
            'descricao': 'Grupo padrão do sistema (Adulto, Adolescente, Criança)',
            'ativo': True,
        },
    )
    if grupo.nome != 'Padrão':
        grupo.nome = 'Padrão'
        grupo.padrao_sistema = True
        grupo.save(update_fields=['nome', 'padrao_sistema'])

    for defs in FAIXAS_PADRAO:
        _garantir_faixa_no_grupo(grupo, defs)

    CategoriaParticipante.objects.filter(grupo__isnull=True).update(grupo=grupo)

    return grupo


def _faixa_do_grupo(grupo, nome_faixa):
    if not grupo:
        return None
    qs = CategoriaParticipante.objects.filter(
        grupo=grupo, nome=nome_faixa, ativo=True,
    ).order_by('pk')
    cat = qs.first()
    if cat and qs.count() > 1:
        _deduplicar_faixas_grupo(grupo, nome_faixa, cat)
    return cat


def get_categoria_adulto_padrao():
    grupo = garantir_grupo_padrao()
    return _faixa_do_grupo(grupo, 'Adulto')


def categorias_do_evento(evento):
    """Faixas ativas do grupo vinculado ao evento."""
    grupo = evento.get_grupo_categorias()
    if not grupo:
        garantir_grupo_padrao()
        grupo = get_grupo_padrao()
    return CategoriaParticipante.objects.filter(grupo=grupo, ativo=True).order_by('ordem', 'nome')


def calcular_valor_titular(evento):
    """Titular sempre paga valor integral do evento (faixa só classifica Adulto/Adolescente)."""
    if not evento.evento_pago or not evento.valor_inscricao:
        return 0
    return float(evento.valor_inscricao)


def calcular_valor_inscricao_categoria(categoria, evento):
    if not evento.evento_pago or not evento.valor_inscricao:
        return 0
    if categoria:
        return categoria.calcular_valor(evento.valor_inscricao)
    return float(evento.valor_inscricao)


def get_categoria_do_grupo_evento(evento, nome_faixa):
    grupo = evento.get_grupo_categorias()
    if not grupo:
        garantir_grupo_padrao()
        grupo = get_grupo_padrao()
    return _faixa_do_grupo(grupo, nome_faixa)


def resolver_categoria_titular(evento, categoria_id=None):
    """
    Faixa do titular na inscrição (classificação; cobrança sempre valor integral).
    Padrão (flag desligada): sempre Adulto.
    Com inscrição adolescente: Adulto ou Adolescente do grupo do evento (padrão: Adolescente).
    """
    adulto = get_categoria_do_grupo_evento(evento, 'Adulto') or get_categoria_adulto_padrao()

    if not getattr(evento, 'permite_inscricao_adolescente', False):
        return adulto

    if categoria_id:
        cat = validar_categoria_no_evento(categoria_id, evento)
        if cat and cat.nome in ('Adulto', 'Adolescente'):
            return cat
        return None

    adolescente = get_categoria_do_grupo_evento(evento, 'Adolescente')
    return adolescente or adulto


def validar_categoria_no_evento(categoria_id, evento):
    """Retorna a categoria se pertence ao grupo do evento; senão None."""
    if not categoria_id:
        return None
    try:
        cat = CategoriaParticipante.objects.get(pk=categoria_id, ativo=True)
    except CategoriaParticipante.DoesNotExist:
        return None
    grupo = evento.get_grupo_categorias()
    if grupo and cat.grupo_id != grupo.id:
        return None
    return cat
