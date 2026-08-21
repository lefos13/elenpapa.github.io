import { fileURLToPath } from 'node:url'
import { dirname, join, parse } from 'node:path'
import { existsSync } from 'node:fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const sourceDir = join(__dirname, '..', 'public', 'images', 'common')

// Dynamically import sharp
const sharp = (await import('sharp')).default

// Icon images that need optimization - displayed at 150px max (bubble-size)
// Optimize for 300px (2x for retina) with high quality
const iconFiles = ['icon-bachelor.png', 'icon-seminar.png', 'icon-master1.png', 'icon-master2.png']

const TARGET_SIZE = 300 // 2x display size for retina

try {
  for (const file of iconFiles) {
    const sourcePath = join(sourceDir, file)
    const { name } = parse(file)
    const targetPath = join(sourceDir, `${name}.webp`)

    if (!existsSync(sourcePath)) {
      console.log(`Skipping ${file} - not found`)
      continue
    }

    console.log(`Optimizing ${file}...`)

    const sourceStats = await sharp(sourcePath).metadata()
    console.log(`  Original: ${sourceStats.width}x${sourceStats.height}`)

    await sharp(sourcePath)
      .resize(TARGET_SIZE, TARGET_SIZE, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .webp({
        quality: 90,
        effort: 6,
      })
      .toFile(targetPath)

    const targetStats = await sharp(targetPath).metadata()
    const originalSize = sourceStats.size || (await import('fs')).statSync(sourcePath).size
    const newSize = (await import('fs')).statSync(targetPath).size

    console.log(`  ✓ ${file} → ${name}.webp`)
    console.log(
      `    Size: ${(originalSize / 1024 / 1024).toFixed(2)}MB → ${(newSize / 1024).toFixed(0)}KB`,
    )
    console.log(
      `    Dimensions: ${sourceStats.width}x${sourceStats.height} → ${targetStats.width}x${targetStats.height}`,
    )
  }

  console.log('\n✅ Icon images optimized successfully!')
  console.log('\nNext steps:')
  console.log('1. Update home.json to use .webp extensions for icon paths')
  console.log('2. Or add a fallback mechanism in Introduction.vue')
} catch (error) {
  console.error('Error optimizing images:', error)
  process.exit(1)
}
