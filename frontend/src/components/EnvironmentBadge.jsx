const PRODUCTION_HOSTS = new Set(['championschurch.com.br', 'www.championschurch.com.br'])

function getHostname() {
  if (typeof window === 'undefined') {
    return ''
  }
  return window.location.hostname.toLowerCase()
}

function EnvironmentBadge() {
  const hostname = getHostname()

  if (!hostname || PRODUCTION_HOSTS.has(hostname)) {
    return null
  }

  const label = hostname.includes('localhost') || hostname === '127.0.0.1'
    ? 'AMBIENTE LOCAL'
    : 'AMBIENTE DEV'

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[9999] select-none">
      <div className="rounded-full border border-amber-300 bg-amber-500/95 px-4 py-2 text-xs font-bold uppercase tracking-[0.2em] text-amber-950 shadow-lg shadow-black/20">
        {label}
      </div>
    </div>
  )
}

export default EnvironmentBadge
