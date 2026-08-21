# Spec: Vercel-Ready Live Backoffice & Git-Backed CMS

## Objective

Enable the existing Portfolio Backoffice (`backoffice/`) to run seamlessly in a live production environment on Vercel as a secure, Git-backed Headless CMS.

The system will allow content editors to authenticate at `/admin`, edit content JSON files (`site.json`, `timeline.json`, `posts.json`, etc.) with full Zod schema validation and conflict detection, upload and optimize images in-memory via Sharp, and publish changes via GitHub review branches and automated Pull Requests that trigger Vercel CI/CD static site builds.

---

## Assumptions

1. **Hosting & Platform:** Production runs on Vercel Serverless Functions (Node.js runtime) with Edge CDN for static SSG assets.
2. **Git-Backed Content:** The GitHub repository is the single source of truth for all content (`public/content/*.json`) and assets (`public/images/**`).
3. **Publishing Lifecycle:** Merging review branches or PRs into `main` triggers Vercel's automated static site generation build (`npm run build:ssg`), updating the live site.
4. **Authentication:** A lightweight, self-contained Session Auth system (encrypted HttpOnly cookie with password/passkey or GitHub OAuth) without requiring external paid auth SaaS.
5. **Image Processing:** Image optimization (WebP conversion, responsive widths) runs in-memory via `sharp` inside serverless functions, producing Git blobs committed directly to the repo.
6. **Dual Mode Support:** Development workflow continues to support local execution while production executes serverless functions against the GitHub REST API.

---

## Tech Stack

- **Runtime:** Node.js 22.x (Vercel Serverless Functions)
- **API Framework:** Vercel Serverless Functions (`api/` directory) with zero heavy framework overhead (or Hono router for type-safe routing)
- **Git & Content Engine:** `@octokit/rest` / GitHub REST API (v3 Git Database & Contents API)
- **Validation & Schemas:** Zod 3.25+ (shared between frontend `src/services/content.ts` and backoffice API)
- **Image Processing:** Sharp 0.34+ (in-memory WebP conversion & resizing)
- **Security & Auth:** `jose` / Web Crypto API (HMAC SHA-256 signed JWT in `HttpOnly`, `Secure`, `SameSite=Lax` cookies)
- **Frontend Admin UI:** Existing Backoffice Vanilla JS + CSS SPA (`backoffice/public/`) served at `/admin`
- **Public Site:** Vue 3.5+, `vite-ssg`, TypeScript

---

## Commands

```sh
# Local Development (Frontend)
npm run dev

# Local Backoffice (Local Dev Server)
npm run backoffice

# Run Vercel Local Emulation (Tests Serverless API with env vars)
npx vercel dev

# Type Check & Validation
npm run type-check

# Build (Static Site Generation + OG + Sitemap)
npm run build

# Test Backoffice API Unit / Integration Suite
npm test
```

---

## Project Structure

```text
portfolio/
├── api/                               # Vercel Serverless Functions
│   ├── auth/                          # Auth endpoints (login, logout, session)
│   │   ├── login.ts
│   │   ├── logout.ts
│   │   └── session.ts
│   ├── files/                         # Content CRUD & schema endpoints
│   │   ├── index.ts                   # GET /api/files (list files & descriptors)
│   │   └── [file].ts                  # GET/PUT /api/files/:file (read, save, validate)
│   ├── images/                        # Media library & upload
│   │   ├── index.ts                   # GET /api/images (search & reference index)
│   │   └── upload.ts                  # POST /api/upload-image (in-memory Sharp & Git blob)
│   ├── git/                           # Git workflow & publishing
│   │   ├── status.ts                  # GET /api/git/status
│   │   ├── preview.ts                 # POST /api/git/preview (diff generation)
│   │   └── finalize.ts                # POST /api/git/finalize (branch, commit, PR)
│   ├── schemas/                       # Schema metadata
│   │   └── [id].ts                    # GET /api/schemas/:id
│   └── lib/                           # Serverless shared modules
│       ├── auth.ts                    # JWT session token sign/verify & cookies
│       ├── config.ts                  # Environment variables & constants
│       ├── github.ts                  # Octokit / GitHub Git Data & Contents API client
│       ├── image-processor.ts         # In-memory Sharp optimization & variant generation
│       ├── schemas.ts                 # Zod validation & editor schema builder
│       └── http.ts                    # HTTP helpers, error formatting, CORS/Origin
├── backoffice/                        # Admin UI assets (Static SPA)
│   ├── public/                        # Static HTML/CSS/JS served on /admin
│   │   ├── index.html
│   │   ├── styles.css
│   │   └── js/                        # Admin SPA modules (API client, editor views)
│   └── server/                        # Legacy / local dev Node server fallback
├── public/
│   ├── content/                       # Content JSON files (source of truth)
│   └── images/                        # Optimized images
├── src/                               # Vue 3 Portfolio application
├── docs/
│   └── specs/                         # Project specifications
├── vercel.json                        # Vercel routing, headers, and function configuration
└── package.json
```

---

## Architecture & Code Style

### 1. In-Memory Image Optimization (Serverless Sharp)

```ts
// api/lib/image-processor.ts
import sharp from 'sharp'

export interface ProcessedImageVariant {
  path: string // e.g. "public/images/books/cover-178697.webp"
  buffer: Buffer
  publicPath: string // e.g. "/images/books/cover-178697.webp"
}

export async function processUploadedImage(
  inputBuffer: Buffer,
  folder: string,
  baseName: string,
): Promise<ProcessedImageVariant[]> {
  const timestamp = Date.now()
  const webpName = `${baseName}-${timestamp}.webp`

  // 1. Primary optimized WebP
  const primaryBuffer = await sharp(inputBuffer).webp({ quality: 85, effort: 4 }).toBuffer()

  const variants: ProcessedImageVariant[] = [
    {
      path: `public/images/${folder}/${webpName}`,
      buffer: primaryBuffer,
      publicPath: `/images/${folder}/${webpName}`,
    },
  ]

  // 2. Responsive variants for posts / books
  if (['posts', 'books'].includes(folder)) {
    const w400 = await sharp(inputBuffer).resize(400).webp({ quality: 80 }).toBuffer()
    const w800 = await sharp(inputBuffer).resize(800).webp({ quality: 80 }).toBuffer()
    variants.push(
      {
        path: `public/images/${folder}/${baseName}-${timestamp}-400w.webp`,
        buffer: w400,
        publicPath: `/images/${folder}/${baseName}-${timestamp}-400w.webp`,
      },
      {
        path: `public/images/${folder}/${baseName}-${timestamp}-800w.webp`,
        buffer: w800,
        publicPath: `/images/${folder}/${baseName}-${timestamp}-800w.webp`,
      },
    )
  }

  return variants
}
```

### 2. Multi-File Atomic Commit via GitHub Git Data API

```ts
// api/lib/github.ts
import { Octokit } from '@octokit/rest'

export async function commitSessionChanges(
  octokit: Octokit,
  {
    owner,
    repo,
    branch,
    files, // Array of { path: string, content: string | Buffer }
    message,
  },
) {
  // 1. Get branch commit SHA
  const { data: refData } = await octokit.git.getRef({ owner, repo, ref: `heads/${branch}` })
  const baseCommitSha = refData.object.sha

  // 2. Get base tree
  const { data: commitData } = await octokit.git.getCommit({
    owner,
    repo,
    commit_sha: baseCommitSha,
  })
  const baseTreeSha = commitData.tree.sha

  // 3. Create Blobs for each file
  const treeItems = await Promise.all(
    files.map(async (file) => {
      const isBuffer = Buffer.isBuffer(file.content)
      const { data: blob } = await octokit.git.createBlob({
        owner,
        repo,
        content: isBuffer ? file.content.toString('base64') : file.content,
        encoding: isBuffer ? 'base64' : 'utf-8',
      })
      return {
        path: file.path,
        mode: '100644' as const,
        type: 'blob' as const,
        sha: blob.sha,
      }
    }),
  )

  // 4. Create Tree
  const { data: newTree } = await octokit.git.createTree({
    owner,
    repo,
    base_tree: baseTreeSha,
    tree: treeItems,
  })

  // 5. Create Commit
  const { data: newCommit } = await octokit.git.createCommit({
    owner,
    repo,
    message,
    tree: newTree.sha,
    parents: [baseCommitSha],
  })

  // 6. Update Ref
  await octokit.git.updateRef({
    owner,
    repo,
    ref: `heads/${branch}`,
    sha: newCommit.sha,
  })

  return { commitSha: newCommit.sha }
}
```

---

## Testing Strategy

1. **Unit Tests (Vitest/Node Test Runner):**
   - Auth token signature and validation (`api/lib/auth.test.ts`).
   - In-memory Sharp image processing & dimension validation (`api/lib/image-processor.test.ts`).
   - Zod validation and payload sanity tests (`api/lib/schemas.test.ts`).
2. **Mock Integration Tests:**
   - GitHub API adapter tests with mocked Octokit responses (`api/lib/github.test.ts`).
   - Concurrency collision handling (testing 409 Conflict when SHA mismatches).
3. **End-to-End Smoke Tests:**
   - Run `npx vercel dev` locally to test full request flow: Login -> Read file -> Update content -> Finalize PR -> Logout.

---

## Boundaries

- **Always:**
  - Authenticate all `/api/*` endpoints except `/api/auth/login`.
  - Validate JSON payloads against Zod schemas before committing.
  - Return standardized HTTP error responses (`{ error: string, issues?: unknown }`).
  - Use GitHub blob SHA for optimistic locking / revision conflicts.
- **Ask First:**
  - Altering the public content JSON structure or changing existing Zod schema rules in `src/services/content.ts`.
  - Introducing third-party SaaS dependencies for auth or storage.
- **Never:**
  - Use `node:fs/promises` write operations in production serverless routes.
  - Use `child_process.execFile` in serverless functions.
  - Expose `GITHUB_TOKEN` or `AUTH_SECRET` to the client.
  - Allow unauthenticated mutations or cross-site request forgery.

---

## Success Criteria

1. **Live Admin Access:** Navigating to `/admin` loads the Backoffice SPA with a clean login screen when unauthenticated.
2. **Secure Authentication:** Valid credentials issue an encrypted HttpOnly cookie; invalid credentials return 401.
3. **Real-Time Content CRUD:** Content editors can view, edit, and validate all 10 content files (`site.json`, `timeline.json`, etc.) with Zod errors properly displayed.
4. **Serverless Image Optimization:** Uploaded images are converted in-memory to WebP with responsive sizes and committed to the Git repository.
5. **Git Review & Finalize Workflow:** Finalizing changes creates a review branch (`ui-backoffice-YYYY-MM-DD-xxxx`), commits all modified JSON and image files atomically, and opens a GitHub Pull Request with a preview link.
6. **Automated Publishing:** Merging the created PR triggers Vercel CI/CD and updates the live SSG portfolio without manual build steps.
