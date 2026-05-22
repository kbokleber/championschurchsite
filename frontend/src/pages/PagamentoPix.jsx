import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import { useParticipante } from '../contexts/ParticipanteContext';
import { MercadoPagoCheckout } from '../components/mercadopago/MercadoPagoCheckout';
import {
  rotuloMetodosMp,
  textoIntroPagamento,
  useMercadoPagoMetodos,
} from '../components/mercadopago/useMercadoPagoMetodos';
import { 
  AlertCircle, 
  CheckCircle,
  ArrowLeft,
  Ticket,
  ShieldCheck,
  Clock
} from 'lucide-react';

function PagamentoPix() {
  const { cobrancaId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { atualizarIngressos } = useParticipante();
  
  const [loading, setLoading] = useState(true);
  const [cobranca, setCobranca] = useState(null);
  const [status, setStatus] = useState('pendente');
  const [error, setError] = useState(null);
  
  const pollingRef = useRef(null);
  const metodosMp = useMercadoPagoMetodos();

  const defaultPayer = useMemo(
    () => ({
      email: cobranca?.membro_email || '',
      cpf: '',
      name: cobranca?.membro_nome || '',
    }),
    [cobranca]
  );

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

  const carregarCobranca = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/cobrancas/${cobrancaId}/`);
      setCobranca(response.data);
      
      if (response.data.status === 'pago') {
        setStatus('pago');
      } else if (response.data.status === 'pendente') {
        iniciarPolling();
      }
    } catch (err) {
      console.error('Erro ao carregar cobrança:', err);
      setError('Cobrança não encontrada');
    } finally {
      setLoading(false);
    }
  };

  const iniciarPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
    }
    
    pollingRef.current = setInterval(async () => {
      try {
        const response = await api.get(`/mercadopago/verificar/${cobrancaId}/`);
        if (response.data.status === 'pago' || response.data.mp_status === 'approved') {
          setStatus('pago');
          clearInterval(pollingRef.current);
          carregarCobranca();
          await atualizarIngressos({ forcar: true });
        }
      } catch (err) {
        console.error('Erro ao verificar status:', err);
      }
    }, 5000);
  };

  const handlePaymentSuccess = async (data) => {
    if (data?.status === 'approved') {
      setStatus('pago');
      if (pollingRef.current) clearInterval(pollingRef.current);
      await carregarCobranca();
      await atualizarIngressos({ forcar: true });
      return;
    }
    if (data?.status === 'pending' || data?.status === 'in_process') {
      iniciarPolling();
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
          <button type="button" onClick={() => navigate(-1)} className="btn btn-primary">
            Voltar
          </button>
        </div>
      </div>
    );
  }

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
              type="button"
              onClick={async () => {
                await atualizarIngressos({ forcar: true })
                navigate('/meus-ingressos')
              }}
              className="w-full btn btn-primary flex items-center justify-center gap-2"
            >
              <Ticket className="w-5 h-5" />
              Ver Meus Ingressos
            </button>
            <button type="button" onClick={() => navigate('/eventos')} className="w-full btn btn-secondary">
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
        <div className="mb-6">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="flex items-center text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft className="w-5 h-5 mr-2" />
            Voltar
          </button>
          <h1 className="text-2xl font-bold text-gray-900">
            Pagamento{!metodosMp.loading ? ` — ${rotuloMetodosMp(metodosMp)}` : ''}
          </h1>
          <p className="text-gray-600">
            {metodosMp.loading
              ? 'Carregando formas de pagamento…'
              : textoIntroPagamento('eventos', metodosMp)}
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
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

          <div className="p-6">
            <MercadoPagoCheckout
              contexto="eventos"
              cobrancaId={Number(cobrancaId)}
              valor={Number(cobranca?.valor)}
              defaultPayer={defaultPayer}
              metodos={metodosMp}
              onPaymentSuccess={handlePaymentSuccess}
              onPixReady={() => iniciarPolling()}
            />

            <div className="flex items-center justify-center gap-2 mt-6 text-yellow-600 text-sm">
              <Clock className="w-4 h-4 animate-pulse" />
              <span>Aguardando confirmação após o pagamento…</span>
            </div>
            
            <div className="flex items-center justify-center gap-2 mt-4 text-gray-500 text-sm">
              <ShieldCheck className="w-4 h-4" />
              <span>Pagamento seguro via Mercado Pago</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PagamentoPix;
