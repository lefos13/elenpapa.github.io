#!/usr/bin/env node
/**
 * Unified Image Optimization Script
 *
 * Usage:
 *   node scripts/optimize-images.js [options]
 *
 * Options:
 *   --file <path>     Optimize a single file (relative to public/images/)
 *   --folder <name>   Optimize all images in a folder (services, posts, publishers, common, books, moonlight)
 *   --type <type>     Optimization type: webp, responsive, icons, all (default: all)
 *   --all             Optimize all images in all folders
 *   --force           Regenerate even if output files exist
 *   --quality <num>   Override default quality (1-100)
 *   --dry-run         Show what would be done without actually doing it
 *
 * Examples:
 *   node scripts/optimize-images.js --file "services/Service 1.png"
 *   node scripts/optimize-images.js --folder services
 *   node scripts/optimize-images.js --folder posts --type webp
 *   node scripts/optimize-images.js --all
 *   node scripts/optimize-images.js --all --force
 */

import { fileURLToPath } from 'node:url'
import { dirname, join, parse, extname } from 'node:path'
import { existsSync, statSync, readdirSync } from 'node:fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BASE_DIR = join(__dirname, '..', 'public', 'images')

// Dynamically import sharp
const sharp = (await import('sharp')).default

// =============================================================================
// Configuration
// =============================================================================

const FOLDER_CONFIGS = {
  services: {
    extensions: ['.png', '.jpg', '.jpeg', '.jfif'],
    webp: { quality: 85, maxWidth: 600 },
    responsive: { sizes: [300, 600], quality: 80 },
  },
  posts: {
    extensions: ['.png', '.jpg', '.jpeg', '.jfif', '.webp'],
    webp: { quality: 85, maxWidth: 800 },
    responsive: { sizes: [400, 800], quality: 80 },
  },
  'posts/webp': {
    extensions: ['.png', '.jpg', '.jpeg', '.jfif', '.webp'],
    webp: { quality: 85, maxWidth: 800 },
    responsive: { sizes: [400, 800], quality: 80 },
  },
  publishers: {
    extensions: ['.png', '.jpg', '.jpeg', '.jfif'],
    webp: { quality: 85, maxWidth: 240 },
    responsive: { sizes: [120, 240], quality: 85, skipSvg: true },
  },
  common: {
    extensions: ['.png', '.jpg', '.jpeg', '.jfif'],
    webp: { quality: 90, maxWidth: 300 },
    responsive: { sizes: [100, 200], quality: 85 },
  },
  books: {
    extensions: ['.png', '.jpg', '.jpeg', '.jfif'],
    webp: { quality: 85, maxWidth: 400 },
    responsive: null,
  },
  moonlight: {
    extensions: ['.png', '.jpg', '.jpeg', '.jfif'],
    webp: { quality: 85, maxWidth: 800 },
    responsive: null,
  },
  'painted-books': {
    extensions: ['.png', '.jpg', '.jpeg', '.jfif'],
    webp: { quality: 85, maxWidth: 800 },
    responsive: null,
  },
  root: {
    // For files directly in public/images/
    extensions: ['.png', '.jpg', '.jpeg', '.jfif'],
    webp: { quality: 85, maxWidth: 1920 },
    responsive: { sizes: [400, 800], quality: 85 },
  },
}

// =============================================================================
// CLI Argument Parsing
// =============================================================================

function parseArgs() {
  const args = process.argv.slice(2)
  const options = {
    file: null,
    folder: null,
    type: 'all',
    all: false,
    force: false,
    quality: null,
    dryRun: false,
    help: false,
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    switch (arg) {
      case '--file':
      case '-f':
        options.file = args[++i]
        break
      case '--folder':
      case '-d':
        options.folder = args[++i]
        break
      case '--type':
      case '-t':
        options.type = args[++i]
        break
      case '--all':
      case '-a':
        options.all = true
        break
      case '--force':
        options.force = true
        break
      case '--quality':
      case '-q':
        options.quality = parseInt(args[++i], 10)
        break
      case '--dry-run':
        options.dryRun = true
        break
      case '--help':
      case '-h':
        options.help = true
        break
    }
  }

  return options
}

function showHelp() {
  console.log(`
📸 Image Optimization Script

Usage:
  node scripts/optimize-images.js [options]

Options:
  -f, --file <path>     Optimize a single file (relative to public/images/)
  -d, --folder <name>   Optimize a folder (services, posts, publishers, common, books, moonlight, painted-books)
  -t, --type <type>     Type: webp, responsive, all (default: all)
  -a, --all             Optimize all images in all folders
      --force           Regenerate even if output exists
  -q, --quality <num>   Override quality (1-100)
      --dry-run         Preview without making changes
  -h, --help            Show this help

Examples:
  Optimize a single new image:
    node scripts/optimize-images.js --file "services/NewService.png"

  Optimize all images in services folder:
    node scripts/optimize-images.js --folder services

  Generate only responsive variants for posts:
    node scripts/optimize-images.js --folder posts/webp --type responsive

  Optimize everything (use sparingly):
    node scripts/optimize-images.js --all

  Preview what would be done:
    node scripts/optimize-images.js --folder services --dry-run
`)
}

// =============================================================================
// Image Processing Functions
// =============================================================================

async function convertToWebp(sourcePath, config, options) {
  const { name, dir } = parse(sourcePath)
  const targetPath = join(dir, `${name}.webp`)

  if (!options.force && existsSync(targetPath)) {
    return { skipped: true, path: targetPath, reason: 'exists' }
  }

  if (options.dryRun) {
    return { dryRun: true, path: targetPath }
  }

  const quality = options.quality || config.quality
  const sourceStats = await sharp(sourcePath).metadata()

  await sharp(sourcePath)
    .resize(config.maxWidth, null, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({
      quality,
      effort: 6,
    })
    .toFile(targetPath)

  const originalSize = statSync(sourcePath).size
  const newSize = statSync(targetPath).size
  const targetMeta = await sharp(targetPath).metadata()

  return {
    success: true,
    path: targetPath,
    originalSize,
    newSize,
    reduction: ((1 - newSize / originalSize) * 100).toFixed(1),
    dimensions: `${sourceStats.width}x${sourceStats.height} → ${targetMeta.width}x${targetMeta.height}`,
  }
}

async function generateResponsiveVariants(sourcePath, config, options) {
  const { name, dir, ext } = parse(sourcePath)
  const results = []

  // Skip if already a sized variant
  if (/-\d+w\.(webp|png|jpg)$/i.test(sourcePath)) {
    return [{ skipped: true, reason: 'is-variant' }]
  }

  // Skip SVGs
  if (ext.toLowerCase() === '.svg') {
    return [{ skipped: true, reason: 'svg' }]
  }

  const metadata = await sharp(sourcePath).metadata()
  const quality = options.quality || config.quality

  for (const targetWidth of config.sizes) {
    const targetPath = join(dir, `${name}-${targetWidth}w.webp`)

    // Skip if larger than original
    if (metadata.width && targetWidth > metadata.width) {
      results.push({ skipped: true, path: targetPath, reason: 'larger-than-original' })
      continue
    }

    if (!options.force && existsSync(targetPath)) {
      results.push({ skipped: true, path: targetPath, reason: 'exists' })
      continue
    }

    if (options.dryRun) {
      results.push({ dryRun: true, path: targetPath, width: targetWidth })
      continue
    }

    await sharp(sourcePath)
      .resize(targetWidth, null, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({
        quality,
        effort: 6,
      })
      .toFile(targetPath)

    const newSize = statSync(targetPath).size
    results.push({
      success: true,
      path: targetPath,
      size: newSize,
      width: targetWidth,
    })
  }

  return results
}

// =============================================================================
// Main Processing Logic
// =============================================================================

async function processFile(filePath, options) {
  const fullPath = join(BASE_DIR, filePath)

  if (!existsSync(fullPath)) {
    console.error(`❌ File not found: ${filePath}`)
    return
  }

  const { dir, ext, name } = parse(filePath)
  const folder = dir || 'root'
  const config = FOLDER_CONFIGS[folder] || FOLDER_CONFIGS.root

  console.log(`\n📄 Processing: ${filePath}`)

  const stats = { webp: null, responsive: [] }

  // Convert to WebP
  if (
    (options.type === 'all' || options.type === 'webp') &&
    config.webp &&
    ext.toLowerCase() !== '.webp' &&
    ext.toLowerCase() !== '.svg'
  ) {
    const result = await convertToWebp(fullPath, config.webp, options)
    stats.webp = result
    if (result.success) {
      console.log(`  ✓ WebP: ${name}.webp (${result.reduction}% smaller)`)
    } else if (result.skipped) {
      console.log(`  ⏭ WebP: ${result.reason}`)
    } else if (result.dryRun) {
      console.log(`  🔍 Would create: ${name}.webp`)
    }
  }

  // Generate responsive variants
  if ((options.type === 'all' || options.type === 'responsive') && config.responsive) {
    // Check pattern if specified
    const basename = parse(filePath).base
    if (!config.responsive.pattern || config.responsive.pattern.test(basename)) {
      // Use the webp version if it exists, otherwise use original
      const webpPath = join(BASE_DIR, dir, `${name}.webp`)
      const sourceForResponsive = existsSync(webpPath) ? webpPath : fullPath

      const results = await generateResponsiveVariants(
        sourceForResponsive,
        config.responsive,
        options,
      )
      stats.responsive = results

      for (const r of results) {
        if (r.success) {
          console.log(`  ✓ ${r.width}w: ${(r.size / 1024).toFixed(1)}KB`)
        } else if (r.skipped && r.reason !== 'is-variant') {
          console.log(`  ⏭ ${r.width || ''}w: ${r.reason}`)
        } else if (r.dryRun) {
          console.log(`  🔍 Would create: ${name}-${r.width}w.webp`)
        }
      }
    }
  }

  return stats
}

async function processFolder(folderName, options) {
  const config = FOLDER_CONFIGS[folderName]
  if (!config) {
    console.error(`❌ Unknown folder: ${folderName}`)
    console.log(`   Available: ${Object.keys(FOLDER_CONFIGS).join(', ')}`)
    return
  }

  const folderPath = folderName === 'root' ? BASE_DIR : join(BASE_DIR, folderName)

  if (!existsSync(folderPath)) {
    console.error(`❌ Folder not found: ${folderPath}`)
    return
  }

  console.log(`\n📁 Processing folder: ${folderName || 'root'}`)

  const files = readdirSync(folderPath)
  const imageFiles = files.filter((f) => {
    const ext = extname(f).toLowerCase()
    // For responsive, match against webp too
    if (options.type === 'responsive') {
      return config.extensions.includes(ext) || ext === '.webp'
    }
    return config.extensions.includes(ext)
  })

  console.log(`   Found ${imageFiles.length} images`)

  let processed = 0
  let skipped = 0

  for (const file of imageFiles) {
    const relativePath = folderName === 'root' ? file : join(folderName, file)
    const result = await processFile(relativePath, options)
    if (result) {
      if (result.webp?.success || result.responsive?.some((r) => r.success)) {
        processed++
      } else {
        skipped++
      }
    }
  }

  console.log(`\n   ✅ Processed: ${processed}, Skipped: ${skipped}`)
}

async function processAll(options) {
  console.log('🚀 Processing all image folders...\n')

  const folders = Object.keys(FOLDER_CONFIGS).filter((f) => f !== 'root')

  for (const folder of folders) {
    await processFolder(folder, options)
  }

  // Process root folder
  await processFolder('root', options)

  console.log('\n🎉 All done!')
}

// =============================================================================
// Entry Point
// =============================================================================

async function main() {
  const options = parseArgs()

  if (options.help) {
    showHelp()
    return
  }

  console.log('━'.repeat(60))
  console.log('📸 Image Optimization')
  console.log('━'.repeat(60))

  if (options.dryRun) {
    console.log('🔍 DRY RUN MODE - No changes will be made\n')
  }

  if (options.file) {
    const filePath = join(BASE_DIR, options.file)
    if (existsSync(filePath) && statSync(filePath).isDirectory()) {
      console.log(`\nℹ️ "${options.file}" is a folder; running folder optimization instead.`)
      await processFolder(options.file, options)
    } else {
      await processFile(options.file, options)
    }
  } else if (options.folder) {
    await processFolder(options.folder, options)
  } else if (options.all) {
    await processAll(options)
  } else {
    console.log('No target specified. Use --help for usage information.')
    console.log('\nQuick examples:')
    console.log('  Single file:  node scripts/optimize-images.js -f "services/NewImage.png"')
    console.log('  Folder:       node scripts/optimize-images.js -d services')
    console.log('  Everything:   node scripts/optimize-images.js --all')
  }
}

main().catch((error) => {
  console.error('❌ Error:', error.message)
  process.exit(1)
})
