/**
 * Optimize post article images to reduce file sizes
 * The images are currently 1-1.6MB each, need to reduce to ~150-200KB
 */

import sharp from 'sharp'
import { readdir } from 'fs/promises'
import { join } from 'path'

const POSTS_DIR = './public/images/posts/webp'

async function optimizePostsImages() {
  console.log('Starting post image optimization...\n')

  const files = await readdir(POSTS_DIR)
  const webpFiles = files.filter((f) => f.toLowerCase().endsWith('.webp'))

  let totalOriginal = 0
  let totalOptimized = 0

  for (const file of webpFiles) {
    const inputPath = join(POSTS_DIR, file)
    const outputPath = join(POSTS_DIR, `optimized-${file}`)

    const originalStats = await stat(inputPath)
    const originalSize = originalStats.size
    totalOriginal += originalSize

    try {
      // Optimize to max 800px width (carousel displays ~400px)
      // Use quality 75-80 for good balance
      await sharp(inputPath)
        .resize({
          width: 800,
          withoutEnlargement: true,
          fit: 'inside',
        })
        .webp({
          quality: 78,
          effort: 6,
          nearLossless: false,
        })
        .toFile(outputPath)

      const optimizedStats = await stat(outputPath)
      const optimizedSize = optimizedStats.size
      totalOptimized += optimizedSize

      const savings = ((1 - optimizedSize / originalSize) * 100).toFixed(1)

      console.log(`✓ ${file}`)
      console.log(`  Original: ${(originalSize / 1024).toFixed(0)} KB`)
      console.log(`  Optimized: ${(optimizedSize / 1024).toFixed(0)} KB`)
      console.log(`  Savings: ${savings}%\n`)
    } catch (error) {
      console.error(`✗ Error optimizing ${file}:`, error.message)
    }
  }

  console.log('='.repeat(50))
  console.log(`Total original: ${(totalOriginal / 1024 / 1024).toFixed(2)} MB`)
  console.log(`Total optimized: ${(totalOptimized / 1024 / 1024).toFixed(2)} MB`)
  console.log(`Total savings: ${((1 - totalOptimized / totalOriginal) * 100).toFixed(1)}%`)
  console.log('\nRun the following commands to replace original files:')
  console.log('1. Rename originals to backup folder (optional)')
  console.log('2. Remove "optimized-" prefix from new files')
}

optimizePostsImages().catch(console.error)
