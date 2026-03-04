import { writeFile } from 'node:fs/promises'

const API_KEY = process.env.NEWS_API_KEY || ''
const NEWS_URL = 'https://newsapi.org/v2/everything'
const CATEGORY_QUERIES = {
  bourse: '(bourse OR indice OR action OR ETF OR trading OR CAC 40 OR Nasdaq)',
  economie: '(economie OR économie OR inflation OR croissance OR recession OR PIB OR taux)',
  crypto: '(crypto OR bitcoin OR ethereum OR blockchain OR cardano OR BTC OR ADA)',
  tech: '(technologie OR tech OR IA OR intelligence artificielle OR semi-conducteur)',
  entreprises: '(entreprise OR entreprises OR startup OR acquisition OR fusion OR resultats)',
}

if (!API_KEY) {
  throw new Error('NEWS_API_KEY manquant')
}

function inferNewsCategory(title, description) {
  const text = `${title} ${description}`.toLowerCase()

  if (/(bitcoin|ethereum|crypto|blockchain|cardano|btc|ada)/.test(text)) return 'crypto'
  if (/(nasdaq|cac 40|dow jones|s&p|etf|bourse|action|trading|wall street|indice)/.test(text)) return 'bourse'
  if (/(ia|intelligence artificielle|semi-conducteur|nvidia|microsoft|google|apple|technologie|tech)/.test(text)) return 'tech'
  if (/(entreprise|entreprises|startup|fusion|acquisition|pdg|résultats|chiffre d'affaires)/.test(text)) return 'entreprises'
  if (/(inflation|taux|banque centrale|pib|économie|economie|croissance|récession)/.test(text)) return 'economie'
  return 'autres'
}

async function fetchNewsByCategory(category) {
  const params = new URLSearchParams({
    q: CATEGORY_QUERIES[category],
    language: 'fr',
    sortBy: 'publishedAt',
    pageSize: '8',
    apiKey: API_KEY,
  })

  const response = await fetch(`${NEWS_URL}?${params.toString()}`)
  if (!response.ok) {
    throw new Error(`News API HTTP ${response.status}`)
  }

  const data = await response.json()

  if (data.status !== 'ok') {
    throw new Error(data.message || `Erreur News API (${category})`)
  }

  return (data.articles || [])
    .filter((article) => article.title && article.url && article.publishedAt)
    .map((article) => ({
      title: article.title,
      description: article.description || 'Description indisponible.',
      url: article.url,
      source: article.source?.name || 'Source inconnue',
      publishedAt: article.publishedAt,
      imageUrl: article.urlToImage || '',
      category,
    }))
}

async function updateNewsCacheFile() {
  const categories = Object.keys(CATEGORY_QUERIES)
  const settled = await Promise.allSettled(categories.map((category) => fetchNewsByCategory(category)))

  const merged = []
  for (const result of settled) {
    if (result.status === 'fulfilled') {
      merged.push(...result.value)
    }
  }

  const dedupedByUrl = new Map()
  for (const article of merged) {
    if (!dedupedByUrl.has(article.url)) {
      dedupedByUrl.set(article.url, article)
    }
  }

  const articles = [...dedupedByUrl.values()].sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  )

  if (!articles.length) {
    throw new Error('Aucun article recu depuis News API')
  }

  const payload = {
    savedAt: new Date().toISOString(),
    data: articles,
  }

  await writeFile('public/news-cache.json', `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  console.log('public/news-cache.json mis a jour')
}

updateNewsCacheFile().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
