import { fileURLToPath } from 'node:url'
import { dirname, join, parse } from 'node:path'
import { existsSync, statSync } from 'node:fs'
import { readdir } from 'node:fs/promises'

const __dirname = dirname(fileURLToPath(import.meta.url))
const sharp = (await import('sharp')).default

/**
 * Generate responsive image variants at different sizes
 * Creates: original-300w.webp, original-600w.webp for srcset usage
 */

const imageConfigs = [
  // Services images - displayed at 250-350px, create 300w and 600w (2x) variants
  {
    sourceDir: 'services',
    pattern: /^Service.*\.webp$/i,
    sizes: [300, 600],
    quality: 80,
  },
  // Posts carousel images - displayed at ~317px width, create 400w and 800w variants
  {
    sourceDir: 'posts/webp',
    pattern: /^Article.*\.webp$/i,
    sizes: [400, 800],
    quality: 80,
  },
  // Milestone icons - displayed at 98px, create 100w and 200w variants
  {
    sourceDir: 'common',
    pattern: /^icon-.*\.webp$/i,
    sizes: [100, 200],
    quality: 85,
  },
  // Publisher logos - displayed at 60-120px, create 120w and 240w variants
  {
    sourceDir: 'publishers',
    pattern: /\.(png|webp|jpg|jpeg)$/i,
    sizes: [120, 240],
    quality: 85,
  },
  // Intro image - displayed at ~400px width
  {
    sourceDir: '',
    pattern: /^intro\.webp$/i,
    sizes: [400, 800],
    quality: 85,
  },
]

const baseDir = join(__dirname, '..', 'public', 'images')

async function processImages() {
  let totalOriginal = 0
  let totalNew = 0
  let processedCount = 0

  for (const config of imageConfigs) {
    const sourceDir = join(baseDir, config.sourceDir)

    if (!existsSync(sourceDir)) {
      console.log(`⚠️ Directory not found: ${config.sourceDir || 'images root'}`)
      continue
    }

    const files = await readdir(sourceDir)
    const matchingFiles = files.filter((f) => config.pattern.test(f))

    console.log(`\n📁 Processing ${config.sourceDir || 'root'}: ${matchingFiles.length} files`)

    for (const file of matchingFiles) {
      const sourcePath = join(sourceDir, file)
      const { name } = parse(file)

      // Skip if already a sized variant
      if (/-\d+w\.(webp|png|jpg)$/i.test(file)) continue

      const originalSize = statSync(sourcePath).size
      totalOriginal += originalSize

      const metadata = await sharp(sourcePath).metadata()
      console.log(`  ${file}: ${metadata.width}x${metadata.height}`)

      for (const targetWidth of config.sizes) {
        // Skip if target width is larger than original
        if (metadata.width && targetWidth > metadata.width) {
          console.log(`    Skip ${targetWidth}w (original is smaller)`)
          continue
        }

        const targetFilename = `${name}-${targetWidth}w.webp`
        const targetPath = join(sourceDir, targetFilename)

        // Skip if already exists
        if (existsSync(targetPath)) {
          console.log(`    ✓ ${targetFilename} (exists)`)
          totalNew += statSync(targetPath).size
          continue
        }

        await sharp(sourcePath)
          .resize(targetWidth, null, {
            fit: 'inside',
            withoutEnlargement: true,
          })
          .webp({
            quality: config.quality,
            effort: 6,
          })
          .toFile(targetPath)

        const newSize = statSync(targetPath).size
        totalNew += newSize
        processedCount++

        console.log(`    ✓ ${targetFilename} (${(newSize / 1024).toFixed(1)}KB)`)
      }
    }
  }

  console.log(`\n✅ Generated ${processedCount} responsive image variants`)
  console.log(`   Original sources: ${(totalOriginal / 1024 / 1024).toFixed(2)}MB`)
  console.log(`   New variants: ${(totalNew / 1024 / 1024).toFixed(2)}MB`)
}

processImages().catch(console.error)
