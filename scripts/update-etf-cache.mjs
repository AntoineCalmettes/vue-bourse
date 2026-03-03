import { writeFile } from 'node:fs/promises'

const API_KEY = process.env.ALPHA_VANTAGE_API_KEY || 'NX5TOEVPMER3P6BG'
const BASE_URL = 'https://www.alphavantage.co/query'
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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function ensureNoError(data) {
  if (data.Note || data.Information || data.Message || data['Error Message']) {
    throw new Error(data.Note || data.Information || data.Message || data['Error Message'])
  }
}

async function fetchEquity(symbol) {
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

  return { symbol, closes }
}

async function fetchCrypto(symbol) {
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

  return { symbol, closes }
}

async function main() {
  const all = []
  const failures = []

  for (const [index, asset] of ASSETS.entries()) {
    try {
      const row =
        asset.kind === 'crypto' ? await fetchCrypto(asset.symbol) : await fetchEquity(asset.symbol)
      all.push(row)
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
