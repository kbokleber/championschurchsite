/**
 * Componente de seleção de data/hora
 * Usa input nativo datetime-local e converte para formato BR na exibição
 */

function DatePickerBR({ 
  selected, 
  onChange, 
  placeholder = 'Selecione data e hora',
  minDate,
  ...props 
}) {
  // Converter Date para formato datetime-local (YYYY-MM-DDTHH:MM)
  const formatToInput = (date) => {
    if (!date) return ''
    if (typeof date === 'string') {
      const d = new Date(date)
      if (isNaN(d.getTime())) return ''
      date = d
    }
    
    if (!(date instanceof Date) || isNaN(date.getTime())) {
      return ''
    }
    
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    return `${year}-${month}-${day}T${hours}:${minutes}`
  }

  // Converter valor do input para Date
  const handleChange = (e) => {
    const value = e.target.value
    if (!value) {
      onChange(null)
      return
    }
    const date = new Date(value)
    onChange(date)
  }

  // Converter minDate para formato do input
  const getMinDate = () => {
    if (!minDate) return undefined
    return formatToInput(minDate)
  }

  return (
    <input
      type="datetime-local"
      value={formatToInput(selected)}
      onChange={handleChange}
      min={getMinDate()}
      className="input-field w-full"
      {...props}
    />
  )
}

export default DatePickerBR
