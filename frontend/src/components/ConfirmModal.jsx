import { useState, useEffect } from 'react'
import { X, AlertTriangle, CheckCircle, Info, HelpCircle, Loader2 } from 'lucide-react'

/**
 * Modal de Confirmação reutilizável - Responsivo para mobile
 * 
 * @param {boolean} isOpen - Controla se o modal está visível
 * @param {function} onClose - Função chamada ao fechar o modal
 * @param {function} onConfirm - Função chamada ao confirmar
 * @param {string} title - Título do modal
 * @param {string} message - Mensagem principal
 * @param {string} type - Tipo: 'confirm' | 'success' | 'warning' | 'info' | 'danger'
 * @param {string} confirmText - Texto do botão de confirmar
 * @param {string} cancelText - Texto do botão de cancelar
 * @param {boolean} showCancel - Mostrar botão de cancelar
 * @param {boolean} loading - Estado de carregamento
 * @param {React.ReactNode} children - Conteúdo adicional
 */
function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirmação',
  message = 'Deseja continuar?',
  type = 'confirm',
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  showCancel = true,
  loading = false,
  children,
}) {
  const [isVisible, setIsVisible] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)

  useEffect(() => {
    if (isOpen) {
      // Prevenir scroll do body quando modal está aberto
      document.body.style.overflow = 'hidden'
      setIsVisible(true)
      setTimeout(() => setIsAnimating(true), 10)
    } else {
      document.body.style.overflow = ''
      setIsAnimating(false)
      setTimeout(() => setIsVisible(false), 300)
    }
    
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  if (!isVisible) return null

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget && !loading) {
      onClose()
    }
  }

  const handleConfirm = () => {
    if (!loading && onConfirm) {
      onConfirm()
    }
  }

  // Configurações por tipo
  const typeConfig = {
    confirm: {
      icon: <HelpCircle className="h-10 w-10 sm:h-12 sm:w-12" />,
      iconBg: 'bg-primary-100',
      iconColor: 'text-primary-600',
      confirmBg: 'bg-primary-600 hover:bg-primary-700 active:bg-primary-800',
    },
    success: {
      icon: <CheckCircle className="h-10 w-10 sm:h-12 sm:w-12" />,
      iconBg: 'bg-green-100',
      iconColor: 'text-green-600',
      confirmBg: 'bg-green-600 hover:bg-green-700 active:bg-green-800',
    },
    warning: {
      icon: <AlertTriangle className="h-10 w-10 sm:h-12 sm:w-12" />,
      iconBg: 'bg-amber-100',
      iconColor: 'text-amber-600',
      confirmBg: 'bg-amber-600 hover:bg-amber-700 active:bg-amber-800',
    },
    info: {
      icon: <Info className="h-10 w-10 sm:h-12 sm:w-12" />,
      iconBg: 'bg-blue-100',
      iconColor: 'text-blue-600',
      confirmBg: 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800',
    },
    danger: {
      icon: <AlertTriangle className="h-10 w-10 sm:h-12 sm:w-12" />,
      iconBg: 'bg-red-100',
      iconColor: 'text-red-600',
      confirmBg: 'bg-red-600 hover:bg-red-700 active:bg-red-800',
    },
  }

  const config = typeConfig[type] || typeConfig.confirm

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end sm:items-center justify-center transition-all duration-300 ${
        isAnimating ? 'bg-black/50 backdrop-blur-sm' : 'bg-black/0'
      }`}
      onClick={handleBackdropClick}
    >
      {/* Modal - No mobile aparece na parte inferior (bottom sheet style) */}
      <div
        className={`bg-white w-full sm:w-auto sm:max-w-md sm:mx-4 sm:rounded-2xl rounded-t-3xl shadow-2xl transform transition-all duration-300 max-h-[90vh] overflow-hidden flex flex-col ${
          isAnimating 
            ? 'translate-y-0 opacity-100 sm:scale-100' 
            : 'translate-y-full sm:translate-y-4 opacity-0 sm:scale-95'
        }`}
      >
        {/* Indicador de arraste (mobile) */}
        <div className="sm:hidden flex justify-center pt-3 pb-1">
          <div className="w-12 h-1.5 bg-gray-300 rounded-full"></div>
        </div>
        
        {/* Header com ícone */}
        <div className="relative pt-4 sm:pt-8 pb-3 sm:pb-4 px-5 sm:px-6">
          {/* Botão fechar */}
          {!loading && (
            <button
              onClick={onClose}
              className="absolute top-3 sm:top-4 right-3 sm:right-4 text-gray-400 hover:text-gray-600 active:text-gray-800 transition-colors p-1"
            >
              <X className="h-6 w-6" />
            </button>
          )}
          
          {/* Ícone central */}
          <div className="flex justify-center mb-3 sm:mb-4">
            <div className={`${config.iconBg} ${config.iconColor} p-3 sm:p-4 rounded-full`}>
              {config.icon}
            </div>
          </div>
          
          {/* Título */}
          <h3 className="text-lg sm:text-xl font-bold text-church-navy text-center">
            {title}
          </h3>
        </div>

        {/* Corpo - scrollável se conteúdo muito grande */}
        <div className="px-5 sm:px-6 pb-4 overflow-y-auto flex-1">
          <p className="text-gray-600 text-center text-sm sm:text-base">
            {message}
          </p>
          
          {/* Conteúdo adicional */}
          {children && (
            <div className="mt-4">
              {children}
            </div>
          )}
        </div>

        {/* Botões - fixos na parte inferior */}
        <div className="px-5 sm:px-6 pb-6 pt-2 flex flex-col-reverse sm:flex-row gap-3 bg-white border-t border-gray-100 sm:border-t-0">
          {showCancel && (
            <button
              onClick={onClose}
              disabled={loading}
              className="w-full sm:flex-1 px-4 py-3.5 sm:py-3 border-2 border-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 active:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {cancelText}
            </button>
          )}
          <button
            onClick={handleConfirm}
            disabled={loading}
            className={`w-full sm:flex-1 px-4 py-3.5 sm:py-3 text-white font-semibold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${config.confirmBg}`}
          >
            {loading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Processando...</span>
              </>
            ) : (
              confirmText
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ConfirmModal
