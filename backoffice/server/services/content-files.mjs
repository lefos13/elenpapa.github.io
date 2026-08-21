/**
 * Why this exists:
 * Content JSON operations (listing, reading, writing) are separated from HTTP
 * routing so future validation and per-file business rules can be added cleanly.
 */
import path from 'node:path'
import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { paths } from '../config.mjs'
import { getSafeContentPath } from '../utils/path-guards.mjs'
import { getSchemaIdForFilePath, getUsageForFilePath } from './schemas.mjs'

export async function listJsonFiles(dir = paths.contentDir, baseDir = dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const absolutePath = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      files.push(...(await listJsonFiles(absolutePath, baseDir)))
      continue
    }

    if (!entry.name.endsWith('.json')) continue

    const relativePath = path.relative(baseDir, absolutePath)
    files.push(relativePath.split(path.sep).join('/'))
  }

  return files.sort((left, right) => left.localeCompare(right))
}

export async function readContentFile(relativePath) {
  const filePath = getSafeContentPath(relativePath)
  const fileContent = await readFile(filePath, 'utf-8')
  return JSON.parse(fileContent)
}

/**
 * Why this exists:
 * The backoffice sidebar needs operational metadata (size, update time, usage)
 * so editors can orient faster before opening a specific JSON file.
 */
export async function listContentFileDescriptors() {
  const files = await listJsonFiles(paths.contentDir)
  const descriptors = await Promise.all(
    files.map(async (filePath) => {
      const absolutePath = getSafeContentPath(filePath)
      const fileStats = await stat(absolutePath)
      return {
        file: filePath,
        sizeBytes: fileStats.size,
        updatedAt: fileStats.mtime.toISOString(),
        usage: getUsageForFilePath(filePath),
        schemaId: getSchemaIdForFilePath(filePath),
      }
    }),
  )
  return descriptors
}

export async function writeContentFile(relativePath, nextContent) {
  const filePath = getSafeContentPath(relativePath)
  const serialized = `${JSON.stringify(nextContent, null, 2)}\n`
  await writeFile(filePath, serialized, 'utf-8')
}
