export interface NewsArticle {
  title: string
  description: string
  url: string
  source: string
  publishedAt: string
  imageUrl: string
}

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

export async function fetchFrenchBusinessNews(apiKey: string): Promise<NewsArticle[]> {
  const params = new URLSearchParams({
    q: '(bourse OR economie OR entreprises)',
    language: 'fr',
    sortBy: 'publishedAt',
    pageSize: '12',
    apiKey,
  })

  const response = await fetch(`${NEWS_BASE_URL}?${params.toString()}`)

  if (!response.ok) {
    throw new Error(`News API indisponible (${response.status})`)
  }

  const data = (await response.json()) as NewsApiResponse

  if (data.status !== 'ok') {
    throw new Error(data.message || 'Erreur News API')
  }

  const articles = (data.articles || [])
    .filter((article) => article.title && article.url && article.publishedAt)
    .map((article) => ({
      title: article.title || 'Sans titre',
      description: article.description || 'Description indisponible.',
      url: article.url || '#',
      source: article.source?.name || 'Source inconnue',
      publishedAt: article.publishedAt || new Date().toISOString(),
      imageUrl: article.urlToImage || '',
    }))

  if (!articles.length) {
    throw new Error('Aucune actualité disponible.')
  }

  return articles
}
