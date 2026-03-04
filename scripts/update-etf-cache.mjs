import { writeFile } from 'node:fs/promises'

const API_KEY = process.env.ALPHA_VANTAGE_API_KEY || ''
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY || ''
const BASE_URL = 'https://www.alphavantage.co/query'
const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1'
const YAHOO_BASE_URL = 'https://query1.finance.yahoo.com/v8/finance/chart'

if (!API_KEY) {
  throw new Error('ALPHA_VANTAGE_API_KEY manquant')
}

const ASSETS = [
  { symbol: 'VWCE.DE', kind: 'equity' },
  { symbol: 'EIMI.L', kind: 'equity' },
  { symbol: 'SXR8.DE', kind: 'equity' },
  { symbol: 'GLD', kind: 'equity' },
  { symbol: 'SLV', kind: 'equity' },
  { symbol: 'ADA', kind: 'crypto' },
  { symbol: 'GOOGL', kind: 'equity' },
  { symbol: 'NVDA', kind: 'equity' },
  { symbol: 'RKLB', kind: 'equity' },
  { symbol: 'AVGO', kind: 'equity' },
  { symbol: 'AMZN', kind: 'equity' },
  { symbol: 'MELI', kind: 'equity' },
  { symbol: 'PYPL', kind: 'equity' },
  { symbol: 'BTC', kind: 'crypto' },
  { symbol: 'SHOP', kind: 'equity' },
  { symbol: 'TTD', kind: 'equity' },
  { symbol: 'TSLA', kind: 'equity' },
]

const FINNHUB_EQUITY_SYMBOLS = {
  'VWCE.DE': ['XETR:VWCE', 'FRA:VWCE'],
  'EIMI.L': ['LSE:EIMI'],
  'SXR8.DE': ['XETR:SXR8', 'FRA:SXR8'],
  GLD: ['GLD', 'AMEX:GLD'],
  SLV: ['SLV', 'AMEX:SLV'],
  GOOGL: ['GOOGL', 'NASDAQ:GOOGL'],
  NVDA: ['NVDA', 'NASDAQ:NVDA'],
  RKLB: ['RKLB', 'NASDAQ:RKLB'],
  AVGO: ['AVGO', 'NASDAQ:AVGO'],
  AMZN: ['AMZN', 'NASDAQ:AMZN'],
  MELI: ['MELI', 'NASDAQ:MELI'],
  PYPL: ['PYPL', 'NASDAQ:PYPL'],
  SHOP: ['SHOP', 'NYSE:SHOP'],
  TTD: ['TTD', 'NASDAQ:TTD'],
  TSLA: ['TSLA', 'NASDAQ:TSLA'],
}

const FINNHUB_CRYPTO_SYMBOLS = {
  BTC: ['BINANCE:BTCUSDT', 'COINBASE:BTCUSD'],
  ADA: ['BINANCE:ADAUSDT'],
}

const YAHOO_SYMBOLS = {
  'VWCE.DE': 'VWCE.DE',
  'EIMI.L': 'EIMI.L',
  'SXR8.DE': 'SXR8.DE',
  GLD: 'GLD',
  SLV: 'SLV',
  GOOGL: 'GOOGL',
  NVDA: 'NVDA',
  RKLB: 'RKLB',
  AVGO: 'AVGO',
  AMZN: 'AMZN',
  MELI: 'MELI',
  PYPL: 'PYPL',
  SHOP: 'SHOP',
  TTD: 'TTD',
  TSLA: 'TSLA',
  BTC: 'BTC-EUR',
  ADA: 'ADA-EUR',
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function shouldFallbackToFinnhub(message) {
  return /25 requests per day|premium plans|daily rate limits/i.test(message)
}

function ensureNoError(data) {
  if (data.Note || data.Information || data.Message || data['Error Message']) {
    throw new Error(data.Note || data.Information || data.Message || data['Error Message'])
  }
}

async function fetchAlphaEquity(symbol) {
  const params = new URLSearchParams({
    function: 'TIME_SERIES_DAILY',
    symbol,
    outputsize: 'compact',
    apikey: API_KEY,
  })

  const response = await fetch(`${BASE_URL}?${params.toString()}`)
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} pour ${symbol}`)
  }

  const data = await response.json()
  ensureNoError(data)

  if (!data['Time Series (Daily)']) {
    throw new Error(`Réponse invalide pour ${symbol}`)
  }

  const closes = Object.entries(data['Time Series (Daily)'])
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, value]) => Number.parseFloat(value['4. close']))
    .filter((value) => Number.isFinite(value))
    .slice(-30)

  return { symbol, closes, provider: 'alpha_vantage', raw: data }
}

async function fetchAlphaCrypto(symbol) {
  const params = new URLSearchParams({
    function: 'DIGITAL_CURRENCY_DAILY',
    symbol,
    market: 'EUR',
    apikey: API_KEY,
  })

  const response = await fetch(`${BASE_URL}?${params.toString()}`)
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} pour ${symbol}`)
  }

  const data = await response.json()
  ensureNoError(data)

  if (!data['Time Series (Digital Currency Daily)']) {
    throw new Error(`Réponse invalide pour ${symbol}`)
  }

  const closes = Object.entries(data['Time Series (Digital Currency Daily)'])
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, value]) => Number.parseFloat(value['4b. close (EUR)']))
    .filter((value) => Number.isFinite(value))
    .slice(-30)

  return { symbol, closes, provider: 'alpha_vantage', raw: data }
}

async function fetchFinnhubCandles(endpoint, symbol) {
  const nowSec = Math.floor(Date.now() / 1000)
  const to = Math.max(0, nowSec - 60)
  const from = Math.max(0, to - 365 * 24 * 60 * 60)

  if (from >= to) {
    throw new Error('Plage de dates Finnhub invalide')
  }

  const params = new URLSearchParams({
    symbol,
    resolution: 'D',
    from: `${from}`,
    to: `${to}`,
    token: FINNHUB_API_KEY,
  })

  const response = await fetch(`${FINNHUB_BASE_URL}/${endpoint}?${params.toString()}`)
  const data = await response.json()

  if (data.error) {
    throw new Error(data.error)
  }

  if (!response.ok) {
    throw new Error(`Finnhub HTTP ${response.status} pour ${symbol}`)
  }

  if (!Array.isArray(data.c) || data.s === 'no_data') {
    throw new Error(`No data Finnhub pour ${symbol}`)
  }

  return {
    closes: data.c.filter((value) => Number.isFinite(value)).slice(-30),
    raw: data,
  }
}

async function fetchFinnhubEquity(symbol) {
  const candidates = FINNHUB_EQUITY_SYMBOLS[symbol] || [symbol]
  let lastError = 'Aucune donnée Finnhub equity'

  for (const candidate of candidates) {
    try {
      const { closes, raw } = await fetchFinnhubCandles('stock/candle', candidate)
      return { symbol, closes, provider: 'finnhub', raw }
    } catch (error) {
      lastError = error.message
    }
  }

  throw new Error(lastError)
}

async function fetchFinnhubCrypto(symbol) {
  const candidates = FINNHUB_CRYPTO_SYMBOLS[symbol] || []
  let lastError = 'Aucune donnée Finnhub crypto'

  for (const candidate of candidates) {
    try {
      const { closes, raw } = await fetchFinnhubCandles('crypto/candle', candidate)
      return { symbol, closes, provider: 'finnhub', raw }
    } catch (error) {
      lastError = error.message
    }
  }

  throw new Error(lastError)
}

async function fetchYahoo(symbol) {
  const yahooSymbol = YAHOO_SYMBOLS[symbol] || symbol
  const params = new URLSearchParams({
    range: '1y',
    interval: '1d',
  })

  const response = await fetch(`${YAHOO_BASE_URL}/${encodeURIComponent(yahooSymbol)}?${params.toString()}`)
  if (!response.ok) {
    throw new Error(`Yahoo HTTP ${response.status} pour ${symbol}`)
  }

  const data = await response.json()
  if (data.chart?.error?.description) {
    throw new Error(data.chart.error.description)
  }

  const rawCloses = data.chart?.result?.[0]?.indicators?.quote?.[0]?.close
  if (!Array.isArray(rawCloses)) {
    throw new Error(`No data Yahoo pour ${symbol}`)
  }

  const closes = rawCloses
    .filter((value) => typeof value === 'number' && Number.isFinite(value))
    .slice(-30)

  if (closes.length < 2) {
    throw new Error(`Pas assez de donnees Yahoo pour ${symbol}`)
  }

  return { symbol, closes, provider: 'yahoo', raw: data }
}

async function fetchWithFallback(asset) {
  try {
    return asset.kind === 'crypto' ? await fetchAlphaCrypto(asset.symbol) : await fetchAlphaEquity(asset.symbol)
  } catch (error) {
    const message = error instanceof Error ? error.message : ''

    if (!shouldFallbackToFinnhub(message)) {
      throw error
    }

    try {
      return asset.kind === 'crypto'
        ? await fetchFinnhubCrypto(asset.symbol)
        : await fetchFinnhubEquity(asset.symbol)
    } catch (finnhubError) {
      const finnhubMessage = finnhubError instanceof Error ? finnhubError.message : ''
      if (/don't have access to this resource/i.test(finnhubMessage)) {
        return fetchYahoo(asset.symbol)
      }
      throw finnhubError
    }
  }
}

async function main() {
  const all = []
  const failures = []

  for (const [index, asset] of ASSETS.entries()) {
    try {
      all.push(await fetchWithFallback(asset))
    } catch (error) {
      failures.push(`${asset.symbol}: ${error.message}`)
    }

    if (index < ASSETS.length - 1) {
      await sleep(1100)
    }
  }

  const payload = {
    savedAt: new Date().toISOString(),
    data: all,
  }

  await writeFile('public/etf-cache.json', `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  console.log('public/etf-cache.json mis a jour')
  if (failures.length) {
    console.log(`Echecs partiels (${failures.length}):`)
    for (const message of failures) {
      console.log(`- ${message}`)
    }
  }
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
