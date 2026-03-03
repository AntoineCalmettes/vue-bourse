import { writeFile } from 'node:fs/promises'

const API_KEY = process.env.NEWS_API_KEY || 'cbd2d62761004952b282de8764b385b6'
const NEWS_URL = 'https://newsapi.org/v2/everything'

async function fetchNews() {
  const params = new URLSearchParams({
    q: '(bourse OR economie OR entreprises)',
    language: 'fr',
    sortBy: 'publishedAt',
    pageSize: '12',
    apiKey: API_KEY,
  })

  const response = await fetch(`${NEWS_URL}?${params.toString()}`)
  if (!response.ok) {
    throw new Error(`News API HTTP ${response.status}`)
  }

  const data = await response.json()

  if (data.status !== 'ok') {
    throw new Error(data.message || 'Erreur News API')
  }

  const articles = (data.articles || [])
    .filter((article) => article.title && article.url && article.publishedAt)
    .map((article) => ({
      title: article.title,
      description: article.description || 'Description indisponible.',
      url: article.url,
      source: article.source?.name || 'Source inconnue',
      publishedAt: article.publishedAt,
      imageUrl: article.urlToImage || '',
    }))

  if (!articles.length) {
    throw new Error('Aucun article recu depuis News API')
  }

  return articles
}

async function updateNewsCacheFile() {
  const articles = await fetchNews()

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
