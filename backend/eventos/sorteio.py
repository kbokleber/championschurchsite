"""Lógica de sorteio ao vivo por evento."""

import secrets
from calendar import monthrange
from datetime import datetime, time

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from .models import Inscricao, Sorteio, SorteioElegivel, SorteioGanhador

STATUS_PAGAMENTO_ELEGIVEL = ('pago', 'isento', 'nao_aplicavel')


def _parse_ymd(value):
    if not value:
        return None
    try:
        return datetime.strptime(str(value).strip(), '%Y-%m-%d').date()
    except (ValueError, TypeError):
        return None


def intervalo_filtro_periodo(periodo=None, data_inicio=None, data_fim=None):
    """
    Converte periodo (hoje|mes|personalizado) em intervalo datetime aware.
    Retorna (None, None) se não houver filtro aplicável.
    """
    periodo_norm = (periodo or '').strip().lower()
    di = _parse_ymd(data_inicio)
    df = _parse_ymd(data_fim)

    if periodo_norm == 'hoje':
        hoje = timezone.localdate()
        di, df = hoje, hoje
    elif periodo_norm == 'mes':
        hoje = timezone.localdate()
        di = hoje.replace(day=1)
        df = hoje.replace(day=monthrange(hoje.year, hoje.month)[1])
    elif periodo_norm == 'personalizado':
        if not di and not df:
            return None, None
    elif periodo_norm:
        return None, None
    elif not di and not df:
        return None, None

    if di and not df:
        df = di
    if df and not di:
        di = df

    inicio = timezone.make_aware(datetime.combine(di, time.min))
    fim = timezone.make_aware(datetime.combine(df, time.max))
    return inicio, fim


def intervalo_filtro_request(request):
    return intervalo_filtro_periodo(
        request.query_params.get('periodo'),
        request.query_params.get('data_inicio'),
        request.query_params.get('data_fim'),
    )


def aplicar_filtro_periodo(queryset, request, campo='data_inicio'):
    """Filtra queryset por data_inicio do evento (ou outro campo datetime)."""
    inicio, fim = intervalo_filtro_request(request)
    if inicio:
        queryset = queryset.filter(**{f'{campo}__gte': inicio})
    if fim:
        queryset = queryset.filter(**{f'{campo}__lte': fim})
    return queryset


def mascarar_telefone(telefone):
    """Mascara telefone para exibição admin."""
    if not telefone:
        return ''
    digits = ''.join(c for c in str(telefone) if c.isdigit())
    if len(digits) == 11:
        return f'({digits[:2]}) {digits[2:3]}****-{digits[7:]}'
    if len(digits) == 10:
        return f'({digits[:2]}) ****-{digits[6:]}'
    if len(digits) >= 4:
        return f'****-{digits[-4:]}'
    return '****'


def inscricoes_elegiveis_queryset(evento):
    """Inscrições confirmadas com pagamento válido para o pool inicial."""
    return (
        Inscricao.objects.filter(
            evento=evento,
            status='confirmada',
            status_pagamento__in=STATUS_PAGAMENTO_ELEGIVEL,
        )
        .select_related('membro', 'categoria', 'responsavel')
        .order_by('membro__nome')
    )


def popular_elegiveis(sorteio):
    """
    Sincroniza elegíveis com inscrições confirmadas do evento.
    Novas inscrições entram com participa=True; existentes mantêm participa/observacao.
    """
    inscricoes = inscricoes_elegiveis_queryset(sorteio.evento)
    existentes = {
        e.inscricao_id: e
        for e in SorteioElegivel.objects.filter(sorteio=sorteio).select_related('inscricao')
    }
    ids_atuais = set()
    criados = 0
    for inscricao in inscricoes:
        ids_atuais.add(inscricao.id)
        if inscricao.id not in existentes:
            SorteioElegivel.objects.create(
                sorteio=sorteio,
                inscricao=inscricao,
                participa=True,
            )
            criados += 1
    # Remove elegíveis de inscrições que deixaram de ser confirmadas
    SorteioElegivel.objects.filter(sorteio=sorteio).exclude(inscricao_id__in=ids_atuais).delete()
    return criados


def normalizar_premio(premio):
    return (premio or '').strip().casefold()


def inscricao_ids_ganhadores_premio_evento(evento_id, premio):
    """Inscrições já sorteadas para este prêmio (normalizado) em qualquer sessão do evento."""
    premio_norm = normalizar_premio(premio)
    bloqueados = set()
    ganhadores = SorteioGanhador.objects.filter(
        sorteio__evento_id=evento_id,
    ).values_list('inscricao_id', 'premio')
    for inscricao_id, premio_ganho in ganhadores:
        if normalizar_premio(premio_ganho) == premio_norm:
            bloqueados.add(inscricao_id)
    return bloqueados


def queryset_pool_sorteio(sorteio, premio=None):
    """Elegíveis que podem ser sorteados para o prêmio informado."""
    premio_ref = premio if premio is not None else ''
    bloqueados = inscricao_ids_ganhadores_premio_evento(sorteio.evento_id, premio_ref)
    return (
        SorteioElegivel.objects.filter(sorteio=sorteio, participa=True)
        .exclude(inscricao_id__in=bloqueados)
        .select_related('inscricao__membro', 'inscricao__categoria', 'inscricao__responsavel')
    )


def serializar_elegivel(elegivel, premio=None, evento_id=None):
    """Dict para API de curadoria."""
    ins = elegivel.inscricao
    membro = ins.membro
    data = {
        'id': elegivel.id,
        'inscricao_id': ins.id,
        'participa': elegivel.participa,
        'observacao': elegivel.observacao or '',
        'membro_nome': membro.nome,
        'membro_telefone_mascarado': mascarar_telefone(membro.telefone),
        'categoria_nome': ins.categoria.nome if ins.categoria else '',
        'is_acompanhante': ins.is_acompanhante,
        'presente': ins.presente,
        'responsavel_nome': ins.responsavel.nome if ins.responsavel else '',
    }
    if evento_id is not None and premio is not None:
        bloqueados = inscricao_ids_ganhadores_premio_evento(evento_id, premio)
        ja_ganhou = ins.id in bloqueados
        data['elegivel_para_premio'] = elegivel.participa and not ja_ganhou
        data['ja_ganhou_premio_evento'] = ja_ganhou
        if ja_ganhou:
            label = (premio or '').strip() or 'este prêmio'
            data['motivo_bloqueio'] = f'Já ganhou "{label}" neste evento.'
    return data


def listar_elegiveis(sorteio, participa=None, presente=None, acompanhante=None, q=None, premio=None):
    """Lista elegíveis com filtros opcionais."""
    qs = (
        SorteioElegivel.objects.filter(sorteio=sorteio)
        .select_related('inscricao__membro', 'inscricao__categoria', 'inscricao__responsavel')
    )
    if participa is not None:
        qs = qs.filter(participa=participa)
    if presente is not None:
        qs = qs.filter(inscricao__presente=presente)
    if acompanhante is not None:
        qs = qs.filter(inscricao__is_acompanhante=acompanhante)
    if q:
        termo = q.strip()
        if termo:
            qs = qs.filter(
                Q(inscricao__membro__nome__icontains=termo)
                | Q(inscricao__membro__telefone__icontains=termo)
            )
    premio_ctx = premio if premio is not None else None
    evento_id = sorteio.evento_id if premio_ctx is not None else None
    return [serializar_elegivel(e, premio=premio_ctx, evento_id=evento_id) for e in qs]


def contar_ganhadores_confirmados(sorteio):
    """Prêmios efetivamente sorteados (status confirmado)."""
    return SorteioGanhador.objects.filter(sorteio=sorteio, status='confirmado').count()


def contar_rodadas_sorteio(sorteio):
    """Total de vezes que o sorteio foi executado (inclui ausentes)."""
    return SorteioGanhador.objects.filter(sorteio=sorteio).count()


def contar_elegiveis(sorteio):
    """Total com participa=True (independente de já ter ganho)."""
    return SorteioElegivel.objects.filter(sorteio=sorteio, participa=True).count()


def q_inscricao_e_acompanhante(prefix='inscricao'):
    """Inscrição de acompanhante (campo da inscrição, membro ou responsável)."""
    return (
        Q(**{f'{prefix}__is_acompanhante': True})
        | Q(**{f'{prefix}__membro__is_acompanhante': True})
        | Q(**{f'{prefix}__responsavel_id__isnull': False})
    )


def q_inscricao_titular_presente(prefix='inscricao'):
    """Titular (não acompanhante) com check-in confirmado."""
    return Q(**{f'{prefix}__presente': True}) & ~q_inscricao_e_acompanhante(prefix=prefix)


def aplicar_filtros_curadoria(sorteio, presentes=False, acompanhantes=False):
    """Marca participa conforme filtros combináveis de curadoria."""
    SorteioElegivel.objects.filter(sorteio=sorteio).update(participa=False)
    if not presentes and not acompanhantes:
        return
    filtro = Q()
    if presentes:
        filtro |= q_inscricao_titular_presente()
    if acompanhantes:
        filtro |= q_inscricao_e_acompanhante()
    SorteioElegivel.objects.filter(sorteio=sorteio).filter(filtro).update(participa=True)


def contar_pool_sorteio(sorteio, premio=None):
    """Participantes que ainda podem ser sorteados para o prêmio informado."""
    return queryset_pool_sorteio(sorteio, premio=premio).count()


def serializar_ganhador(ganhador):
    ins = ganhador.inscricao
    sorteado_por = ganhador.sorteado_por
    marcado_por = ganhador.marcado_ausente_por
    return {
        'id': ganhador.id,
        'rodada': ganhador.rodada,
        'premio': ganhador.premio or '',
        'status': ganhador.status,
        'status_display': ganhador.get_status_display(),
        'sorteado_em': timezone.localtime(ganhador.sorteado_em).strftime('%d/%m/%Y %H:%M:%S'),
        'marcado_ausente_em': (
            timezone.localtime(ganhador.marcado_ausente_em).strftime('%d/%m/%Y %H:%M:%S')
            if ganhador.marcado_ausente_em
            else ''
        ),
        'marcado_ausente_por_nome': (
            (marcado_por.get_full_name() or marcado_por.username) if marcado_por else ''
        ),
        'sorteado_por_nome': (
            (sorteado_por.get_full_name() or sorteado_por.username) if sorteado_por else ''
        ),
        'inscricao_id': ins.id,
        'membro_nome': ins.membro.nome,
        'membro_telefone_mascarado': mascarar_telefone(ins.membro.telefone),
        'categoria_nome': ins.categoria.nome if ins.categoria else '',
        'is_acompanhante': ins.is_acompanhante,
        'presente': ins.presente,
        'responsavel_nome': ins.responsavel.nome if ins.responsavel else '',
    }


def atualizar_ausencia_ganhador(ganhador, usuario, ausente=True):
    """Marca ganhador como ausente (não compareceu) ou restaura confirmação."""
    if ausente:
        ganhador.status = 'ausente'
        ganhador.marcado_ausente_em = timezone.now()
        ganhador.marcado_ausente_por = usuario
    else:
        ganhador.status = 'confirmado'
        ganhador.marcado_ausente_em = None
        ganhador.marcado_ausente_por = None
    ganhador.save(
        update_fields=['status', 'marcado_ausente_em', 'marcado_ausente_por'],
    )
    return ganhador


@transaction.atomic
def executar_sorteio(sorteio, usuario, premio=None):
    """
    Sorteia um ganhador entre elegíveis com participa=True que ainda não ganharam.
    Usa lock no registro Sorteio para evitar sorteios concorrentes.
    """
    sorteio = Sorteio.objects.select_for_update().get(pk=sorteio.pk)

    if sorteio.status == 'encerrado':
        raise ValueError('Este sorteio já foi encerrado.')

    premio_ref = (premio or '').strip()
    if not premio_ref:
        raise ValueError('Informe o nome do prêmio para sortear.')

    pool = list(queryset_pool_sorteio(sorteio, premio=premio_ref))

    if not pool:
        label = premio_ref
        raise ValueError(
            f'Nenhum participante elegível para "{label}". '
            'Quem já ganhou o mesmo prêmio neste evento não pode participar novamente.'
        )

    elegivel = secrets.SystemRandom().choice(pool)
    ultima_rodada = (
        SorteioGanhador.objects.filter(sorteio=sorteio).order_by('-rodada').values_list('rodada', flat=True).first()
    )
    rodada = (ultima_rodada or 0) + 1

    if sorteio.status == 'rascunho':
        sorteio.status = 'em_andamento'
        sorteio.save(update_fields=['status'])

    ganhador = SorteioGanhador.objects.create(
        sorteio=sorteio,
        inscricao=elegivel.inscricao,
        rodada=rodada,
        premio=(premio_ref),
        sorteado_por=usuario,
    )
    return ganhador


def encerrar_sorteio(sorteio):
    sorteio.status = 'encerrado'
    sorteio.encerrado_em = timezone.now()
    sorteio.save(update_fields=['status', 'encerrado_em'])
