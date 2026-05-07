import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import { useParticipante } from '../contexts/ParticipanteContext';
import { 
  ExternalLink, 
  Check, 
  Clock, 
  AlertCircle, 
  CheckCircle,
  RefreshCw,
  ArrowLeft,
  Ticket,
  ShieldCheck
} from 'lucide-react';

function PagamentoPix() {
  const { cobrancaId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { atualizarIngressos } = useParticipante();
  
  const [loading, setLoading] = useState(true);
  const [gerando, setGerando] = useState(false);
  const [cobranca, setCobranca] = useState(null);
  const [linkPagamento, setLinkPagamento] = useState(null);
  const [linkSandbox, setLinkSandbox] = useState(false);
  const [status, setStatus] = useState('pendente');
  const [error, setError] = useState(null);
  
  const pollingRef = useRef(null);
  const autoOpenedRef = useRef(false);
  const autoOpen = searchParams.get('auto') === 'true';

  useEffect(() => {
    const statusParam = searchParams.get('status');
    if (statusParam === 'approved') {
      setStatus('pago');
    }
    carregarCobranca();
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, [cobrancaId]);

  // Auto-abrir Checkout Pro quando vier de Meus ingressos com ?auto=true
  useEffect(() => {
    if (autoOpen && !autoOpenedRef.current && cobranca && cobranca.status === 'pendente' && !linkPagamento && !loading && !gerando) {
      autoOpenedRef.current = true;
      gerarLinkPagamento(true);
    }
  }, [autoOpen, cobranca, linkPagamento, loading, gerando]);

  const carregarCobranca = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/cobrancas/${cobrancaId}/`);
      setCobranca(response.data);
      
      if (response.data.status === 'pago') {
        setStatus('pago');
      } else if (response.data.status === 'pendente') {
        // Se já tem referência externa, já existe uma preferência criada
        if (response.data.referencia_externa) {
          console.log('[Pagamento] Cobrança já tem preferência MP:', response.data.referencia_externa);
          // Iniciar polling para verificar se já foi pago
          iniciarPolling();
        }
      }
    } catch (error) {
      console.error('Erro ao carregar cobrança:', error);
      setError('Cobrança não encontrada');
    } finally {
      setLoading(false);
    }
  };

  const gerarLinkPagamento = async (abrirAutomaticamente = false) => {
    try {
      setGerando(true);
      setError(null);
      
      const response = await api.post('/mercadopago/criar-pix/', {
        cobranca_id: cobrancaId
      });
      
      if (response.data.success) {
        // Mesmo no ambiente de testes atual do MP, o link funcional é o init_point.
        // sandbox_init_point pode cair no erro "uma das partes é de teste".
        const isSandbox = !!response.data.is_sandbox;
        const link = response.data.init_point || response.data.sandbox_init_point;
        setLinkPagamento(link);
        setLinkSandbox(isSandbox);
        iniciarPolling();
        
        // Se foi reutilizado (usuário voltou do MP), não abrir automaticamente
        const foiReutilizado = response.data.reutilizado;
        
        // Abrir automaticamente apenas se:
        // 1. Foi solicitado explicitamente OU veio com auto=true
        // 2. E NÃO foi reutilizado (para evitar abrir novamente quando volta do MP)
        if ((abrirAutomaticamente || autoOpen) && !foiReutilizado) {
          console.log('[Pagamento] Abrindo Mercado Pago...');
          window.open(link, '_blank');
        } else if (foiReutilizado) {
          console.log('[Pagamento] Link reutilizado - não abrindo automaticamente');
        }
      } else {
        setError(response.data.error || 'Erro ao gerar link de pagamento');
      }
    } catch (error) {
      console.error('Erro ao gerar link:', error);
      setError(error.response?.data?.error || 'Erro ao gerar link. Verifique se o Mercado Pago está configurado.');
    } finally {
      setGerando(false);
    }
  };

  const iniciarPolling = () => {
    console.log('[Pagamento] Iniciando polling de verificação...');
    
    // Limpar polling anterior se existir
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
    }
    
    // Verificar status a cada 5 segundos
    pollingRef.current = setInterval(async () => {
      try {
        console.log('[Pagamento] Verificando status...');
        const response = await api.get(`/mercadopago/verificar/${cobrancaId}/`);
        console.log('[Pagamento] Status recebido:', response.data);
        
        if (response.data.status === 'pago' || response.data.mp_status === 'approved') {
          console.log('[Pagamento] Pagamento confirmado!');
          setStatus('pago');
          clearInterval(pollingRef.current);
          carregarCobranca();
          await atualizarIngressos({ forcar: true });
        }
      } catch (error) {
        console.error('Erro ao verificar status:', error);
      }
    }, 5000);
  };

  const abrirPagamento = () => {
    if (linkPagamento) {
      window.open(linkPagamento, '_blank');
    }
  };

  const formatarValor = (valor) => {
    return `R$ ${parseFloat(valor).toFixed(2).replace('.', ',')}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Carregando...</p>
        </div>
      </div>
    );
  }

  if (error && !cobranca) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Erro</h1>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={() => navigate(-1)}
            className="btn btn-primary"
          >
            Voltar
          </button>
        </div>
      </div>
    );
  }

  // Pagamento confirmado
  if (status === 'pago') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-green-50 to-white flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-12 h-12 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Pagamento Confirmado!</h1>
          <p className="text-gray-600 mb-6">
            Seu pagamento foi processado com sucesso. Os ingressos já estão disponíveis.
          </p>
          
          <div className="bg-green-50 rounded-lg p-4 mb-6">
            <p className="text-green-800 font-medium">
              Valor pago: {formatarValor(cobranca?.valor)}
            </p>
          </div>
          
          <div className="space-y-3">
            <button
              onClick={async () => {
                await atualizarIngressos({ forcar: true })
                navigate('/meus-ingressos')
              }}
              className="w-full btn btn-primary flex items-center justify-center gap-2"
            >
              <Ticket className="w-5 h-5" />
              Ver Meus Ingressos
            </button>
            <button
              onClick={() => navigate('/eventos')}
              className="w-full btn btn-secondary"
            >
              Voltar para Eventos
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 py-8 px-4">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft className="w-5 h-5 mr-2" />
            Voltar
          </button>
          <h1 className="text-2xl font-bold text-gray-900">Pagamento</h1>
          <p className="text-gray-600">
            Pague com <strong>PIX</strong> ou <strong>cartão de crédito</strong> no Mercado Pago (Checkout Pro)
          </p>
        </div>

        {/* Card de Pagamento */}
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
          {/* Info da Cobrança */}
          <div className="p-6 border-b bg-gray-50">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-sm text-gray-500">Evento</p>
                <p className="font-semibold text-gray-900">{cobranca?.evento_titulo}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-500">Valor</p>
                <p className="text-2xl font-bold text-primary-600">
                  {formatarValor(cobranca?.valor)}
                </p>
              </div>
            </div>
            
            {/* Itens */}
            {cobranca?.itens && cobranca.itens.length > 0 && (
              <div className="mt-4 pt-4 border-t">
                <p className="text-sm text-gray-500 mb-2">Inscrições incluídas:</p>
                <ul className="text-sm space-y-1">
                  {cobranca.itens.map((item, index) => (
                    <li key={index} className="flex justify-between">
                      <span>{item.membro_nome}</span>
                      <span className="text-gray-500">{formatarValor(item.valor)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Área de Pagamento */}
          <div className="p-6">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                <div className="flex items-start">
                  <AlertCircle className="w-5 h-5 text-red-500 mr-2 mt-0.5" />
                  <p className="text-red-700 text-sm">{error}</p>
                </div>
              </div>
            )}

            {!linkPagamento ? (
              // Botão para gerar link
              <div className="text-center py-6">
                <p className="text-gray-600 mb-4">
                  Pague com PIX ou cartão de crédito no Mercado Pago.
                </p>
                <button
                  onClick={() => gerarLinkPagamento(true)}
                  disabled={gerando}
                  className="btn btn-primary px-6 py-3 flex items-center justify-center gap-2 mx-auto"
                >
                  {gerando ? <><RefreshCw className="w-5 h-5 animate-spin" />Gerando...</> : <><ExternalLink className="w-5 h-5" />Ir ao Mercado Pago (PIX ou cartão)</>}
                </button>
                <p className="text-xs text-gray-500 mt-3">Você será redirecionado ao site do Mercado Pago para concluir o pagamento.</p>
              </div>
            ) : (
              <div className="text-center">
                {/* Ícone de sucesso */}
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Check className="w-8 h-8 text-green-600" />
                </div>
                
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Link de pagamento gerado!
                </h3>
                
                <p className="text-gray-600 mb-6">
                  Clique no botão abaixo para pagar no Mercado Pago
                </p>

                {linkSandbox && (
                  <div className="mb-4 rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-left text-sm text-yellow-800">
                    <p className="font-semibold">Checkout em Sandbox</p>
                    <p className="mt-1">
                      Para concluir o teste, entre no Mercado Pago com um <strong>usuário comprador de teste</strong>.
                      Não use sua conta real nem a conta vendedora da integração.
                    </p>
                  </div>
                )}

                {/* Botão para abrir pagamento */}
                <button
                  onClick={abrirPagamento}
                  className="w-full bg-[#009ee3] hover:bg-[#008ed0] text-white font-semibold py-4 px-6 rounded-lg flex items-center justify-center gap-2 transition-colors"
                >
                  <ExternalLink className="w-5 h-5" />
                  Ir para o Mercado Pago
                </button>

                {/* Status de Aguardando */}
                <div className="flex items-center justify-center text-yellow-600 mt-6 mb-4">
                  <Clock className="w-5 h-5 mr-2 animate-pulse" />
                  <span className="font-medium">Aguardando confirmação do pagamento...</span>
                </div>

                {/* Formas de pagamento */}
                <div className="mt-6 bg-blue-50 rounded-lg p-4 text-left">
                  <h4 className="font-medium text-blue-800 mb-2">Formas de pagamento aceitas:</h4>
                  <ul className="text-sm text-blue-700 space-y-1">
                    <li>• PIX (aprovação instantânea)</li>
                    <li>• Cartão de crédito ou débito</li>
                  </ul>
                  <p className="text-xs text-blue-600 mt-3">
                    Após o pagamento, esta página será atualizada automaticamente.
                  </p>
                </div>

                {/* Dicas para evitar recusa de cartão */}
                <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-3 text-left text-sm text-amber-800">
                  <p className="font-medium mb-1">Se o cartão for recusado:</p>
                  <ul className="list-disc list-inside space-y-0.5 text-xs">
                    {linkSandbox && (
                      <>
                        <li><strong>Modo teste (Sandbox):</strong> use uma <strong>conta de usuário de teste</strong> (Comprador) para pagar. Crie em: Desenvolvedores → Suas integrações → Usuários de teste.</li>
                        <li>Cartões de teste: use número, CVV e validade da <a href="https://www.mercadopago.com.br/developers/pt/docs/your-integrations/test/cards" target="_blank" rel="noopener noreferrer" className="underline">documentação</a>. Para <strong>pagamento aprovado</strong>, preencha <strong>Nome do titular: APRO</strong> e <strong>CPF: 12345678909</strong>.</li>
                      </>
                    )}
                    {!linkSandbox && <li>Use o meio de pagamento e o dispositivo que você costuma usar em compras online.</li>}
                    <li>Não pague com cartão da mesma conta que recebe (vendedor).</li>
                    <li>Confira dados, limite e se o cartão não está bloqueado; ou pague com PIX.</li>
                  </ul>
                </div>
                
                {/* Segurança */}
                <div className="flex items-center justify-center gap-2 mt-4 text-gray-500 text-sm">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Pagamento seguro via Mercado Pago</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Info de Segurança */}
        <div className="mt-6 text-center text-sm text-gray-500">
          <p>Pagamento processado com segurança via</p>
          <p className="font-medium text-gray-700">Mercado Pago</p>
        </div>
      </div>
    </div>
  );
}

export default PagamentoPix;
