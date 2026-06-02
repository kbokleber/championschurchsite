import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../../services/api';
import ConfirmModal from '../../components/ConfirmModal';
import { 
  DollarSign, 
  Check, 
  X, 
  Clock, 
  Filter,
  RefreshCw,
  CreditCard,
  Gift,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Users
} from 'lucide-react';

const PAGE_SIZE = 10;

function AdminCobrancas() {
  const [searchParams] = useSearchParams();
  const [cobrancas, setCobrancas] = useState([]);
  const [eventos, setEventos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroEvento, setFiltroEvento] = useState(searchParams.get('evento') || '');
  const [filtroStatus, setFiltroStatus] = useState('');
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [expandido, setExpandido] = useState({});
  const [totais, setTotais] = useState({ pendente: 0, pago: 0, isento: 0, cancelado: 0, total: 0 });
  const [processando, setProcessando] = useState(null);
  const [processandoItem, setProcessandoItem] = useState(null); // 'cobrancaId-itemId'

  // Modal: cobrança inteira ou por item. item = null => ação na cobrança; item preenchido => ação no participante
  const [modalConfig, setModalConfig] = useState({
    isOpen: false,
    action: null,
    cobranca: null,
    item: null,
  });
  const [motivoCancelamento, setMotivoCancelamento] = useState('');

  useEffect(() => {
    setPage(1);
  }, [filtroEvento, filtroStatus]);

  useEffect(() => {
    carregarDados();
  }, [filtroEvento, filtroStatus, page]);

  const carregarDados = async () => {
    try {
      setLoading(true);
      
      // Carregar eventos para o filtro (apenas na primeira vez ou quando filtros mudam)
      const eventosRes = await api.get('/eventos/', { params: { incluir_particulares: 'true' } });
      setEventos(eventosRes.data.results || eventosRes.data);
      
      // Carregar cobranças com paginação (backend usa PAGE_SIZE=10)
      const params = { page };
      if (filtroEvento) params.evento = filtroEvento;
      if (filtroStatus) params.status = filtroStatus;
      
      const cobrancasRes = await api.get('/cobrancas/', { params });
      const data = cobrancasRes.data;
      const lista = data.results ?? data;
      setCobrancas(Array.isArray(lista) ? lista : []);
      setTotalCount(typeof data.count === 'number' ? data.count : lista.length);
      
      // Calcular totais por status (da página atual)
      let pendente = 0, pago = 0, isento = 0, cancelado = 0;
      for (const c of (lista || [])) {
        const itens = c.itens || [];
        for (const item of itens) {
          const valor = parseFloat(item.valor) || 0;
          const status = (item.status_inscricao || 'pendente').toLowerCase();
          if (status === 'pendente') pendente += valor;
          else if (status === 'pago') pago += valor;
          else if (status === 'isento') isento += valor;
          else if (status === 'cancelado') cancelado += valor;
        }
      }
      setTotais({
        pendente,
        pago,
        isento,
        cancelado,
        total: pendente + pago + isento
      });
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      setCobrancas([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  };

  const fecharModal = () => {
    setMotivoCancelamento('');
    setModalConfig({ isOpen: false, action: null, cobranca: null, item: null });
  };

  const confirmarPagamento = (cobranca, item = null) => {
    setModalConfig({
      isOpen: true,
      action: 'confirmar',
      cobranca,
      item: item || null,
    });
  };

  const isentarCobranca = (cobranca, item = null) => {
    setModalConfig({
      isOpen: true,
      action: 'isentar',
      cobranca,
      item: item || null,
    });
  };

  const cancelarCobranca = (cobranca, item = null) => {
    setMotivoCancelamento('');
    setModalConfig({
      isOpen: true,
      action: 'cancelar',
      cobranca,
      item: item || null,
    });
  };

  const executarAcaoConfirmada = async () => {
    if (!modalConfig.cobranca) return;
    const cobrancaId = modalConfig.cobranca.id;
    const item = modalConfig.item;
    const chaveProcessando = item ? `${cobrancaId}-${item.id}` : cobrancaId;
    const motivo = motivoCancelamento.trim();

    if (modalConfig.action === 'cancelar' && !motivo) return;

    try {
      if (item) setProcessandoItem(chaveProcessando);
      else setProcessando(cobrancaId);

      if (item) {
        if (modalConfig.action === 'confirmar') {
          await api.post(`/cobrancas/${cobrancaId}/itens/${item.id}/confirmar/`);
        } else if (modalConfig.action === 'isentar') {
          await api.post(`/cobrancas/${cobrancaId}/itens/${item.id}/isentar/`);
        } else if (modalConfig.action === 'cancelar') {
          await api.post(`/cobrancas/${cobrancaId}/itens/${item.id}/cancelar/`, { motivo });
        }
      } else {
        if (modalConfig.action === 'confirmar') {
          await api.post(`/cobrancas/${cobrancaId}/confirmar_pagamento/`, { metodo_pagamento: 'Manual' });
        } else if (modalConfig.action === 'isentar') {
          await api.post(`/cobrancas/${cobrancaId}/isentar/`);
        } else if (modalConfig.action === 'cancelar') {
          await api.post(`/cobrancas/${cobrancaId}/cancelar/`, { motivo });
        }
      }
      fecharModal();
      carregarDados();
    } catch (error) {
      console.error('Erro na ação:', error);
      const msg = error?.response?.data?.error
        || (modalConfig.action === 'confirmar' ? 'Erro ao confirmar pagamento' : modalConfig.action === 'isentar' ? 'Erro ao isentar' : 'Erro ao cancelar');
      alert(msg);
    } finally {
      if (item) setProcessandoItem(null);
      else setProcessando(null);
    }
  };

  const getModalConfig = () => {
    const c = modalConfig.cobranca;
    const item = modalConfig.item;
    if (!c) return { title: '', message: '', type: 'confirm', confirmText: '' };
    const valor = item ? formatarValor(item.valor) : formatarValor(c.valor);
    const nomeAlvo = item ? item.membro_nome : c.membro_nome;

    if (modalConfig.action === 'confirmar') {
      return {
        title: item ? 'Confirmar pagamento do participante' : 'Confirmar Pagamento',
        message: item
          ? `Confirmar pagamento de ${valor} de ${nomeAlvo} (${c.evento_titulo})?`
          : `Deseja confirmar o pagamento de ${valor} da cobrança de ${c.membro_nome} (${c.evento_titulo})?`,
        type: 'success',
        confirmText: 'Confirmar Pagamento',
      };
    }
    if (modalConfig.action === 'isentar') {
      return {
        title: item ? 'Isentar participante' : 'Isentar Cobrança',
        message: item
          ? `Isentar ${nomeAlvo} (${valor})? Nenhum valor será cobrado para este participante.`
          : `Deseja isentar a cobrança de ${valor} de ${c.membro_nome}? Nenhum valor será cobrado.`,
        type: 'info',
        confirmText: 'Isentar',
      };
    }
    if (modalConfig.action === 'cancelar') {
      return {
        title: item ? 'Cancelar participante' : 'Cancelar Cobrança',
        message: item
          ? `Cancelar a inscrição de ${nomeAlvo} nesta cobrança?`
          : `Deseja cancelar esta cobrança? As inscrições vinculadas serão canceladas. (${c.membro_nome} - ${c.evento_titulo})`,
        type: 'danger',
        confirmText: 'Cancelar',
      };
    }
    return { title: '', message: '', type: 'confirm', confirmText: '' };
  };

  const toggleExpandir = (id) => {
    setExpandido(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const getStatusBadge = (status) => {
    const badges = {
      pendente: { bg: 'bg-yellow-100', text: 'text-yellow-800', icon: Clock, label: 'Pendente' },
      pago: { bg: 'bg-green-100', text: 'text-green-800', icon: Check, label: 'Pago' },
      isento: { bg: 'bg-blue-100', text: 'text-blue-800', icon: Gift, label: 'Isento' },
      cancelado: { bg: 'bg-red-100', text: 'text-red-800', icon: X, label: 'Cancelado' },
      reembolsado: { bg: 'bg-purple-100', text: 'text-purple-800', icon: RefreshCw, label: 'Reembolsado' }
    };
    const badge = badges[status] || badges.pendente;
    const Icon = badge.icon;
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${badge.bg} ${badge.text}`}>
        <Icon className="w-3 h-3 mr-1" />
        {badge.label}
      </span>
    );
  };

  const formatarValor = (valor) => {
    return `R$ ${parseFloat(valor).toFixed(2).replace('.', ',')}`;
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const startItem = totalCount === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const endItem = Math.min(page * PAGE_SIZE, totalCount);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cobranças</h1>
          <p className="text-gray-500">Gerencie os pagamentos de inscrições</p>
        </div>
        <button
          onClick={carregarDados}
          className="btn btn-secondary flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          Atualizar
        </button>
      </div>

      {/* Cards de Totais */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-yellow-600 text-sm font-medium">Pendente</p>
              <p className="text-2xl font-bold text-yellow-800">{formatarValor(totais.pendente)}</p>
            </div>
            <Clock className="w-10 h-10 text-yellow-500" />
          </div>
        </div>
        <div className="bg-green-50 rounded-lg p-4 border border-green-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-green-600 text-sm font-medium">Pago</p>
              <p className="text-2xl font-bold text-green-800">{formatarValor(totais.pago)}</p>
            </div>
            <Check className="w-10 h-10 text-green-500" />
          </div>
        </div>
        <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-600 text-sm font-medium">Isento</p>
              <p className="text-2xl font-bold text-blue-800">{formatarValor(totais.isento)}</p>
            </div>
            <Gift className="w-10 h-10 text-blue-500" />
          </div>
        </div>
        <div className="bg-red-50 rounded-lg p-4 border border-red-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-red-600 text-sm font-medium">Cancelado</p>
              <p className="text-2xl font-bold text-red-800">{formatarValor(totais.cancelado)}</p>
            </div>
            <X className="w-10 h-10 text-red-500" />
          </div>
        </div>
        <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm font-medium">Total</p>
              <p className="text-2xl font-bold text-gray-800">{formatarValor(totais.total)}</p>
            </div>
            <DollarSign className="w-10 h-10 text-gray-500" />
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-gray-400" />
            <span className="font-medium text-gray-700">Filtros:</span>
          </div>
          <select
            value={filtroEvento}
            onChange={(e) => setFiltroEvento(e.target.value)}
            className="input py-2"
          >
            <option value="">Todos os eventos</option>
            {eventos.map(evento => (
              <option key={evento.id} value={evento.id}>{evento.titulo}</option>
            ))}
          </select>
          <select
            value={filtroStatus}
            onChange={(e) => setFiltroStatus(e.target.value)}
            className="input py-2"
          >
            <option value="">Todos os status</option>
            <option value="pendente">Pendente</option>
            <option value="pago">Pago</option>
            <option value="isento">Isento</option>
            <option value="cancelado">Cancelado</option>
          </select>
        </div>
      </div>

      {/* Lista de Cobranças */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {cobrancas.length === 0 ? (
          <div className="p-8 text-center">
            <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500">Nenhuma cobrança encontrada</p>
          </div>
        ) : (
          <>
          <div className="divide-y divide-gray-200">
            {cobrancas.map(cobranca => (
              <div key={cobranca.id} className="hover:bg-gray-50">
                {/* Linha Principal */}
                <div className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <button
                        onClick={() => toggleExpandir(cobranca.id)}
                        className="p-1 hover:bg-gray-200 rounded"
                      >
                        {expandido[cobranca.id] ? (
                          <ChevronUp className="w-5 h-5 text-gray-500" />
                        ) : (
                          <ChevronDown className="w-5 h-5 text-gray-500" />
                        )}
                      </button>
                      <div>
                        <h3 className="font-semibold text-gray-900">{cobranca.membro_nome}</h3>
                        <p className="text-sm text-gray-500">{cobranca.evento_titulo}</p>
                        <p className="text-xs text-gray-400">{cobranca.membro_telefone}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="font-bold text-lg">{formatarValor(cobranca.valor)}</p>
                        <div className="flex items-center gap-1 text-xs text-gray-500">
                          <Users className="w-3 h-3" />
                          {cobranca.itens?.length || 0} pessoa(s)
                        </div>
                      </div>
                      {getStatusBadge(cobranca.status)}
                    </div>
                  </div>
                  
                  {/* Botões de Ação */}
                  {cobranca.status === 'pendente' && (
                    <div className="mt-3 flex flex-wrap gap-2 justify-end">
                      <button
                        onClick={() => confirmarPagamento(cobranca)}
                        disabled={processando === cobranca.id}
                        className="btn btn-sm bg-green-600 hover:bg-green-700 text-white flex items-center gap-1"
                      >
                        <CreditCard className="w-4 h-4" />
                        Confirmar Pagamento
                      </button>
                      <button
                        onClick={() => isentarCobranca(cobranca)}
                        disabled={processando === cobranca.id}
                        className="btn btn-sm bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1"
                      >
                        <Gift className="w-4 h-4" />
                        Isentar
                      </button>
                      <button
                        onClick={() => cancelarCobranca(cobranca)}
                        disabled={processando === cobranca.id}
                        className="btn btn-sm bg-red-600 hover:bg-red-700 text-white flex items-center gap-1"
                      >
                        <X className="w-4 h-4" />
                        Cancelar
                      </button>
                    </div>
                  )}
                </div>
                
                {/* Detalhes Expandidos */}
                {expandido[cobranca.id] && (
                  <div className="bg-gray-50 px-4 pb-4">
                    <div className="pl-10">
                      <h4 className="text-sm font-medium text-gray-700 mb-2">Itens da Cobrança (ações por participante):</h4>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-gray-500">
                            <th className="pb-2">Participante</th>
                            <th className="pb-2">Categoria</th>
                            <th className="pb-2 text-right">Valor</th>
                            <th className="pb-2">Status</th>
                            {cobranca.status === 'pendente' && (
                              <th className="pb-2 text-right">Ações</th>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {cobranca.itens?.map(item => (
                            <tr key={item.id} className="border-t border-gray-200">
                              <td className="py-2">{item.membro_nome}</td>
                              <td className="py-2">{item.categoria || 'Adulto'}</td>
                              <td className="py-2 text-right">{formatarValor(item.valor)}</td>
                              <td className="py-2">{getStatusBadge(item.status_inscricao || 'pendente')}</td>
                              {cobranca.status === 'pendente' && (
                                <td className="py-2 text-right">
                                  {(item.status_inscricao === 'pendente' || !item.status_inscricao) ? (
                                    <div className="flex flex-wrap gap-1 justify-end">
                                      <button
                                        type="button"
                                        onClick={() => confirmarPagamento(cobranca, item)}
                                        disabled={processandoItem === `${cobranca.id}-${item.id}`}
                                        className="text-xs px-2 py-1 bg-green-600 hover:bg-green-700 text-white rounded flex items-center gap-0.5 disabled:opacity-50"
                                        title="Confirmar pagamento deste participante"
                                      >
                                        <Check className="w-3 h-3" />
                                        Confirmar
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => isentarCobranca(cobranca, item)}
                                        disabled={processandoItem === `${cobranca.id}-${item.id}`}
                                        className="text-xs px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded flex items-center gap-0.5 disabled:opacity-50"
                                        title="Isentar este participante"
                                      >
                                        <Gift className="w-3 h-3" />
                                        Isentar
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => cancelarCobranca(cobranca, item)}
                                        disabled={processandoItem === `${cobranca.id}-${item.id}`}
                                        className="text-xs px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded flex items-center gap-0.5 disabled:opacity-50"
                                        title="Cancelar inscrição deste participante"
                                      >
                                        <X className="w-3 h-3" />
                                        Cancelar
                                      </button>
                                    </div>
                                  ) : (
                                    <span className="text-gray-400 text-xs">—</span>
                                  )}
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 border-gray-300 font-semibold">
                            <td colSpan={2} className="py-2">Total</td>
                            <td className="py-2 text-right">{formatarValor(cobranca.valor)}</td>
                            <td />
                            {cobranca.status === 'pendente' && <td />}
                          </tr>
                        </tfoot>
                      </table>
                      
                      {/* Informações adicionais */}
                      <div className="mt-3 text-xs text-gray-500 space-y-1">
                        <p>Código: {cobranca.codigo}</p>
                        <p>Criada em: {cobranca.data_criacao_formatada}</p>
                        {cobranca.data_pagamento_formatada && (
                          <p>Pago em: {cobranca.data_pagamento_formatada}</p>
                        )}
                        {cobranca.metodo_pagamento && (
                          <p>Método: {cobranca.metodo_pagamento}</p>
                        )}
                        {cobranca.referencia_externa && (
                          <p>Referência: {cobranca.referencia_externa}</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
          {/* Paginação */}
          {totalCount > PAGE_SIZE && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-6 py-4 border-t bg-gray-50">
              <p className="text-sm text-gray-600">
                Mostrando <span className="font-medium">{startItem}</span>-<span className="font-medium">{endItem}</span> de <span className="font-medium">{totalCount}</span> cobranças
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="p-2 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Página anterior"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <span className="text-sm text-gray-600 px-2">
                  Página {page} de {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="p-2 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Próxima página"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
            </div>
          )}
          </>
        )}
      </div>

      {/* Modal de Confirmação */}
      <ConfirmModal
        isOpen={modalConfig.isOpen}
        onClose={fecharModal}
        onConfirm={executarAcaoConfirmada}
        title={getModalConfig().title}
        message={getModalConfig().message}
        type={getModalConfig().type}
        confirmText={getModalConfig().confirmText}
        cancelText="Voltar"
        loading={modalConfig.item ? processandoItem === `${modalConfig.cobranca?.id}-${modalConfig.item?.id}` : processando === modalConfig.cobranca?.id}
        confirmDisabled={modalConfig.action === 'cancelar' && !motivoCancelamento.trim()}
      >
        {modalConfig.action === 'cancelar' && (
          <div className="mt-4 text-left">
            <label htmlFor="motivo-cancelamento-cobranca" className="block text-sm font-medium text-gray-700 mb-1">
              Motivo do cancelamento <span className="text-red-600">*</span>
            </label>
            <textarea
              id="motivo-cancelamento-cobranca"
              value={motivoCancelamento}
              onChange={(e) => setMotivoCancelamento(e.target.value)}
              rows={3}
              maxLength={300}
              placeholder="Descreva o motivo do cancelamento..."
              className="input-field w-full resize-none"
            />
          </div>
        )}
        {modalConfig.cobranca && (
          <div className="bg-gray-50 rounded-lg p-4 text-left">
            <div className="space-y-2 text-sm">
              {modalConfig.item ? (
                <>
                  <p><span className="text-gray-500">Participante:</span> <span className="font-medium text-gray-800">{modalConfig.item.membro_nome}</span></p>
                  <p><span className="text-gray-500">Valor deste item:</span> <span className="font-bold text-gray-900">{formatarValor(modalConfig.item.valor)}</span></p>
                  <p><span className="text-gray-500">Evento:</span> <span className="text-gray-800">{modalConfig.cobranca.evento_titulo}</span></p>
                </>
              ) : (
                <>
                  <p><span className="text-gray-500">Membro:</span> <span className="font-medium text-gray-800">{modalConfig.cobranca.membro_nome}</span></p>
                  <p><span className="text-gray-500">Evento:</span> <span className="text-gray-800">{modalConfig.cobranca.evento_titulo}</span></p>
                  <p><span className="text-gray-500">Valor:</span> <span className="font-bold text-gray-900">{formatarValor(modalConfig.cobranca.valor)}</span></p>
                  <p><span className="text-gray-500">Pessoas:</span> <span className="text-gray-800">{modalConfig.cobranca.itens?.length || 0}</span></p>
                </>
              )}
            </div>
          </div>
        )}
      </ConfirmModal>
    </div>
  );
}

export default AdminCobrancas;
