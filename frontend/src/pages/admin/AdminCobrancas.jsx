import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../../services/api';
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
  Users
} from 'lucide-react';

function AdminCobrancas() {
  const [searchParams] = useSearchParams();
  const [cobrancas, setCobrancas] = useState([]);
  const [eventos, setEventos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroEvento, setFiltroEvento] = useState(searchParams.get('evento') || '');
  const [filtroStatus, setFiltroStatus] = useState('');
  const [expandido, setExpandido] = useState({});
  const [totais, setTotais] = useState({ pendente: 0, pago: 0, isento: 0, total: 0 });
  const [processando, setProcessando] = useState(null);

  useEffect(() => {
    carregarDados();
  }, [filtroEvento, filtroStatus]);

  const carregarDados = async () => {
    try {
      setLoading(true);
      
      // Carregar eventos para o filtro
      const eventosRes = await api.get('/eventos/');
      setEventos(eventosRes.data.results || eventosRes.data);
      
      // Carregar cobranças
      let url = '/cobrancas/';
      const params = [];
      if (filtroEvento) params.push(`evento=${filtroEvento}`);
      if (filtroStatus) params.push(`status=${filtroStatus}`);
      if (params.length > 0) url += '?' + params.join('&');
      
      const cobrancasRes = await api.get(url);
      setCobrancas(cobrancasRes.data.results || cobrancasRes.data);
      
      // Calcular totais
      const dados = cobrancasRes.data.results || cobrancasRes.data;
      const totaisCal = {
        pendente: dados.filter(c => c.status === 'pendente').reduce((acc, c) => acc + parseFloat(c.valor), 0),
        pago: dados.filter(c => c.status === 'pago').reduce((acc, c) => acc + parseFloat(c.valor), 0),
        isento: dados.filter(c => c.status === 'isento').reduce((acc, c) => acc + parseFloat(c.valor), 0),
        total: dados.reduce((acc, c) => acc + parseFloat(c.valor), 0)
      };
      setTotais(totaisCal);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setLoading(false);
    }
  };

  const confirmarPagamento = async (cobrancaId) => {
    if (!window.confirm('Confirmar pagamento desta cobrança?')) return;
    
    try {
      setProcessando(cobrancaId);
      await api.post(`/cobrancas/${cobrancaId}/confirmar_pagamento/`, {
        metodo_pagamento: 'Manual'
      });
      carregarDados();
    } catch (error) {
      console.error('Erro ao confirmar pagamento:', error);
      alert('Erro ao confirmar pagamento');
    } finally {
      setProcessando(null);
    }
  };

  const isentarCobranca = async (cobrancaId) => {
    if (!window.confirm('Isentar esta cobrança? Não será cobrado nenhum valor.')) return;
    
    try {
      setProcessando(cobrancaId);
      await api.post(`/cobrancas/${cobrancaId}/isentar/`);
      carregarDados();
    } catch (error) {
      console.error('Erro ao isentar:', error);
      alert('Erro ao isentar cobrança');
    } finally {
      setProcessando(null);
    }
  };

  const cancelarCobranca = async (cobrancaId) => {
    if (!window.confirm('Cancelar esta cobrança? As inscrições serão canceladas.')) return;
    
    try {
      setProcessando(cobrancaId);
      await api.post(`/cobrancas/${cobrancaId}/cancelar/`);
      carregarDados();
    } catch (error) {
      console.error('Erro ao cancelar:', error);
      alert('Erro ao cancelar cobrança');
    } finally {
      setProcessando(null);
    }
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
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
        <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
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
                    <div className="mt-3 flex gap-2 justify-end">
                      <button
                        onClick={() => confirmarPagamento(cobranca.id)}
                        disabled={processando === cobranca.id}
                        className="btn btn-sm bg-green-600 hover:bg-green-700 text-white flex items-center gap-1"
                      >
                        <CreditCard className="w-4 h-4" />
                        Confirmar Pagamento
                      </button>
                      <button
                        onClick={() => isentarCobranca(cobranca.id)}
                        disabled={processando === cobranca.id}
                        className="btn btn-sm bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1"
                      >
                        <Gift className="w-4 h-4" />
                        Isentar
                      </button>
                      <button
                        onClick={() => cancelarCobranca(cobranca.id)}
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
                      <h4 className="text-sm font-medium text-gray-700 mb-2">Itens da Cobrança:</h4>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-gray-500">
                            <th className="pb-2">Participante</th>
                            <th className="pb-2">Categoria</th>
                            <th className="pb-2 text-right">Valor</th>
                          </tr>
                        </thead>
                        <tbody>
                          {cobranca.itens?.map(item => (
                            <tr key={item.id} className="border-t border-gray-200">
                              <td className="py-2">{item.membro_nome}</td>
                              <td className="py-2">{item.categoria || 'Adulto'}</td>
                              <td className="py-2 text-right">{formatarValor(item.valor)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 border-gray-300 font-semibold">
                            <td colSpan="2" className="py-2">Total</td>
                            <td className="py-2 text-right">{formatarValor(cobranca.valor)}</td>
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
        )}
      </div>
    </div>
  );
}

export default AdminCobrancas;
