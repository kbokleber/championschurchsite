/**
 * Dados mínimos do pagador (PIX exige e-mail + CPF no MP Brasil).
 */
export function PayerDataForm({ payer, onChange, disabled = false }) {
  const set = (field, value) => onChange({ ...payer, [field]: value })

  return (
    <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm">
      <p className="font-medium text-gray-800">Dados do pagador</p>
      <div>
        <label className="block text-gray-600 mb-1">E-mail</label>
        <input
          type="email"
          className="input w-full"
          value={payer.email || ''}
          onChange={(e) => set('email', e.target.value)}
          disabled={disabled}
          placeholder="seu@email.com"
        />
      </div>
      <div>
        <label className="block text-gray-600 mb-1">CPF (somente números)</label>
        <input
          type="text"
          inputMode="numeric"
          className="input w-full"
          value={payer.cpf || ''}
          onChange={(e) => set('cpf', e.target.value.replace(/\D/g, '').slice(0, 11))}
          disabled={disabled}
          placeholder="00000000000"
          maxLength={11}
        />
      </div>
    </div>
  )
}

export function payerToApiPayload(payer) {
  return {
    email: (payer.email || '').trim(),
    identification: {
      type: 'CPF',
      number: (payer.cpf || '').replace(/\D/g, ''),
    },
  }
}

export function isPayerValid(payer) {
  const email = (payer.email || '').trim()
  const cpf = (payer.cpf || '').replace(/\D/g, '')
  return email.includes('@') && cpf.length >= 11
}

export default PayerDataForm
