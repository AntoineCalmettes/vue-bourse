<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import SparklineChart from './components/SparklineChart.vue'
import type { AssetKind, EtfTimeSeries } from './services/alphaVantage'
import type { NewsArticle, NewsCategory } from './services/newsApi'

interface AssetDefinition {
  symbol: string
  name: string
  type: 'ETF' | 'Titre'
  kind: AssetKind
  icon: string
  color: string
  units: number
  valueEur: number
  weightPct?: number
}

interface DashboardRow extends AssetDefinition {
  closes: number[]
  price: number
  dailyChangePct: number
  monthChangePct: number
  provider?: 'alpha_vantage' | 'finnhub' | 'yahoo'
  raw?: unknown
}

interface MarketsApiResponse {
  source: string
  savedAt: string
  data: EtfTimeSeries[]
  failures?: string[]
}

interface NewsApiResponse {
  source: string
  savedAt: string
  data: NewsArticle[]
}

const assetList: AssetDefinition[] = [
  { symbol: 'VWCE.DE', name: 'FTSE All-World USD (Acc)', type: 'ETF', kind: 'equity', icon: '🌍', color: '#4dd0ff', units: 1.8608, valueEur: 272.79, weightPct: 1.18 },
  { symbol: 'EIMI.L', name: 'MSCI Emerging Markets EUR (Acc)', type: 'ETF', kind: 'equity', icon: '🌱', color: '#76f2b9', units: 21.5476, valueEur: 139.51, weightPct: 5.24 },
  { symbol: 'SXR8.DE', name: 'Core S&P 500 USD (Acc)', type: 'ETF', kind: 'equity', icon: '🇺🇸', color: '#ffd166', units: 0.006377, valueEur: 3.98 },
  { symbol: 'GLD', name: 'Or', type: 'ETF', kind: 'equity', icon: '🧱', color: '#f4c542', units: 0, valueEur: 0 },
  { symbol: 'SLV', name: 'Argent', type: 'ETF', kind: 'equity', icon: '🥈', color: '#b9c6d8', units: 0, valueEur: 0 },
  { symbol: 'ADA', name: 'Cardano', type: 'Titre', kind: 'crypto', icon: '🔷', color: '#6aa2ff', units: 136.444371, valueEur: 30.99, weightPct: 3.17 },
  { symbol: 'GOOGL', name: 'Alphabet (A)', type: 'Titre', kind: 'equity', icon: '🔍', color: '#b9f871', units: 0.07395, valueEur: 19.06, weightPct: 4.68 },
  { symbol: 'NVDA', name: 'NVIDIA', type: 'Titre', kind: 'equity', icon: '🟩', color: '#7dff8f', units: 0.12338, valueEur: 19.02, weightPct: 4.9 },
  { symbol: 'RKLB', name: 'Rocket Lab Corp. Registered Shares DL-,0001', type: 'Titre', kind: 'equity', icon: '🚀', color: '#ff8f7a', units: 0.32258, valueEur: 18.55, weightPct: 7.26 },
  { symbol: 'AVGO', name: 'Broadcom', type: 'Titre', kind: 'equity', icon: '📡', color: '#ff9ed6', units: 0.066577, valueEur: 17.87, weightPct: 10.67 },
  { symbol: 'AMZN', name: 'Amazon.com', type: 'Titre', kind: 'equity', icon: '📦', color: '#f7b267', units: 0.100633, valueEur: 17.69, weightPct: 11.54 },
  { symbol: 'MELI', name: 'MercadoLibre', type: 'Titre', kind: 'equity', icon: '🛒', color: '#ffe45e', units: 0.0115, valueEur: 16.67, weightPct: 16.67 },
  { symbol: 'PYPL', name: 'PayPal', type: 'Titre', kind: 'equity', icon: '💳', color: '#6db6ff', units: 0.396353, valueEur: 15.45, weightPct: 22.74 },
  { symbol: 'BTC', name: 'Bitcoin', type: 'Titre', kind: 'crypto', icon: '₿', color: '#f7931a', units: 0.00026, valueEur: 15.01, weightPct: 28.3 },
  { symbol: 'SHOP', name: 'Shopify (A)', type: 'Titre', kind: 'equity', icon: '🛍️', color: '#95f28f', units: 0.142348, valueEur: 13.87, weightPct: 30.66 },
  { symbol: 'TTD', name: 'The Trade Desk (A)', type: 'Titre', kind: 'equity', icon: '📊', color: '#b892ff', units: 0.610035, valueEur: 12.48, weightPct: 37.61 },
  { symbol: 'TSLA', name: 'Tesla', type: 'Titre', kind: 'equity', icon: '⚡', color: '#ff6464', units: 0.0255, valueEur: 8.56, weightPct: 12.33 },
]

const AUTH_KEY = 'dashboard-auth'
const AUTH_TOKEN_KEY = 'dashboard-token'
const REFRESH_INTERVAL_MS = 3 * 60 * 60 * 1000
const NEWS_PAGE_SIZE = 12
const authApiBaseUrl = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '')

const activeSession = ref<'market' | 'news'>('market')

const loading = ref(false)
const errorMessage = ref('')
const warningMessage = ref('')
const authError = ref('')
const lastUpdated = ref('')
const rows = ref<DashboardRow[]>([])
const dataSource = ref<'external-api' | 'db-cache' | 'db-cache-stale'>('db-cache')
const lastDataAtMs = ref<number | null>(null)

const newsLoading = ref(false)
const newsError = ref('')
const newsLastUpdated = ref('')
const newsDataSource = ref<'external-api' | 'db-cache' | 'db-cache-stale'>('db-cache')
const newsLastDataAtMs = ref<number | null>(null)
const newsArticles = ref<NewsArticle[]>([])
const selectedNewsCategory = ref<'all' | NewsCategory>('all')
const newsDateFrom = ref('')
const newsDateTo = ref('')
const newsPage = ref(1)

const newsCategoryOptions: { id: 'all' | NewsCategory; label: string }[] = [
  { id: 'all', label: 'Toutes' },
  { id: 'bourse', label: 'Bourse' },
  { id: 'economie', label: 'Économie' },
  { id: 'crypto', label: 'Crypto' },
  { id: 'tech', label: 'Tech' },
  { id: 'entreprises', label: 'Entreprises' },
  { id: 'autres', label: 'Autres' },
]

const nowMs = ref(Date.now())
let refreshClock: number | undefined

const username = ref('')
const password = ref('')
const isAuthenticated = ref(Boolean(sessionStorage.getItem(AUTH_TOKEN_KEY)))
const selectedAsset = ref<DashboardRow | null>(null)
const modalRange = ref<'5d' | '1m' | '3m' | 'max'>('1m')

const modalRangeOptions: Array<{ id: '5d' | '1m' | '3m' | 'max'; label: string; days?: number }> = [
  { id: '5d', label: '5j', days: 5 },
  { id: '1m', label: '1m', days: 30 },
  { id: '3m', label: '3m', days: 90 },
  { id: 'max', label: 'Max' },
]

const etfRows = computed(() => rows.value.filter((entry) => entry.type === 'ETF'))
const titleRows = computed(() => rows.value.filter((entry) => entry.type === 'Titre'))

const marketBias = computed(() => {
  if (!rows.value.length) {
    return 'Neutre'
  }

  const avg = rows.value.reduce((total, row) => total + row.dailyChangePct, 0) / rows.value.length

  if (avg > 0.25) {
    return 'Risque ON'
  }

  if (avg < -0.25) {
    return 'Risque OFF'
  }

  return 'Neutre'
})

const canRefresh = computed(() => {
  if (lastDataAtMs.value === null) {
    return true
  }

  return nowMs.value - lastDataAtMs.value >= REFRESH_INTERVAL_MS
})

const canRefreshNews = computed(() => {
  if (newsLastDataAtMs.value === null) {
    return true
  }

  return nowMs.value - newsLastDataAtMs.value >= REFRESH_INTERVAL_MS
})

function formatRemaining(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  const pad = (value: number) => value.toString().padStart(2, '0')
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
}

const nextRefreshLabel = computed(() => {
  if (canRefresh.value || lastDataAtMs.value === null) {
    return ''
  }

  return formatRemaining(REFRESH_INTERVAL_MS - (nowMs.value - lastDataAtMs.value))
})

const nextNewsRefreshLabel = computed(() => {
  if (canRefreshNews.value || newsLastDataAtMs.value === null) {
    return ''
  }

  return formatRemaining(REFRESH_INTERVAL_MS - (nowMs.value - newsLastDataAtMs.value))
})

const filteredNewsArticles = computed(() => {
  let filtered = newsArticles.value

  if (selectedNewsCategory.value !== 'all') {
    filtered = filtered.filter((article) => article.category === selectedNewsCategory.value)
  }

  const hasFrom = Boolean(newsDateFrom.value)
  const hasTo = Boolean(newsDateTo.value)

  if (!hasFrom && !hasTo) {
    return filtered
  }

  const fromTs = hasFrom ? new Date(`${newsDateFrom.value}T00:00:00`).getTime() : Number.NEGATIVE_INFINITY
  const toTs = hasTo ? new Date(`${newsDateTo.value}T23:59:59.999`).getTime() : Number.POSITIVE_INFINITY

  if (!Number.isFinite(fromTs) || !Number.isFinite(toTs)) {
    return filtered
  }

  return filtered.filter((article) => {
    const publishedTs = new Date(article.publishedAt).getTime()
    if (!Number.isFinite(publishedTs)) {
      return false
    }
    return publishedTs >= fromTs && publishedTs <= toTs
  })
})

const newsTotalPages = computed(() => Math.max(1, Math.ceil(filteredNewsArticles.value.length / NEWS_PAGE_SIZE)))

const paginatedNewsArticles = computed(() => {
  const start = (newsPage.value - 1) * NEWS_PAGE_SIZE
  return filteredNewsArticles.value.slice(start, start + NEWS_PAGE_SIZE)
})

function formatPercent(value: number) {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`
}

function formatNumber(value: number, maxFractionDigits = 2) {
  return value.toLocaleString('fr-FR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxFractionDigits,
  })
}

function buildFallbackSeries(baseValue: number): number[] {
  const base = baseValue > 0 ? baseValue : 100
  return Array.from({ length: 30 }, (_, index) => base * (0.95 + (index / 29) * 0.08))
}

function extractCloses(entry: EtfTimeSeries): number[] {
  if (Array.isArray(entry.closes) && entry.closes.length >= 2) {
    return entry.closes
  }

  if (!entry.raw || typeof entry.raw !== 'object') {
    return []
  }

  const raw = entry.raw as Record<string, unknown>

  if (entry.provider === 'alpha_vantage') {
    const daily = raw['Time Series (Daily)'] as Record<string, { '4. close': string }> | undefined
    if (daily && typeof daily === 'object') {
      return Object.entries(daily)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([, values]) => Number.parseFloat(values['4. close']))
        .filter((value) => Number.isFinite(value))
        .slice(-30)
    }

    const crypto = raw['Time Series (Digital Currency Daily)'] as Record<
      string,
      { '4b. close (EUR)': string }
    > | undefined
    if (crypto && typeof crypto === 'object') {
      return Object.entries(crypto)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([, values]) => Number.parseFloat(values['4b. close (EUR)']))
        .filter((value) => Number.isFinite(value))
        .slice(-30)
    }
  }

  if (entry.provider === 'finnhub') {
    const c = raw.c
    if (Array.isArray(c)) {
      return c.filter((value): value is number => typeof value === 'number' && Number.isFinite(value)).slice(-30)
    }
  }

  if (entry.provider === 'yahoo') {
    const chart = (raw as { chart?: { result?: Array<{ indicators?: { quote?: Array<{ close?: Array<number | null> }> } }> } }).chart
    const closes = chart?.result?.[0]?.indicators?.quote?.[0]?.close
    if (Array.isArray(closes)) {
      return closes.filter((value): value is number => typeof value === 'number' && Number.isFinite(value)).slice(-30)
    }
  }

  return []
}

type DatedPoint = { ts: number; close: number }

function buildSyntheticDatedSeries(closes: number[], anchorTs = Date.now()): DatedPoint[] {
  const dayMs = 24 * 60 * 60 * 1000
  return closes.map((close, index) => ({
    ts: anchorTs - (closes.length - 1 - index) * dayMs,
    close,
  }))
}

function getDatedSeriesFromRaw(row: DashboardRow): DatedPoint[] {
  if (!row.raw || typeof row.raw !== 'object') {
    const anchorTs = lastDataAtMs.value ?? Date.now()
    return buildSyntheticDatedSeries(row.closes, anchorTs)
  }

  const raw = row.raw as Record<string, unknown>

  if (row.provider === 'alpha_vantage') {
    const daily = raw['Time Series (Daily)'] as Record<string, { '4. close': string }> | undefined
    if (daily && typeof daily === 'object') {
      return Object.entries(daily)
        .map(([date, values]) => ({
          ts: new Date(date).getTime(),
          close: Number.parseFloat(values['4. close']),
        }))
        .filter((entry) => Number.isFinite(entry.ts) && Number.isFinite(entry.close))
        .sort((a, b) => a.ts - b.ts)
    }

    const crypto = raw['Time Series (Digital Currency Daily)'] as Record<
      string,
      { '4b. close (EUR)': string }
    > | undefined
    if (crypto && typeof crypto === 'object') {
      return Object.entries(crypto)
        .map(([date, values]) => ({
          ts: new Date(date).getTime(),
          close: Number.parseFloat(values['4b. close (EUR)']),
        }))
        .filter((entry) => Number.isFinite(entry.ts) && Number.isFinite(entry.close))
        .sort((a, b) => a.ts - b.ts)
    }
  }

  if (row.provider === 'finnhub') {
    const c = raw.c as unknown
    const t = raw.t as unknown
    if (Array.isArray(c) && Array.isArray(t)) {
      return c
        .map((close, index) => ({ close, ts: t[index] }))
        .filter((entry) => typeof entry.close === 'number' && Number.isFinite(entry.close) && typeof entry.ts === 'number')
        .map((entry) => ({ close: entry.close as number, ts: (entry.ts as number) * 1000 }))
    }
  }

  if (row.provider === 'yahoo') {
    const chart = (raw as {
      chart?: {
        result?: Array<{
          timestamp?: number[]
          indicators?: { quote?: Array<{ close?: Array<number | null> }> }
        }>
      }
    }).chart
    const result = chart?.result?.[0]
    const timestamps = result?.timestamp
    const closes = result?.indicators?.quote?.[0]?.close
    if (Array.isArray(timestamps) && Array.isArray(closes)) {
      return closes
        .map((close, index) => ({ close, ts: timestamps[index] }))
        .filter((entry) => typeof entry.close === 'number' && Number.isFinite(entry.close) && typeof entry.ts === 'number')
        .map((entry) => ({ close: entry.close as number, ts: (entry.ts as number) * 1000 }))
    }
  }

  const anchorTs = lastDataAtMs.value ?? Date.now()
  return buildSyntheticDatedSeries(row.closes, anchorTs)
}

const modalSeries = computed(() => {
  if (!selectedAsset.value) {
    return [] as DatedPoint[]
  }

  const series = getDatedSeriesFromRaw(selectedAsset.value)
  if (!series.length) {
    return []
  }

  const selected = modalRangeOptions.find((option) => option.id === modalRange.value)
  if (!selected?.days) {
    return series
  }

  const anchorTs = series[series.length - 1]?.ts ?? Date.now()
  const cutoff = anchorTs - selected.days * 24 * 60 * 60 * 1000
  const filtered = series.filter((point) => point.ts >= cutoff)
  return filtered.length >= 2 ? filtered : series.slice(-Math.min(series.length, 30))
})

const modalChartPoints = computed(() => modalSeries.value.map((point) => point.close))

const modalPeriodChangePct = computed(() => {
  if (modalSeries.value.length < 2) {
    return 0
  }
  const first = modalSeries.value[0]?.close ?? 0
  const last = modalSeries.value[modalSeries.value.length - 1]?.close ?? 0
  if (first === 0) {
    return 0
  }
  return ((last - first) / first) * 100
})

const modalSeriesMeta = computed(() => {
  if (!modalSeries.value.length) {
    return { points: 0, from: '', to: '' }
  }

  const from = modalSeries.value[0]?.ts
  const to = modalSeries.value[modalSeries.value.length - 1]?.ts

  return {
    points: modalSeries.value.length,
    from: typeof from === 'number' && Number.isFinite(from) ? new Date(from).toLocaleDateString('fr-FR') : '',
    to: typeof to === 'number' && Number.isFinite(to) ? new Date(to).toLocaleDateString('fr-FR') : '',
  }
})

const modalMarketUpdatedAt = computed(() => {
  if (lastDataAtMs.value === null) {
    return 'n/a'
  }

  return new Date(lastDataAtMs.value).toLocaleString('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'medium',
  })
})

function mapRowsFromSeries(series: EtfTimeSeries[]): DashboardRow[] {
  const bySymbol = new Map(series.map((entry) => [entry.symbol, entry]))

  return assetList.map((asset) => {
    const sourceSeries = bySymbol.get(asset.symbol)
    const parsedCloses = sourceSeries ? extractCloses(sourceSeries) : []
    const closes = parsedCloses.length ? parsedCloses : buildFallbackSeries(asset.valueEur)

    const latest = closes[closes.length - 1] ?? 0
    const previous = closes[closes.length - 2] ?? latest
    const first = closes[0] ?? latest

    return {
      ...asset,
      closes,
      price: latest,
      dailyChangePct: previous !== 0 ? ((latest - previous) / previous) * 100 : 0,
      monthChangePct: first !== 0 ? ((latest - first) / first) * 100 : 0,
      provider: sourceSeries?.provider,
      raw: sourceSeries?.raw,
    }
  })
}

function applyLastDataTimestamp(rawDate: string) {
  const parsed = new Date(rawDate).getTime()
  lastDataAtMs.value = Number.isFinite(parsed) ? parsed : null
}

function applyNewsLastDataTimestamp(rawDate: string) {
  const parsed = new Date(rawDate).getTime()
  newsLastDataAtMs.value = Number.isFinite(parsed) ? parsed : null
}

function getAuthToken() {
  return sessionStorage.getItem(AUTH_TOKEN_KEY) || ''
}

async function parseJsonResponse<T>(response: Response, context: string): Promise<T> {
  const raw = await response.text()
  try {
    return JSON.parse(raw) as T
  } catch {
    const preview = raw.slice(0, 120).replace(/\s+/g, ' ')
    throw new Error(
      `${context}: réponse non JSON (${response.status}) depuis ${response.url}. ` +
        `Vérifie VITE_API_BASE_URL (actuel: ${authApiBaseUrl}). Début réponse: ${preview}`
    )
  }
}

async function refreshDashboard() {
  if (!isAuthenticated.value) {
    return
  }

  loading.value = true
  errorMessage.value = ''
  warningMessage.value = ''

  try {
    const token = getAuthToken()
    const response = await fetch(`${authApiBaseUrl}/data/markets`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    const payload = await parseJsonResponse<MarketsApiResponse & { message?: string }>(
      response,
      'Erreur marchés'
    )
    if (!response.ok) {
      throw new Error(payload.message || 'Erreur API marchés.')
    }

    rows.value = mapRowsFromSeries(payload.data || [])
    dataSource.value = (payload.source || 'db-cache') as 'external-api' | 'db-cache' | 'db-cache-stale'
    lastUpdated.value = `${new Date(payload.savedAt).toLocaleString('fr-FR')} (${payload.source})`
    applyLastDataTimestamp(payload.savedAt)

    if (payload.failures?.length) {
      warningMessage.value = `Données indisponibles pour: ${payload.failures.join(', ')}`
    }
  } catch (error) {
    rows.value = []
    errorMessage.value = error instanceof Error ? error.message : 'Erreur inconnue.'
  } finally {
    loading.value = false
  }
}

async function refreshNewsSession(forceApi = false) {
  if (!isAuthenticated.value) {
    return
  }

  newsLoading.value = true
  newsError.value = ''

  try {
    const token = getAuthToken()
    const query = forceApi ? '?force=1' : ''
    const response = await fetch(`${authApiBaseUrl}/data/news${query}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
    const payload = await parseJsonResponse<NewsApiResponse & { message?: string }>(
      response,
      'Erreur actualités'
    )

    if (!response.ok) {
      throw new Error(payload.message || 'Erreur API actualités.')
    }

    newsArticles.value = payload.data || []
    newsDataSource.value = (payload.source || 'db-cache') as 'external-api' | 'db-cache' | 'db-cache-stale'
    newsLastUpdated.value = `${new Date(payload.savedAt).toLocaleString('fr-FR')} (${payload.source})`
    applyNewsLastDataTimestamp(payload.savedAt)
  } catch (error) {
    newsArticles.value = []
    newsError.value = error instanceof Error ? error.message : 'Erreur inconnue.'
  } finally {
    newsLoading.value = false
  }
}

async function submitLogin() {
  authError.value = ''

  if (!username.value.trim() || !password.value) {
    authError.value = 'Email et mot de passe requis.'
    return
  }

  try {
    const response = await fetch(`${authApiBaseUrl}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: username.value.trim(),
        password: password.value,
      }),
    })

    const data = await parseJsonResponse<{ token?: string; message?: string }>(response, 'Erreur login')
    if (!response.ok || !data?.token) {
      authError.value = data?.message || 'Identifiants invalides.'
      return
    }

    sessionStorage.setItem(AUTH_TOKEN_KEY, data.token)
    sessionStorage.setItem(AUTH_KEY, '1')
    isAuthenticated.value = true
    void refreshDashboard()
    void refreshNewsSession()
    return
  } catch (_error) {
    authError.value = "Impossible de contacter l'API d'authentification."
  }
}

function logout() {
  sessionStorage.removeItem(AUTH_KEY)
  sessionStorage.removeItem(AUTH_TOKEN_KEY)
  isAuthenticated.value = false
  username.value = ''
  password.value = ''
  rows.value = []
  errorMessage.value = ''
  warningMessage.value = ''
  newsArticles.value = []
  newsError.value = ''
  selectedAsset.value = null
}

function openAssetModal(row: DashboardRow) {
  modalRange.value = '1m'
  selectedAsset.value = row
}

function closeAssetModal() {
  selectedAsset.value = null
}

function resetNewsDateFilters() {
  newsDateFrom.value = ''
  newsDateTo.value = ''
}

function goToNewsPage(page: number) {
  const bounded = Math.min(Math.max(page, 1), newsTotalPages.value)
  newsPage.value = bounded
}

watch(
  () => [selectedNewsCategory.value, newsDateFrom.value, newsDateTo.value, newsArticles.value.length],
  () => {
    newsPage.value = 1
  }
)

watch(newsTotalPages, (total) => {
  if (newsPage.value > total) {
    newsPage.value = total
  }
})

onMounted(() => {
  refreshClock = window.setInterval(() => {
    nowMs.value = Date.now()
  }, 1000)

  if (isAuthenticated.value) {
    void refreshDashboard()
    void refreshNewsSession()
  }
})

onUnmounted(() => {
  if (refreshClock !== undefined) {
    clearInterval(refreshClock)
  }
})
</script>

<template>
  <main class="page">
    <section v-if="!isAuthenticated" class="login-wrap">
      <form class="login-card" @submit.prevent="submitLogin">
        <p class="eyebrow">ACCES SECURISE</p>
        <h1>Connexion Dashboard</h1>
        <p class="subtitle">Entrez vos identifiants pour afficher Marchés et Actualités.</p>

        <label class="field">
          <span>Email</span>
          <input v-model="username" type="text" autocomplete="username" />
        </label>

        <label class="field">
          <span>Password</span>
          <input v-model="password" type="password" autocomplete="current-password" />
        </label>

        <p v-if="authError" class="state state-error">{{ authError }}</p>

        <button class="refresh" type="submit">Se connecter</button>
      </form>
    </section>

    <template v-else>
      <header class="hero">
        <div>
          <p class="eyebrow">ALPHA VANTAGE + NEWS API</p>
          <h1>Dashboard Marchés & Actualités</h1>
          <p class="subtitle">Session française avec cache base de données (3h).</p>
        </div>

        <div class="hero-actions">
          <div class="session-switch">
            <button class="session-btn" :class="activeSession === 'market' ? 'active' : ''" @click="activeSession = 'market'">Marchés</button>
            <button class="session-btn" :class="activeSession === 'news' ? 'active' : ''" @click="activeSession = 'news'">Actualités</button>
          </div>
          <button class="logout" @click="logout">Déconnexion</button>
        </div>
      </header>

      <template v-if="activeSession === 'market'">
        <div class="toolbar">
          <div class="badge">Biais marché: {{ marketBias }}</div>
          <button class="refresh" :disabled="loading || !canRefresh" @click="refreshDashboard">
            {{ loading ? 'Chargement...' : 'Actualiser marchés' }}
          </button>
        </div>
        <p v-if="!canRefresh && nextRefreshLabel" class="cooldown">
          Actualisation marchés disponible dans: {{ nextRefreshLabel }}
        </p>

        <section v-if="errorMessage" class="state state-error">{{ errorMessage }}</section>
        <section v-else-if="loading" class="market-loader" aria-live="polite" aria-busy="true">
          <div class="loader-head">
            <span class="loader-spinner" />
            <p>Chargement du dashboard markets...</p>
          </div>
          <div class="loader-grid">
            <article v-for="card in 6" :key="card" class="loader-card">
              <div class="loader-line loader-line-lg" />
              <div class="loader-line loader-line-md" />
              <div class="loader-chart" />
              <div class="loader-line loader-line-sm" />
            </article>
          </div>
        </section>
        <section v-else>
          <p v-if="warningMessage" class="state state-warning">{{ warningMessage }}</p>

          <h2 class="section-title">ETF</h2>
          <section class="grid">
            <article
              v-for="row in etfRows"
              :key="row.symbol"
              class="card clickable"
              :style="{ '--asset-color': row.color }"
              @click="openAssetModal(row)"
            >
              <div class="card-top">
                <div class="asset-head">
                  <div class="asset-icon">{{ row.icon }}</div>
                  <div>
                    <p class="symbol">{{ row.symbol }}</p>
                    <h3>{{ row.name }}</h3>
                  </div>
                  <p class="category">Type: {{ row.type }}</p>
                </div>
                <div class="price-block">
                  <p class="price">{{ formatNumber(row.price) }}</p>
                  <p class="daily" :class="row.dailyChangePct >= 0 ? 'up' : 'down'">
                    {{ formatPercent(row.dailyChangePct) }} (1j)
                  </p>
                </div>
              </div>

              <SparklineChart :points="row.closes" :stroke="row.color" />

              <div class="footer">
                <p>Quantité: {{ formatNumber(row.units, 6) }}</p>
                <p>Valeur: {{ formatNumber(row.valueEur) }} €</p>
                <p v-if="row.weightPct !== undefined">Poids: {{ formatPercent(row.weightPct) }}</p>
              </div>
            </article>
          </section>

          <h2 class="section-title">Titres</h2>
          <section class="grid">
            <article
              v-for="row in titleRows"
              :key="row.symbol"
              class="card clickable"
              :style="{ '--asset-color': row.color }"
              @click="openAssetModal(row)"
            >
              <div class="card-top">
                <div class="asset-head">
                  <div class="asset-icon">{{ row.icon }}</div>
                  <div>
                    <p class="symbol">{{ row.symbol }}</p>
                    <h3>{{ row.name }}</h3>
                  </div>
                  <p class="category">Type: {{ row.kind === 'crypto' ? 'Crypto' : 'Action' }}</p>
                </div>
                <div class="price-block">
                  <p class="price">{{ formatNumber(row.price) }}</p>
                  <p class="daily" :class="row.dailyChangePct >= 0 ? 'up' : 'down'">
                    {{ formatPercent(row.dailyChangePct) }} (1j)
                  </p>
                </div>
              </div>

              <SparklineChart :points="row.closes" :stroke="row.color" />

              <div class="footer">
                <p>Quantité: {{ formatNumber(row.units, 6) }}</p>
                <p>Valeur: {{ formatNumber(row.valueEur) }} €</p>
                <p v-if="row.weightPct !== undefined">Poids: {{ formatPercent(row.weightPct) }}</p>
              </div>
            </article>
          </section>
        </section>

        <footer class="meta">Marchés · Dernière mise à jour: {{ lastUpdated || 'n/a' }} · Source: {{ dataSource }}</footer>
      </template>

      <template v-else>
        <div class="toolbar">
          <div class="badge">Actualités FR</div>
          <button class="refresh" :disabled="newsLoading || !canRefreshNews" @click="refreshNewsSession(true)">
            {{ newsLoading ? 'Chargement...' : 'Actualiser actualités' }}
          </button>
        </div>
        <p v-if="!canRefreshNews && nextNewsRefreshLabel" class="cooldown">
          Actualisation actualités disponible dans: {{ nextNewsRefreshLabel }}
        </p>
        <div class="news-categories">
          <button
            v-for="option in newsCategoryOptions"
            :key="option.id"
            class="news-cat-btn"
            :class="selectedNewsCategory === option.id ? 'active' : ''"
            @click="selectedNewsCategory = option.id"
          >
            {{ option.label }}
          </button>
        </div>
        <div class="news-date-filters">
          <label class="news-date-field">
            <span>Publié du</span>
            <input v-model="newsDateFrom" type="date" />
          </label>
          <label class="news-date-field">
            <span>Publié au</span>
            <input v-model="newsDateTo" type="date" />
          </label>
          <button
            class="news-reset-btn"
            :disabled="!newsDateFrom && !newsDateTo"
            @click="resetNewsDateFilters"
          >
            Réinitialiser
          </button>
        </div>

        <section v-if="newsError" class="state state-error">{{ newsError }}</section>
        <section v-else-if="newsLoading" class="state">Chargement des actualités...</section>
        <section v-else-if="!filteredNewsArticles.length" class="state">Aucun article pour cette catégorie.</section>
        <section v-else class="news-grid">
          <article v-for="article in paginatedNewsArticles" :key="article.url" class="news-card">
            <img v-if="article.imageUrl" :src="article.imageUrl" :alt="article.title" class="news-image" />
            <div class="news-content">
              <p class="news-source">{{ article.source }} · {{ new Date(article.publishedAt).toLocaleString('fr-FR') }}</p>
              <h3 class="news-title">{{ article.title }}</h3>
              <p class="news-desc">{{ article.description }}</p>
              <a :href="article.url" target="_blank" rel="noopener" class="news-link">Lire l'article</a>
            </div>
          </article>
        </section>
        <nav v-if="filteredNewsArticles.length > NEWS_PAGE_SIZE" class="news-pagination" aria-label="Pagination actualités">
          <button class="news-page-btn" :disabled="newsPage <= 1" @click="goToNewsPage(newsPage - 1)">
            Précédent
          </button>
          <p class="news-page-label">Page {{ newsPage }} / {{ newsTotalPages }}</p>
          <button class="news-page-btn" :disabled="newsPage >= newsTotalPages" @click="goToNewsPage(newsPage + 1)">
            Suivant
          </button>
        </nav>

        <footer class="meta">Actualités · Dernière mise à jour: {{ newsLastUpdated || 'n/a' }} · Source: {{ newsDataSource }}</footer>
      </template>
    </template>
    <section v-if="selectedAsset" class="modal-backdrop" @click.self="closeAssetModal">
      <article class="modal-card">
        <header class="modal-head">
          <div>
            <p class="symbol">{{ selectedAsset.symbol }}</p>
            <h3>{{ selectedAsset.icon }} {{ selectedAsset.name }}</h3>
            <p class="category">Provider: {{ selectedAsset.provider || 'inconnu' }}</p>
          </div>
          <button class="logout" @click="closeAssetModal">Fermer</button>
        </header>

        <div class="modal-filters">
          <button
            v-for="option in modalRangeOptions"
            :key="option.id"
            class="news-cat-btn"
            :class="modalRange === option.id ? 'active' : ''"
            @click="modalRange = option.id"
          >
            {{ option.label }}
          </button>
        </div>

        <SparklineChart
          :key="`${selectedAsset.symbol}-${modalRange}-${modalChartPoints.length}`"
          :points="modalChartPoints.length ? modalChartPoints : selectedAsset.closes"
          :stroke="selectedAsset.color"
        />

        <div class="modal-stats">
          <p>Mise à jour données: {{ modalMarketUpdatedAt }}</p>
          <p>Période: {{ modalRange.toUpperCase() }}</p>
          <p>Points: {{ modalSeriesMeta.points }}</p>
          <p>De: {{ modalSeriesMeta.from || 'n/a' }}</p>
          <p>À: {{ modalSeriesMeta.to || 'n/a' }}</p>
          <p>Prix: {{ formatNumber(selectedAsset.price) }}</p>
          <p>Variation 1j: {{ formatPercent(selectedAsset.dailyChangePct) }}</p>
          <p>Variation 30j: {{ formatPercent(selectedAsset.monthChangePct) }}</p>
          <p>Variation période: {{ formatPercent(modalPeriodChangePct) }}</p>
          <p>Valeur: {{ formatNumber(selectedAsset.valueEur) }} €</p>
        </div>

        <details class="raw-box">
          <summary>Données API complètes (raw)</summary>
          <pre>{{ JSON.stringify(selectedAsset.raw || {}, null, 2) }}</pre>
        </details>
      </article>
    </section>
  </main>
</template>

<style scoped>
:global(*) { box-sizing: border-box; }

:global(body) {
  margin: 0;
  min-height: 100vh;
  font-family: 'Space Grotesk', 'Segoe UI', sans-serif;
  background:
    radial-gradient(circle at 15% 20%, rgba(40, 95, 210, 0.25), transparent 35%),
    radial-gradient(circle at 85% 10%, rgba(0, 179, 120, 0.2), transparent 30%),
    #05070c;
  color: #f6f8ff;
}

.page { max-width: 1180px; margin: 0 auto; padding: 2rem 1.25rem 2.5rem; }
.login-wrap { min-height: calc(100vh - 4rem); display: grid; place-items: center; }
.login-card {
  width: min(440px, 100%);
  padding: 1.3rem;
  border-radius: 1rem;
  border: 1px solid #273450;
  background: linear-gradient(165deg, rgba(17, 25, 46, 0.94), rgba(9, 14, 24, 0.94));
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.28);
}

.field { display: grid; gap: 0.35rem; margin: 0.9rem 0; }
.field span { color: #b7c8ff; font-size: 0.9rem; }
.field input {
  border: 1px solid #2f3b59;
  border-radius: 0.7rem;
  padding: 0.65rem 0.75rem;
  background: #0b1122;
  color: #f6f8ff;
}

.hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
}

.eyebrow { letter-spacing: 0.12em; color: #8da6ff; margin: 0; font-size: 0.75rem; }
h1 { margin: 0.45rem 0; font-size: clamp(1.8rem, 2.8vw, 2.7rem); }
h3 { margin: 0.4rem 0 0.35rem; font-size: 1.04rem; }
.subtitle { margin: 0; color: #acc0ff; }

.hero-actions { display: flex; gap: 0.75rem; align-items: center; }
.session-switch {
  display: inline-flex;
  border: 1px solid #2d3857;
  border-radius: 0.8rem;
  overflow: hidden;
}
.session-btn {
  border: 0;
  background: #111a30;
  color: #9eb4e8;
  padding: 0.55rem 0.9rem;
  cursor: pointer;
}
.session-btn.active {
  background: linear-gradient(130deg, #2ad4ff, #36f2a9);
  color: #04101c;
  font-weight: 700;
}

.toolbar { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.4rem; }

.badge {
  padding: 0.55rem 0.8rem;
  border-radius: 999px;
  border: 1px solid #2d3857;
  background: rgba(8, 14, 30, 0.78);
  color: #b7c8ff;
  white-space: nowrap;
}

.refresh,
.logout {
  border: 0;
  border-radius: 0.8rem;
  font-weight: 700;
  padding: 0.65rem 1rem;
  cursor: pointer;
}

.refresh { background: linear-gradient(130deg, #2ad4ff, #36f2a9); color: #04101c; }
.logout { background: #1a2642; color: #c8d6ff; border: 1px solid #2c3b60; }

.refresh:disabled { opacity: 0.65; cursor: not-allowed; }

.cooldown { margin: 0 0 1rem; color: #9eb4e8; font-size: 0.88rem; }
.news-categories {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  margin: 0 0 1rem;
}
.news-date-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  align-items: end;
  margin: 0 0 1rem;
}
.news-date-field {
  display: grid;
  gap: 0.3rem;
}
.news-date-field span {
  color: #9eb4e8;
  font-size: 0.8rem;
}
.news-date-field input {
  border: 1px solid #2c3b60;
  border-radius: 0.6rem;
  background: #111a30;
  color: #d9eeff;
  padding: 0.45rem 0.55rem;
  min-height: 2.2rem;
}
.news-reset-btn {
  border: 1px solid #2c3b60;
  border-radius: 0.6rem;
  background: #141f3a;
  color: #b8cff8;
  padding: 0.45rem 0.75rem;
  min-height: 2.2rem;
  cursor: pointer;
}
.news-reset-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.news-cat-btn {
  border: 1px solid #2c3b60;
  border-radius: 999px;
  background: #111a30;
  color: #9eb4e8;
  padding: 0.35rem 0.75rem;
  font-size: 0.8rem;
  cursor: pointer;
}
.news-cat-btn.active {
  background: #1a3f66;
  border-color: #3fa7ff;
  color: #d9eeff;
}
.state {
  padding: 1rem;
  border-radius: 0.9rem;
  border: 1px solid #2f3b59;
  background: rgba(10, 16, 32, 0.72);
  margin-bottom: 1rem;
}
.market-loader {
  padding: 1rem;
  border-radius: 0.9rem;
  border: 1px solid #2f3b59;
  background: rgba(10, 16, 32, 0.72);
  margin-bottom: 1rem;
}
.loader-head {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  margin-bottom: 1rem;
  color: #c8d6ff;
}
.loader-head p {
  margin: 0;
  font-size: 0.95rem;
}
.loader-spinner {
  width: 1rem;
  height: 1rem;
  border-radius: 999px;
  border: 2px solid rgba(173, 200, 255, 0.3);
  border-top-color: #36f2a9;
  animation: spin 0.75s linear infinite;
}
.loader-grid {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(auto-fit, minmax(255px, 1fr));
}
.loader-card {
  border-radius: 1rem;
  border: 1px solid #2a3554;
  padding: 0.9rem;
  background: linear-gradient(165deg, rgba(17, 25, 46, 0.72), rgba(9, 14, 24, 0.72));
}
.loader-line,
.loader-chart {
  position: relative;
  overflow: hidden;
  border-radius: 0.6rem;
  background: #172440;
}
.loader-line::after,
.loader-chart::after {
  content: '';
  position: absolute;
  inset: 0;
  transform: translateX(-100%);
  background: linear-gradient(90deg, transparent, rgba(102, 205, 255, 0.22), transparent);
  animation: shimmer 1.2s ease-in-out infinite;
}
.loader-line {
  height: 0.6rem;
  margin-bottom: 0.5rem;
}
.loader-line-lg { width: 74%; }
.loader-line-md { width: 52%; }
.loader-line-sm {
  width: 38%;
  margin-bottom: 0;
}
.loader-chart {
  height: 4.4rem;
  margin: 0.8rem 0;
}
.state-error { color: #ffbac7; border-color: #8f2f4d; }
.state-warning { color: #ffe9a8; border-color: #6f5f2a; }

.section-title { margin: 1.2rem 0 0.8rem; font-size: 1.25rem; color: #c8d6ff; }
.grid { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(255px, 1fr)); }

.card {
  --asset-color: #4dd0ff;
  padding: 1rem;
  border-radius: 1rem;
  border: 1px solid color-mix(in srgb, var(--asset-color) 45%, #273450);
  border-left: 4px solid var(--asset-color);
  background: linear-gradient(165deg, rgba(17, 25, 46, 0.94), rgba(9, 14, 24, 0.94));
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.28), 0 0 0 1px color-mix(in srgb, var(--asset-color) 22%, transparent);
}
.card.clickable {
  cursor: pointer;
}
.card.clickable:hover {
  transform: translateY(-2px);
}

.card-top { display: flex; justify-content: space-between; gap: 0.8rem; }
.asset-head {
  display: grid;
  grid-template-columns: 2rem 1fr;
  gap: 0.55rem;
}
.asset-icon {
  width: 2rem;
  height: 2rem;
  border-radius: 0.65rem;
  display: grid;
  place-items: center;
  font-size: 1rem;
  background: color-mix(in srgb, var(--asset-color) 25%, #0f162b);
  border: 1px solid color-mix(in srgb, var(--asset-color) 55%, #2a3554);
}
.symbol { margin: 0; font-size: 0.78rem; letter-spacing: 0.15em; color: #95a5cf; }
.category { margin: 0; color: #8ea4db; font-size: 0.84rem; }
.price-block { text-align: right; }
.price { margin: 0; font-size: 1.25rem; font-weight: 700; }
.daily { margin: 0.3rem 0 0; font-size: 0.88rem; }
.footer { margin-top: 0.25rem; color: #9cb2e5; font-size: 0.88rem; }
.footer p { margin: 0.2rem 0; }

.news-grid {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
}

.news-card {
  border: 1px solid #273450;
  border-radius: 1rem;
  overflow: hidden;
  background: linear-gradient(165deg, rgba(17, 25, 46, 0.94), rgba(9, 14, 24, 0.94));
}

.news-image {
  width: 100%;
  height: 160px;
  object-fit: cover;
  background: #111a30;
}

.news-content { padding: 0.9rem; }
.news-source { margin: 0; color: #8ea4db; font-size: 0.78rem; }
.news-title { margin: 0.45rem 0; font-size: 1rem; }
.news-desc { margin: 0; color: #c9d6f8; font-size: 0.9rem; }
.news-link { display: inline-block; margin-top: 0.65rem; color: #49d4ff; text-decoration: none; }
.news-pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  margin-top: 1rem;
}
.news-page-btn {
  border: 1px solid #2c3b60;
  border-radius: 0.65rem;
  background: #141f3a;
  color: #d9eeff;
  min-width: 6.8rem;
  padding: 0.45rem 0.75rem;
  cursor: pointer;
}
.news-page-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.news-page-label {
  margin: 0;
  color: #9eb4e8;
  font-size: 0.9rem;
}

.up { color: #37e7a8; }
.down { color: #ff7d9d; }
.meta { margin-top: 1.25rem; color: #8097cd; font-size: 0.86rem; }

.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(2, 6, 16, 0.72);
  backdrop-filter: blur(4px);
  display: grid;
  place-items: center;
  padding: 1rem;
  z-index: 50;
}
.modal-card {
  width: min(900px, 100%);
  max-height: 90vh;
  overflow: auto;
  border-radius: 1rem;
  border: 1px solid #2f3b59;
  background: linear-gradient(165deg, rgba(17, 25, 46, 0.98), rgba(9, 14, 24, 0.98));
  padding: 1rem;
}
.modal-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.6rem;
}
.modal-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 0.45rem;
  margin: 0.8rem 0;
  color: #c8d6ff;
}
.modal-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  margin: 0.55rem 0 0.7rem;
}
.raw-box {
  margin-top: 0.6rem;
  border: 1px solid #2f3b59;
  border-radius: 0.7rem;
  padding: 0.6rem;
  background: #0c1429;
}
.raw-box summary {
  cursor: pointer;
  color: #9eb4e8;
}
.raw-box pre {
  margin: 0.6rem 0 0;
  white-space: pre-wrap;
  word-break: break-word;
  color: #b8cff8;
  font-size: 0.78rem;
}

@media (max-width: 768px) {
  .hero { flex-direction: column; }
  .hero-actions { width: 100%; flex-wrap: wrap; justify-content: flex-start; }
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes shimmer {
  100% {
    transform: translateX(100%);
  }
}
</style>
