import { exec } from 'node:child_process'

const INTERVAL_MS = 3 * 60 * 60 * 1000

function runUpdate() {
  return new Promise((resolve, reject) => {
    exec('node scripts/update-news-cache.mjs', (error, stdout, stderr) => {
      if (stdout) {
        process.stdout.write(stdout)
      }
      if (stderr) {
        process.stderr.write(stderr)
      }

      if (error) {
        reject(error)
        return
      }

      resolve()
    })
  })
}

async function loop() {
  while (true) {
    try {
      await runUpdate()
      console.log('Prochaine mise a jour news-cache dans 3 heures')
    } catch (error) {
      console.error(`Echec mise a jour news-cache: ${error.message}`)
    }

    await new Promise((resolve) => setTimeout(resolve, INTERVAL_MS))
  }
}

loop().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
