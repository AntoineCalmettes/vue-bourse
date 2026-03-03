export interface NewsArticle {
  title: string
  description: string
  url: string
  source: string
  publishedAt: string
  imageUrl: string
  category: NewsCategory
}

export type NewsCategory = 'bourse' | 'economie' | 'crypto' | 'tech' | 'entreprises' | 'autres'

interface NewsApiArticle {
  title?: string
  description?: string
  url?: string
  publishedAt?: string
  urlToImage?: string
  source?: { name?: string }
}

interface NewsApiResponse {
  status: 'ok' | 'error'
  message?: string
  code?: string
  articles?: NewsApiArticle[]
}

const NEWS_BASE_URL = 'https://newsapi.org/v2/everything'
const QUERY_BY_CATEGORY: Record<Exclude<NewsCategory, 'autres'>, string> = {
  bourse: '(bourse OR indice OR action OR ETF OR trading OR CAC 40 OR Nasdaq)',
  economie: '(economie OR économie OR inflation OR croissance OR recession OR PIB OR taux)',
  crypto: '(crypto OR bitcoin OR ethereum OR blockchain OR cardano OR BTC OR ADA)',
  tech: '(technologie OR tech OR IA OR intelligence artificielle OR semi-conducteur)',
  entreprises: '(entreprise OR entreprises OR startup OR acquisition OR fusion OR resultats)',
}

async function fetchFrenchNewsByCategory(
  apiKey: string,
  category: Exclude<NewsCategory, 'autres'>,
): Promise<NewsArticle[]> {
  const params = new URLSearchParams({
    q: QUERY_BY_CATEGORY[category],
    language: 'fr',
    sortBy: 'publishedAt',
    pageSize: '8',
    apiKey,
  })

  const response = await fetch(`${NEWS_BASE_URL}?${params.toString()}`)

  if (!response.ok) {
    throw new Error(`News API indisponible (${response.status})`)
  }

  const data = (await response.json()) as NewsApiResponse

  if (data.status !== 'ok') {
    throw new Error(data.message || `Erreur News API (${category})`)
  }

  return (data.articles || [])
    .filter((article) => article.title && article.url && article.publishedAt)
    .map((article) => ({
      title: article.title || 'Sans titre',
      description: article.description || 'Description indisponible.',
      url: article.url || '#',
      source: article.source?.name || 'Source inconnue',
      publishedAt: article.publishedAt || new Date().toISOString(),
      imageUrl: article.urlToImage || '',
      category,
    }))
}

export function inferNewsCategory(title: string, description: string): NewsCategory {
  const text = `${title} ${description}`.toLowerCase()

  if (/(bitcoin|ethereum|crypto|blockchain|cardano|btc|ada)/.test(text)) {
    return 'crypto'
  }

  if (/(nasdaq|cac 40|dow jones|s&p|etf|bourse|action|trading|wall street|indice)/.test(text)) {
    return 'bourse'
  }

  if (/(ia|intelligence artificielle|semi-conducteur|nvidia|microsoft|google|apple|technologie|tech)/.test(text)) {
    return 'tech'
  }

  if (/(entreprise|entreprises|startup|fusion|acquisition|pdg|résultats|chiffre d'affaires)/.test(text)) {
    return 'entreprises'
  }

  if (/(inflation|taux|banque centrale|pib|économie|economie|croissance|récession)/.test(text)) {
    return 'economie'
  }

  return 'autres'
}

export async function fetchFrenchBusinessNews(apiKey: string): Promise<NewsArticle[]> {
  const categories: Exclude<NewsCategory, 'autres'>[] = [
    'bourse',
    'economie',
    'crypto',
    'tech',
    'entreprises',
  ]
  const requests = await Promise.allSettled(
    categories.map((category) => fetchFrenchNewsByCategory(apiKey, category)),
  )

  const merged: NewsArticle[] = []
  for (const result of requests) {
    if (result.status === 'fulfilled') {
      merged.push(...result.value)
    }
  }

  const dedupedByUrl = new Map<string, NewsArticle>()
  for (const article of merged) {
    if (!dedupedByUrl.has(article.url)) {
      dedupedByUrl.set(article.url, article)
    }
  }

  const articles = [...dedupedByUrl.values()].sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  )

  if (!articles.length) {
    throw new Error('Aucune actualité disponible.')
  }

  return articles
}
