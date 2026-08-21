import { fileURLToPath } from 'node:url'
import { dirname, join, parse } from 'node:path'
import { statSync } from 'node:fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const sharp = (await import('sharp')).default

// Images to optimize with their target max dimensions
const imagesToOptimize = [
  // Hero image - displayed full width, optimize for 1920px width
  { path: 'hero.png', maxWidth: 1920, quality: 85 },
  // Intro image - displayed at ~400px width
  { path: 'intro.png', maxWidth: 800, quality: 85 },
  // Services - displayed at moderate sizes
  { path: 'services/Service 1.png', maxWidth: 600, quality: 85 },
  { path: 'services/Service 2.png', maxWidth: 600, quality: 85 },
  { path: 'services/Service 3.png', maxWidth: 600, quality: 85 },
]

const baseDir = join(__dirname, '..', 'public', 'images')

try {
  for (const img of imagesToOptimize) {
    const sourcePath = join(baseDir, img.path)
    const { dir, name } = parse(sourcePath)
    const targetPath = join(dir, `${name}.webp`)

    console.log(`Optimizing ${img.path}...`)

    const sourceStats = await sharp(sourcePath).metadata()
    const originalSize = statSync(sourcePath).size
    console.log(
      `  Original: ${sourceStats.width}x${sourceStats.height} (${(originalSize / 1024).toFixed(0)}KB)`,
    )

    await sharp(sourcePath)
      .resize(img.maxWidth, null, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({
        quality: img.quality,
        effort: 6,
      })
      .toFile(targetPath)

    const targetStats = await sharp(targetPath).metadata()
    const newSize = statSync(targetPath).size

    console.log(
      `  ✓ → ${name}.webp: ${targetStats.width}x${targetStats.height} (${(newSize / 1024).toFixed(0)}KB)`,
    )
    console.log(`    Reduction: ${((1 - newSize / originalSize) * 100).toFixed(0)}%`)
  }

  console.log('\n✅ All large images optimized!')
  console.log('\nRecommendation: Update the JSON files to use .webp versions')
} catch (error) {
  console.error('Error optimizing images:', error)
  process.exit(1)
}
