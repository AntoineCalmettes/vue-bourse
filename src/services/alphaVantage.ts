export interface EtfTimeSeries {
  symbol: string
  closes: number[]
  provider?: 'alpha_vantage' | 'finnhub' | 'yahoo'
  raw?: unknown
}

export type AssetKind = 'equity' | 'crypto'

interface AlphaVantageDailyResponse {
  Note?: string
  Information?: string
  Message?: string
  'Error Message'?: string
  'Time Series (Daily)'?: Record<string, { '4. close': string }>
  'Time Series (Digital Currency Daily)'?: Record<string, { '4b. close (EUR)': string }>
}

interface FinnhubCandleResponse {
  c?: number[]
  s?: string
  error?: string
}

interface YahooChartResponse {
  chart?: {
    result?: Array<{
      indicators?: {
        quote?: Array<{
          close?: Array<number | null>
        }>
      }
    }>
    error?: { description?: string }
  }
}

const BASE_URL = 'https://www.alphavantage.co/query'
const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1'
const YAHOO_BASE_URL = 'https://query1.finance.yahoo.com/v8/finance/chart'

const FINNHUB_EQUITY_SYMBOLS: Record<string, string[]> = {
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

const FINNHUB_CRYPTO_SYMBOLS: Record<string, string[]> = {
  BTC: ['BINANCE:BTCUSDT', 'COINBASE:BTCUSD'],
  ADA: ['BINANCE:ADAUSDT'],
}

const YAHOO_SYMBOLS: Record<string, string> = {
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

function shouldFallbackToFinnhub(message: string) {
  return /25 requests per day|premium plans|daily rate limits/i.test(message)
}

function ensureNoAlphaError(data: AlphaVantageDailyResponse, symbol: string) {
  if (data.Information) {
    throw new Error(data.Information)
  }

  if (data.Note) {
    throw new Error(data.Note)
  }

  if (data.Message) {
    throw new Error(data.Message)
  }

  if (data['Error Message']) {
    throw new Error(`Symbole invalide: ${symbol}`)
  }
}

async function fetchEquitySeries(symbol: string, apiKey: string): Promise<EtfTimeSeries> {
  const params = new URLSearchParams({
    function: 'TIME_SERIES_DAILY',
    symbol,
    outputsize: 'compact',
    apikey: apiKey,
  })

  const response = await fetch(`${BASE_URL}?${params.toString()}`)

  if (!response.ok) {
    throw new Error(`API indisponible (${response.status})`)
  }

  const data = (await response.json()) as AlphaVantageDailyResponse
  ensureNoAlphaError(data, symbol)

  if (!data['Time Series (Daily)']) {
    throw new Error('Réponse Alpha Vantage inattendue: série journalière absente.')
  }

  const closes = Object.entries(data['Time Series (Daily)'])
    .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
    .map(([, values]) => Number.parseFloat(values['4. close']))
    .filter((value) => Number.isFinite(value))
    .slice(-30)

  if (closes.length < 2) {
    throw new Error(`Pas assez de données pour ${symbol}`)
  }

  return { symbol, closes, provider: 'alpha_vantage', raw: data }
}

async function fetchCryptoSeries(symbol: string, apiKey: string): Promise<EtfTimeSeries> {
  const params = new URLSearchParams({
    function: 'DIGITAL_CURRENCY_DAILY',
    symbol,
    market: 'EUR',
    apikey: apiKey,
  })

  const response = await fetch(`${BASE_URL}?${params.toString()}`)

  if (!response.ok) {
    throw new Error(`API indisponible (${response.status})`)
  }

  const data = (await response.json()) as AlphaVantageDailyResponse
  ensureNoAlphaError(data, symbol)

  if (!data['Time Series (Digital Currency Daily)']) {
    throw new Error('Réponse Alpha Vantage inattendue: série crypto absente.')
  }

  const closes = Object.entries(data['Time Series (Digital Currency Daily)'])
    .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
    .map(([, values]) => Number.parseFloat(values['4b. close (EUR)']))
    .filter((value) => Number.isFinite(value))
    .slice(-30)

  if (closes.length < 2) {
    throw new Error(`Pas assez de données pour ${symbol}`)
  }

  return { symbol, closes, provider: 'alpha_vantage', raw: data }
}

async function fetchFinnhubCandles(
  endpoint: 'stock/candle' | 'crypto/candle',
  symbol: string,
  token: string,
): Promise<{ closes: number[]; raw: FinnhubCandleResponse }> {
  const nowSec = Math.floor(Date.now() / 1000)
  const to = Math.max(0, nowSec - 60)
  const from = Math.max(0, to - 365 * 24 * 60 * 60)

  if (from >= to) {
    throw new Error('Plage de dates Finnhub invalide.')
  }

  const params = new URLSearchParams({
    symbol,
    resolution: 'D',
    from: `${from}`,
    to: `${to}`,
    token,
  })

  const response = await fetch(`${FINNHUB_BASE_URL}/${endpoint}?${params.toString()}`)
  const data = (await response.json()) as FinnhubCandleResponse

  if (data.error) {
    throw new Error(data.error)
  }

  if (!response.ok) {
    throw new Error(`Finnhub indisponible (${response.status})`)
  }

  if (!Array.isArray(data.c) || data.s === 'no_data') {
    throw new Error(`Pas de données Finnhub pour ${symbol}`)
  }

  const closes = data.c.filter((value) => Number.isFinite(value)).slice(-30)

  if (closes.length < 2) {
    throw new Error(`Pas assez de données Finnhub pour ${symbol}`)
  }

  return { closes, raw: data }
}

async function fetchFinnhubEquitySeries(symbol: string, token: string): Promise<EtfTimeSeries> {
  const candidates = FINNHUB_EQUITY_SYMBOLS[symbol] || [symbol]
  let lastError = 'Aucune donnée Finnhub'

  for (const candidate of candidates) {
    try {
      const { closes, raw } = await fetchFinnhubCandles('stock/candle', candidate, token)
      return { symbol, closes, provider: 'finnhub', raw }
    } catch (error) {
      lastError = error instanceof Error ? error.message : lastError
    }
  }

  throw new Error(lastError)
}

async function fetchFinnhubCryptoSeries(symbol: string, token: string): Promise<EtfTimeSeries> {
  const candidates = FINNHUB_CRYPTO_SYMBOLS[symbol] || []
  let lastError = 'Aucune donnée crypto Finnhub'

  for (const candidate of candidates) {
    try {
      const { closes, raw } = await fetchFinnhubCandles('crypto/candle', candidate, token)
      return { symbol, closes, provider: 'finnhub', raw }
    } catch (error) {
      lastError = error instanceof Error ? error.message : lastError
    }
  }

  throw new Error(lastError)
}

async function fetchYahooSeries(symbol: string): Promise<EtfTimeSeries> {
  const yahooSymbol = YAHOO_SYMBOLS[symbol] || symbol
  const params = new URLSearchParams({
    range: '1y',
    interval: '1d',
  })

  const response = await fetch(`${YAHOO_BASE_URL}/${encodeURIComponent(yahooSymbol)}?${params.toString()}`)

  if (!response.ok) {
    throw new Error(`Yahoo indisponible (${response.status})`)
  }

  const data = (await response.json()) as YahooChartResponse
  if (data.chart?.error?.description) {
    throw new Error(data.chart.error.description)
  }

  const rawCloses = data.chart?.result?.[0]?.indicators?.quote?.[0]?.close
  if (!Array.isArray(rawCloses)) {
    throw new Error(`Pas de données Yahoo pour ${symbol}`)
  }

  const closes = rawCloses
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
    .slice(-30)

  if (closes.length < 2) {
    throw new Error(`Pas assez de données Yahoo pour ${symbol}`)
  }

  return { symbol, closes, provider: 'yahoo', raw: data }
}

export async function fetchAssetTimeSeries(
  symbol: string,
  apiKey: string,
  kind: AssetKind,
  finnhubApiKey?: string,
): Promise<EtfTimeSeries> {
  try {
    return kind === 'crypto' ? await fetchCryptoSeries(symbol, apiKey) : await fetchEquitySeries(symbol, apiKey)
  } catch (error) {
    const message = error instanceof Error ? error.message : ''

    if (finnhubApiKey && shouldFallbackToFinnhub(message)) {
      try {
        return kind === 'crypto'
          ? await fetchFinnhubCryptoSeries(symbol, finnhubApiKey)
          : await fetchFinnhubEquitySeries(symbol, finnhubApiKey)
      } catch (finnhubError) {
        const finnhubMessage = finnhubError instanceof Error ? finnhubError.message : ''

        if (/don't have access to this resource/i.test(finnhubMessage)) {
          return fetchYahooSeries(symbol)
        }

        throw finnhubError
      }
    }

    throw error
  }
}

export async function fetchEtfTimeSeries(symbol: string, apiKey: string): Promise<EtfTimeSeries> {
  return fetchAssetTimeSeries(symbol, apiKey, 'equity')
}
