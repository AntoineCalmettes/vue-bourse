export interface EtfTimeSeries {
  symbol: string
  closes: number[]
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

const BASE_URL = 'https://www.alphavantage.co/query'

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

  return { symbol, closes }
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

  return { symbol, closes }
}

export async function fetchAssetTimeSeries(
  symbol: string,
  apiKey: string,
  kind: AssetKind,
): Promise<EtfTimeSeries> {
  return kind === 'crypto' ? fetchCryptoSeries(symbol, apiKey) : fetchEquitySeries(symbol, apiKey)
}

export async function fetchEtfTimeSeries(symbol: string, apiKey: string): Promise<EtfTimeSeries> {
  return fetchAssetTimeSeries(symbol, apiKey, 'equity')
}
