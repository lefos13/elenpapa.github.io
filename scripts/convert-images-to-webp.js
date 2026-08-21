import { fileURLToPath } from 'node:url'
import { dirname, join, parse } from 'node:path'
import { readdir, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const sourceDir = join(__dirname, '..', 'public', 'images', 'posts')
const targetDir = join(__dirname, '..', 'public', 'images', 'posts', 'webp')

// Dynamically import sharp
const sharp = (await import('sharp')).default

try {
  // Create target directory if it doesn't exist
  if (!existsSync(targetDir)) {
    await mkdir(targetDir, { recursive: true })
  }

  // Read all files from source directory
  const files = await readdir(sourceDir)
  const pngFiles = files.filter((file) => file.toLowerCase().endsWith('.png'))

  console.log(`Found ${pngFiles.length} PNG files to convert`)

  for (const file of pngFiles) {
    const sourcePath = join(sourceDir, file)
    const { name } = parse(file)
    const targetPath = join(targetDir, `${name}.webp`)

    console.log(`Converting ${file}...`)

    await sharp(sourcePath)
      .webp({
        quality: 85,
        effort: 6,
      })
      .toFile(targetPath)

    const sourceStats = await sharp(sourcePath).metadata()
    const targetStats = await sharp(targetPath).metadata()

    console.log(
      `  ✓ ${file} → ${name}.webp (${Math.round((targetStats.size / sourceStats.size) * 100)}% of original size)`,
    )
  }

  console.log('\n✅ All images converted successfully!')
} catch (error) {
  console.error('Error converting images:', error)
  process.exit(1)
}
