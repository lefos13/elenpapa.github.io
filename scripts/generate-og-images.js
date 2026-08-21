/**
 * OG Image Generator
 * Generates beautiful Open Graph images for blog posts at build time
 */

import satori from 'satori'
import { Resvg } from '@resvg/resvg-js'
import sharp from 'sharp'
import { readFile, writeFile, mkdir, access } from 'node:fs/promises'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, '..')

// OG Image dimensions (standard)
const WIDTH = 1200
const HEIGHT = 630

/**
 * Convert image file to base64 data URI
 * @param {string} imagePath - Path to the image file
 * @param {number} size - Size to resize to (default 160)
 * @returns {Promise<string|null>} Base64 data URI or null on failure
 */
async function imageToDataUri(imagePath, size = 240) {
  try {
    // Check if file exists first
    await access(imagePath)

    // Resize image to optimize memory usage
    const resizedBuffer = await sharp(imagePath)
      .resize(size, size, { fit: 'cover', position: 'center' })
      .png()
      .toBuffer()

    const base64 = resizedBuffer.toString('base64')
    return `data:image/png;base64,${base64}`
  } catch (error) {
    console.warn(`Failed to load image ${imagePath}:`, error.message)
    return null
  }
}

/**
 * Create the OG image as a React-like JSX object for satori
 * Using JSX objects instead of satori-html to avoid HTML escaping issues
 */
function createOgTemplate(
  title,
  description,
  siteName,
  accentColor = '#b39ddb',
  imageDataUri = null,
) {
  const AVATAR_SIZE = 240

  // Truncate description if too long
  const maxDescLength = 160
  const truncatedDesc =
    description.length > maxDescLength
      ? description.substring(0, maxDescLength) + '...'
      : description

  // Truncate title if too long
  const maxTitleLength = 95
  const truncatedTitle =
    title.length > maxTitleLength ? title.substring(0, maxTitleLength) + '...' : title

  // Create avatar element - either image or initials fallback
  const avatarElement = imageDataUri
    ? {
        type: 'img',
        props: {
          src: imageDataUri,
          width: AVATAR_SIZE,
          height: AVATAR_SIZE,
          style: {
            borderRadius: '999px',
            objectFit: 'cover',
          },
        },
      }
    : {
        type: 'div',
        props: {
          style: {
            display: 'flex',
            width: `${AVATAR_SIZE}px`,
            height: `${AVATAR_SIZE}px`,
            backgroundColor: accentColor,
            borderRadius: '999px',
            alignItems: 'center',
            justifyContent: 'center',
          },
          children: {
            type: 'span',
            props: {
              style: {
                fontSize: '64px',
                color: '#0b1020',
                fontWeight: 700,
                letterSpacing: '-1px',
              },
              children: 'ΕΠ',
            },
          },
        },
      }

  return {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        background: `linear-gradient(135deg, #0b1020 0%, #111b33 45%, #1b2a4a 100%)`,
        fontFamily: 'EB Garamond, serif',
        position: 'relative',
      },
      children: [
        // Background glow blobs
        {
          type: 'div',
          props: {
            style: {
              position: 'absolute',
              top: '-80px',
              right: '-120px',
              width: '420px',
              height: '420px',
              borderRadius: '999px',
              backgroundColor: accentColor,
              opacity: 0.25,
            },
          },
        },
        {
          type: 'div',
          props: {
            style: {
              position: 'absolute',
              bottom: '-120px',
              left: '-140px',
              width: '520px',
              height: '520px',
              borderRadius: '999px',
              backgroundColor: '#7aa7ff',
              opacity: 0.18,
            },
          },
        },
        // Main card
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              height: '100%',
              padding: '54px 66px',
            },
            children: {
              type: 'div',
              props: {
                style: {
                  display: 'flex',
                  flexDirection: 'row',
                  width: '100%',
                  height: '100%',
                  backgroundColor: 'rgba(255, 255, 255, 0.96)',
                  borderRadius: '28px',
                  borderWidth: '1px',
                  borderStyle: 'solid',
                  borderColor: 'rgba(255, 255, 255, 0.55)',
                  boxShadow: '0 26px 70px rgba(0, 0, 0, 0.35)',
                  padding: '46px 52px',
                },
                children: [
                  // Avatar column
                  {
                    type: 'div',
                    props: {
                      style: {
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        marginRight: '44px',
                        width: `${AVATAR_SIZE + 18}px`,
                      },
                      children: [
                        // Avatar ring
                        {
                          type: 'div',
                          props: {
                            style: {
                              display: 'flex',
                              padding: '9px',
                              borderRadius: '999px',
                              backgroundColor: accentColor,
                              boxShadow: '0 18px 46px rgba(27, 42, 74, 0.28)',
                            },
                            children: {
                              type: 'div',
                              props: {
                                style: {
                                  display: 'flex',
                                  padding: '3px',
                                  borderRadius: '999px',
                                  backgroundColor: 'rgba(255, 255, 255, 0.9)',
                                },
                                children: avatarElement,
                              },
                            },
                          },
                        },
                        // Accent caption
                        {
                          type: 'div',
                          props: {
                            style: {
                              display: 'flex',
                              marginTop: '18px',
                              padding: '10px 14px',
                              borderRadius: '999px',
                              backgroundColor: 'rgba(27, 42, 74, 0.06)',
                              borderWidth: '1px',
                              borderStyle: 'solid',
                              borderColor: 'rgba(27, 42, 74, 0.10)',
                              alignSelf: 'center',
                            },
                            children: {
                              type: 'span',
                              props: {
                                style: {
                                  fontSize: '16px',
                                  fontWeight: 600,
                                  color: '#1b2a4a',
                                },
                                children: siteName,
                              },
                            },
                          },
                        },
                      ],
                    },
                  },
                  // Content column
                  {
                    type: 'div',
                    props: {
                      style: {
                        display: 'flex',
                        flexDirection: 'column',
                        flex: 1,
                        justifyContent: 'space-between',
                        paddingTop: '6px',
                        paddingBottom: '6px',
                      },
                      children: [
                        // Header + body
                        {
                          type: 'div',
                          props: {
                            style: { display: 'flex', flexDirection: 'column' },
                            children: [
                              // Small tag
                              {
                                type: 'div',
                                props: {
                                  style: {
                                    display: 'flex',
                                    alignSelf: 'flex-start',
                                    padding: '8px 12px',
                                    borderRadius: '999px',
                                    backgroundColor: 'rgba(179, 157, 219, 0.16)',
                                    borderWidth: '1px',
                                    borderStyle: 'solid',
                                    borderColor: 'rgba(179, 157, 219, 0.35)',
                                    marginBottom: '16px',
                                  },
                                  children: {
                                    type: 'span',
                                    props: {
                                      style: {
                                        fontSize: '16px',
                                        fontWeight: 700,
                                        color: '#1b2a4a',
                                        letterSpacing: '0.2px',
                                      },
                                      children: 'editopia.gr',
                                    },
                                  },
                                },
                              },
                              // Title
                              {
                                type: 'h1',
                                props: {
                                  style: {
                                    fontSize: '54px',
                                    fontWeight: 700,
                                    color: '#0b1020',
                                    margin: '0 0 18px 0',
                                    lineHeight: 1.1,
                                    letterSpacing: '-0.8px',
                                  },
                                  children: truncatedTitle,
                                },
                              },
                              // Description
                              {
                                type: 'p',
                                props: {
                                  style: {
                                    fontSize: '26px',
                                    color: '#2d3b55',
                                    margin: '0',
                                    lineHeight: 1.45,
                                    maxWidth: '720px',
                                  },
                                  children: truncatedDesc,
                                },
                              },
                            ],
                          },
                        },
                        // Footer row
                        {
                          type: 'div',
                          props: {
                            style: {
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              marginTop: '26px',
                            },
                            children: [
                              // Subtitle
                              {
                                type: 'div',
                                props: {
                                  style: { display: 'flex', flexDirection: 'column' },
                                  children: [
                                    {
                                      type: 'span',
                                      props: {
                                        style: {
                                          fontSize: '18px',
                                          color: 'rgba(27, 42, 74, 0.75)',
                                          fontWeight: 600,
                                        },
                                        children: 'Συγγραφέας • Επιμελήτρια • Σύμβουλος Εκδόσεων',
                                      },
                                    },
                                  ],
                                },
                              },
                              // CTA pill
                              {
                                type: 'div',
                                props: {
                                  style: {
                                    display: 'flex',
                                    alignItems: 'center',
                                    padding: '12px 18px',
                                    backgroundColor: '#0b1020',
                                    borderRadius: '999px',
                                    borderWidth: '1px',
                                    borderStyle: 'solid',
                                    borderColor: 'rgba(27, 42, 74, 0.12)',
                                  },
                                  children: [
                                    {
                                      type: 'span',
                                      props: {
                                        style: {
                                          fontSize: '18px',
                                          fontWeight: 700,
                                          color: 'white',
                                        },
                                        children: 'Διαβάστε περισσότερα',
                                      },
                                    },
                                    {
                                      type: 'span',
                                      props: {
                                        style: {
                                          fontSize: '18px',
                                          fontWeight: 700,
                                          color: accentColor,
                                          marginLeft: '10px',
                                        },
                                        children: '→',
                                      },
                                    },
                                  ],
                                },
                              },
                            ],
                          },
                        },
                      ],
                    },
                  },
                ],
              },
            },
          },
        },
      ],
    },
  }
}

const TEMPLATE_VERSION = 'v2'
const MANIFEST_PATH = join(rootDir, 'public', 'images', 'og', '.cache-manifest.json')

function computeImageHash({ title, description, siteName, accentColor, imageDataUri, fontHash }) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        version: TEMPLATE_VERSION,
        title: title || '',
        description: description || '',
        siteName: siteName || '',
        accentColor: accentColor || '',
        avatarHash: imageDataUri ? createHash('sha256').update(imageDataUri).digest('hex') : null,
        fontHash,
      }),
    )
    .digest('hex')
}

function loadCacheManifest() {
  try {
    if (existsSync(MANIFEST_PATH)) {
      return JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'))
    }
  } catch {
    // If corrupt or missing, return empty manifest
  }
  return {}
}

function saveCacheManifest(manifest) {
  try {
    writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf-8')
  } catch (error) {
    console.warn('Could not persist OG cache manifest:', error.message)
  }
}

/**
 * Generate OG image for a single post or page with hash caching
 */
async function generateOgImage(
  title,
  description,
  siteName,
  outputPath,
  fontData,
  fontHash,
  imageDataUri = null,
  manifest = {},
  force = false,
) {
  const filename = dirname(outputPath) === dirname(MANIFEST_PATH) ? outputPath.split('/').pop() : outputPath
  const currentHash = computeImageHash({
    title,
    description,
    siteName,
    accentColor: '#b39ddb',
    imageDataUri,
    fontHash,
  })

  if (!force && existsSync(outputPath) && manifest[filename] === currentHash) {
    console.log(`⚡ Cached (unchanged): ${filename}`)
    return
  }

  const template = createOgTemplate(title, description, siteName, '#b39ddb', imageDataUri)

  // Generate SVG with satori (using JSX objects directly)
  const svg = await satori(template, {
    width: WIDTH,
    height: HEIGHT,
    fonts: [
      {
        name: 'EB Garamond',
        data: fontData,
        weight: 400,
        style: 'normal',
      },
      {
        name: 'EB Garamond',
        data: fontData,
        weight: 600,
        style: 'normal',
      },
    ],
  })

  // Convert SVG to PNG using resvg
  const resvg = new Resvg(svg, {
    fitTo: {
      mode: 'width',
      value: WIDTH,
    },
  })

  const pngData = resvg.render()
  const pngBuffer = pngData.asPng()

  // Ensure output directory exists
  await mkdir(dirname(outputPath), { recursive: true })

  // Write PNG file
  await writeFile(outputPath, pngBuffer)

  // Update manifest
  manifest[filename] = currentHash
  console.log(`✓ Generated: ${outputPath}`)
}

/**
 * Main function to generate all OG images
 */
async function main() {
  const force = process.argv.includes('--force')
  console.log(`🎨 Generating OG images...${force ? ' (force rebuild)' : ''}\n`)

  const manifest = loadCacheManifest()

  // Load posts data
  const postsPath = join(rootDir, 'public', 'content', 'posts.json')
  const postsData = JSON.parse(await readFile(postsPath, 'utf-8'))

  // Load site data for branding
  const sitePath = join(rootDir, 'public', 'content', 'site.json')
  const siteData = JSON.parse(await readFile(sitePath, 'utf-8'))
  const siteName = siteData.seo?.siteName || 'Έλενα Παπαδοπούλου'
  const pagesMeta = siteData.seo?.pages ?? {}

  // Load home data for intro image (used for non-post pages)
  const homePath = join(rootDir, 'public', 'content', 'home.json')
  const homeData = JSON.parse(await readFile(homePath, 'utf-8'))
  const introImagePath = join(rootDir, 'public', homeData.intro.image.src)
  const introImageDataUri = await imageToDataUri(introImagePath, 240)

  if (introImageDataUri) {
    console.log('✓ Loaded intro image for avatar')
  } else {
    console.warn('⚠ Could not load intro image, will use initials fallback')
  }

  // Load font - using a Google Font that's publicly available
  let fontData
  try {
    // Try to load local font first
    const localFontPath = join(rootDir, 'src', 'styles', 'fonts', 'EBGaramond-Regular.ttf')
    fontData = await readFile(localFontPath)
    console.log('✓ Using local EB Garamond font')
  } catch {
    // Fallback: fetch from Google Fonts
    console.log('📥 Fetching font from Google Fonts...')
    const response = await fetch(
      'https://cdn.jsdelivr.net/fontsource/fonts/eb-garamond@latest/greek-400-normal.woff',
    )
    if (!response.ok) {
      // Use a fallback font that's always available
      const fallbackResponse = await fetch(
        'https://cdn.jsdelivr.net/npm/@fontsource/inter/files/inter-latin-400-normal.woff',
      )
      fontData = await fallbackResponse.arrayBuffer()
    } else {
      fontData = await response.arrayBuffer()
    }
  }

  const fontHash = createHash('sha256').update(Buffer.from(fontData)).digest('hex')

  // Output directory for OG images
  const outputDir = join(rootDir, 'public', 'images', 'og')

  // Generate OG image for each post (using post's own image)
  console.log('\n📝 Processing post OG images...')
  for (let i = 0; i < postsData.items.length; i++) {
    const post = postsData.items[i]
    const outputPath = join(outputDir, `post-${i}.png`)

    // Load the post's image as the avatar
    let postImageDataUri = null
    if (post.image) {
      const postImagePath = join(rootDir, 'public', post.image)
      postImageDataUri = await imageToDataUri(postImagePath, 240)
      if (!postImageDataUri) {
        console.warn(`  ⚠ Could not load image for post ${i}, using intro image fallback`)
        postImageDataUri = introImageDataUri
      }
    } else {
      postImageDataUri = introImageDataUri
    }

    await generateOgImage(
      post.title,
      post.summary,
      siteName,
      outputPath,
      fontData,
      fontHash,
      postImageDataUri,
      manifest,
      force,
    )
  }

  // Generate default OG image for the site (using intro image as avatar)
  console.log('\n🌐 Processing site default OG image...')
  const defaultOutputPath = join(outputDir, 'default.png')
  await generateOgImage(
    'Έλενα Παπαδοπούλου - Συγγραφέας, Επιμελήτρια & Σύμβουλος Εκδόσεων',
    'Συμβουλές για συγγραφείς, υπηρεσίες επιμέλειας και εργογραφία. Αξιολόγηση, μετάφραση, επιμέλεια και διόρθωση βιβλίων.',
    siteName,
    defaultOutputPath,
    fontData,
    fontHash,
    introImageDataUri,
    manifest,
    force,
  )

  // Generate OG images for main pages
  console.log('\n📄 Processing page-specific OG images...')

  const getPageMeta = (pageKey, fallbackTitle, fallbackDescription) => {
    const page = pagesMeta[pageKey]
    return {
      title: page?.title || fallbackTitle,
      description: page?.description || fallbackDescription,
    }
  }

  const pageDefinitions = [
    {
      key: 'home',
      filename: 'home.png',
      fallbackTitle: 'Έλενα Παπαδοπούλου - Συγγραφέας & Επιμελήτρια',
      fallbackDescription:
        'Υπηρεσίες επιμέλειας κειμένων, αξιολόγησης χειρογράφων και συμβουλευτικής για συγγραφείς. Επαγγελματική καθοδήγηση προς έκδοση.',
    },
    {
      key: 'timeline',
      filename: 'timeline.png',
      fallbackTitle: 'Εργογραφία - Έλενα Παπαδοπούλου',
      fallbackDescription:
        'Η πλήρης εργογραφία της Έλενας Παπαδοπούλου: βιβλία, μεταφράσεις, επιμέλειες και συνεργασίες με εκδοτικούς οίκους.',
    },
    {
      key: 'book',
      filename: 'book.png',
      fallbackTitle: 'Ένα μόνο γράμμα - Έλενα Παπαδοπούλου',
      fallbackDescription:
        "Ανακαλύψτε το βιβλίο 'Ένα μόνο γράμμα' της Έλενας Παπαδοπούλου. Διαθέσιμο στα μεγαλύτερα βιβλιοπωλεία.",
    },
    {
      key: 'moonlight',
      filename: 'moonlight.png',
      fallbackTitle: 'Moonlight Tales - Έλενα Παπαδοπούλου',
      fallbackDescription:
        'Moonlight Tales: Μια συλλογή ιστοριών από την Έλενα Παπαδοπούλου που εξερευνά το μυστήριο και τη μαγεία.',
    },
    {
      key: 'paintedBooks',
      filename: 'painted-books.png',
      fallbackTitle: 'Ζωγραφισμένα Βιβλία - Έλενα Παπαδοπούλου',
      fallbackDescription:
        'Ανακαλύψτε τα ζωγραφισμένα βιβλία: μια μοναδική συλλογή όπου η τέχνη συναντά τη λογοτεχνία.',
    },
  ]

  for (const page of pageDefinitions) {
    const { title, description } = getPageMeta(
      page.key,
      page.fallbackTitle,
      page.fallbackDescription,
    )
    const pageOgPath = join(outputDir, page.filename)

    await generateOgImage(
      title,
      description,
      siteName,
      pageOgPath,
      fontData,
      fontHash,
      introImageDataUri,
      manifest,
      force,
    )
  }

  saveCacheManifest(manifest)
  console.log('\n✅ OG image processing complete!')
}

main().catch(console.error)
