import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { join, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const PORT = process.env.PORT || 3000
const DIST_DIR = join(__dirname, 'dist')

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

const server = createServer(async (req, res) => {
  try {
    // Normalize path and remove query strings
    let filePath = new URL(req.url, `http://localhost:${PORT}`).pathname

    // Decode URL-encoded characters (spaces, special characters, etc.)
    filePath = decodeURIComponent(filePath)

    // Default to index.html for root and directories
    if (filePath === '/' || filePath.endsWith('/')) {
      filePath = join(filePath, 'index.html')
    }

    // Construct full file path
    const fullPath = join(DIST_DIR, filePath)

    // Read file
    const content = await readFile(fullPath)

    // Set content type
    const ext = extname(filePath).toLowerCase()
    const contentType = MIME_TYPES[ext] || 'application/octet-stream'

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000',
    })
    res.end(content)

    console.log(`✓ ${req.method} ${req.url} → 200`)
  } catch (err) {
    // If file not found, try serving index.html (for SPA routing)
    if (err.code === 'ENOENT') {
      try {
        const indexPath = join(DIST_DIR, 'index.html')
        const content = await readFile(indexPath)
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(content)
        console.log(`✓ ${req.method} ${req.url} → index.html (SPA fallback)`)
      } catch {
        res.writeHead(404, { 'Content-Type': 'text/plain' })
        res.end('404 Not Found')
        console.log(`✗ ${req.method} ${req.url} → 404`)
      }
    } else {
      res.writeHead(500, { 'Content-Type': 'text/plain' })
      res.end('500 Internal Server Error')
      console.error(`✗ ${req.method} ${req.url} → 500`, err)
    }
  }
})

server.listen(PORT, () => {
  console.log(`\n🚀 Server running at http://localhost:${PORT}`)
  console.log(`📁 Serving files from: ${DIST_DIR}\n`)
})
