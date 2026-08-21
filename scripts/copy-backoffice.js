import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const sourceDir = join(process.cwd(), 'backoffice', 'public')
const targetDir = join(process.cwd(), 'dist', 'backoffice')

try {
  if (!existsSync(sourceDir)) {
    console.warn('⚠️  Source directory does not exist:', sourceDir)
    process.exit(0)
  }

  mkdirSync(targetDir, { recursive: true })
  cpSync(sourceDir, targetDir, { recursive: true })
  console.log('✅ Backoffice static assets copied to dist/backoffice/')
} catch (error) {
  console.error('❌ Failed to copy backoffice assets:', error)
  process.exit(1)
}
