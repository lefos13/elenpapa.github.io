// server/auth.ts
import crypto from "node:crypto";
import { SignJWT, jwtVerify } from "jose";

// server/config.ts
var GITHUB_TOKEN = String(process.env.GITHUB_TOKEN ?? "").trim();
var GITHUB_OWNER = String(process.env.GITHUB_OWNER ?? "").trim();
var GITHUB_REPO = String(process.env.GITHUB_REPO ?? "").trim();
var GITHUB_BRANCH = String(process.env.GITHUB_BRANCH ?? "main").trim();
var AUTH_SECRET = String(
  process.env.AUTH_SECRET ?? process.env.JWT_SECRET ?? "development-insecure-auth-secret-key-change-in-production"
).trim();
var ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD ?? "admin");
var ADMIN_PASSWORD_HASH = String(process.env.ADMIN_PASSWORD_HASH ?? "").trim();
var CREATE_PR_ON_FINALIZE = String(
  process.env.CREATE_PR_ON_FINALIZE ?? process.env.BACKOFFICE_CREATE_PR_ON_FINALIZE ?? "false"
).toLowerCase() === "true";
var AUTH_COOKIE_NAME = String(process.env.AUTH_COOKIE_NAME ?? "backoffice_session");
var BODY_LIMIT_BYTES = 20 * 1024 * 1024;
var MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
var IMAGE_FOLDER_BY_FILE = {
  "book.json": "books",
  "contact.json": "common",
  "home.json": "root",
  "moonlight.json": "moonlight",
  "painted-books.json": "painted-books",
  "posts.json": "posts/webp",
  "publishers.json": "publishers",
  "services.json": "services",
  "site.json": "root",
  "timeline.json": "books"
};
var ALLOWED_IMAGE_EXTENSIONS = /* @__PURE__ */ new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".jfif",
  ".webp",
  ".svg"
]);
var FILE_USAGE_REFERENCES = {
  "book.json": ["Book page (/book)"],
  "contact.json": ["Home page contact section (/)"],
  "home.json": ["Home page hero/intro (/)"],
  "moonlight.json": ["Moonlight page (/moonlight)"],
  "painted-books.json": ["Painted Books page (/painted-books)"],
  "posts.json": ["Home page posts carousel (/)", "Post pages (/posts/:id)"],
  "publishers.json": ["Home page publishers section (/)"],
  "services.json": ["Home page services section (/)"],
  "site.json": ["Global layout: header/footer/SEO (all pages)"],
  "timeline.json": ["Timeline page (/timeline)", "Home page timeline carousel (/)"]
};
var ORIGINAL_PATH_RULES = [
  { file: "site.json", pattern: /^logo\.src$/ },
  { file: "site.json", pattern: /^seo\./ }
];
var FOLDER_OVERRIDE_RULES = [{ file: "site.json", pattern: /^seo\.pages\.[^.]+\.image$/, folder: "og" }];
var MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".jfif": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp"
};

// server/auth.ts
function getSecretKey() {
  return new TextEncoder().encode(AUTH_SECRET);
}
function appendHeader(res, name, value) {
  if (typeof res.setHeader !== "function") return;
  const existing = typeof res.getHeader === "function" ? res.getHeader(name) : void 0;
  if (!existing) {
    res.setHeader(name, value);
  } else if (Array.isArray(existing)) {
    res.setHeader(name, [...existing, value]);
  } else {
    res.setHeader(name, [String(existing), value]);
  }
}
async function createSessionToken(payload, expiresIn = "7d") {
  const secretKey = getSecretKey();
  return await new SignJWT({ ...payload }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(expiresIn).sign(secretKey);
}
async function verifySessionToken(token) {
  if (!token) return null;
  try {
    const secretKey = getSecretKey();
    const { payload } = await jwtVerify(token, secretKey, {
      algorithms: ["HS256"]
    });
    return payload;
  } catch {
    return null;
  }
}
function parseCookies(req) {
  const cookieHeader = req.headers.cookie;
  const cookies = {};
  if (!cookieHeader) return cookies;
  const parts = cookieHeader.split(";");
  for (let i = 0; i < parts.length; i++) {
    const cookie = parts[i]?.trim();
    if (!cookie) continue;
    const eqIdx = cookie.indexOf("=");
    if (eqIdx !== -1) {
      const key = cookie.substring(0, eqIdx).trim();
      const val = cookie.substring(eqIdx + 1).trim();
      cookies[key] = decodeURIComponent(val);
    }
  }
  return cookies;
}
function setAuthCookie(res, token, maxAgeSeconds = 7 * 24 * 60 * 60) {
  const isProduction = process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
  const secureFlag = isProduction ? "; Secure" : "";
  const cookieValue = `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAgeSeconds}; HttpOnly${secureFlag}; SameSite=Lax`;
  appendHeader(res, "Set-Cookie", cookieValue);
}
function clearAuthCookie(res) {
  const isProduction = process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
  const secureFlag = isProduction ? "; Secure" : "";
  const cookieValue = `${AUTH_COOKIE_NAME}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly${secureFlag}; SameSite=Lax`;
  appendHeader(res, "Set-Cookie", cookieValue);
}
function verifyAdminPassword(password) {
  if (!password) return false;
  if (ADMIN_PASSWORD_HASH) {
    const computedHash = crypto.createHash("sha256").update(password).digest("hex");
    const computedBuf = Buffer.from(computedHash, "utf-8");
    const expectedBuf2 = Buffer.from(ADMIN_PASSWORD_HASH, "utf-8");
    if (computedBuf.length !== expectedBuf2.length) {
      crypto.timingSafeEqual(computedBuf, computedBuf);
      return false;
    }
    return crypto.timingSafeEqual(computedBuf, expectedBuf2);
  }
  const inputBuf = Buffer.from(password, "utf-8");
  const expectedBuf = Buffer.from(ADMIN_PASSWORD, "utf-8");
  if (inputBuf.length !== expectedBuf.length) {
    crypto.timingSafeEqual(inputBuf, inputBuf);
    return false;
  }
  return crypto.timingSafeEqual(inputBuf, expectedBuf);
}

// server/http.ts
var HttpError = class _HttpError extends Error {
  statusCode;
  details;
  constructor(statusCode, message, details) {
    super(message);
    this.name = "HttpError";
    this.statusCode = statusCode;
    this.details = details;
    Object.setPrototypeOf(this, _HttpError.prototype);
  }
};
function isHttpError(error) {
  if (error instanceof HttpError) return true;
  return typeof error === "object" && error !== null && "statusCode" in error && typeof error.statusCode === "number" && "message" in error && typeof error.message === "string";
}
function sendJson(res, statusCode, payload) {
  const compatRes = res;
  if (typeof compatRes.setHeader === "function") {
    compatRes.setHeader("Content-Type", MIME_TYPES[".json"] ?? "application/json; charset=utf-8");
    compatRes.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    compatRes.setHeader("Pragma", "no-cache");
    compatRes.setHeader("Expires", "0");
  }
  if (typeof compatRes.status === "function") {
    const statusRes = compatRes.status(statusCode);
    if (typeof statusRes?.json === "function") {
      statusRes.json(payload);
      return;
    }
  }
  res.statusCode = statusCode;
  if (typeof res.writeHead === "function") {
    try {
      res.writeHead(statusCode, {
        "content-type": MIME_TYPES[".json"] ?? "application/json; charset=utf-8",
        "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
        pragma: "no-cache",
        expires: "0"
      });
    } catch {
    }
  }
  res.end(JSON.stringify(payload));
}
async function readJsonBody(req, limitBytes = 12 * 1024 * 1024) {
  const compatReq = req;
  if (compatReq.body !== void 0 && compatReq.body !== null) {
    if (typeof compatReq.body === "object") {
      return compatReq.body;
    }
    if (typeof compatReq.body === "string") {
      if (!compatReq.body.trim()) {
        return {};
      }
      try {
        return JSON.parse(compatReq.body);
      } catch {
        throw new HttpError(400, "Request body must be valid JSON.");
      }
    }
  }
  return new Promise((resolve, reject) => {
    let body = "";
    let completed = false;
    const fail = (error) => {
      if (completed) return;
      completed = true;
      reject(error);
    };
    req.on("data", (chunk) => {
      if (completed) return;
      body += chunk;
      if (Buffer.byteLength(body) > limitBytes) {
        req.destroy();
        fail(new HttpError(413, "Payload too large."));
      }
    });
    req.on("end", () => {
      if (completed) return;
      try {
        if (!body.trim()) {
          completed = true;
          resolve({});
          return;
        }
        completed = true;
        resolve(JSON.parse(body));
      } catch {
        fail(new HttpError(400, "Request body must be valid JSON."));
      }
    });
    req.on("error", () => fail(new HttpError(400, "Failed to read request body.")));
  });
}

// server/handlers/auth-login.ts
async function handleAuthLogin(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { ok: false, error: "Method not allowed" });
    return;
  }
  try {
    const body = await readJsonBody(req);
    const password = typeof body?.password === "string" ? body.password : "";
    const username = typeof body?.username === "string" && body.username.trim().length > 0 ? body.username.trim() : "admin";
    if (!verifyAdminPassword(password)) {
      sendJson(res, 401, {
        ok: false,
        error: "Invalid admin credentials."
      });
      return;
    }
    const token = await createSessionToken({ user: username });
    setAuthCookie(res, token);
    sendJson(res, 200, {
      ok: true,
      user: username
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Authentication failed.";
    sendJson(res, 500, {
      ok: false,
      error: message
    });
  }
}

// server/handlers/auth-logout.ts
async function handleAuthLogout(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { ok: false, error: "Method not allowed" });
    return;
  }
  clearAuthCookie(res);
  sendJson(res, 200, {
    ok: true
  });
}

// server/auth-guard.ts
async function getAuthenticatedUser(req) {
  const cookies = parseCookies(req);
  const cookieToken = cookies[AUTH_COOKIE_NAME];
  if (cookieToken) {
    const payload = await verifySessionToken(cookieToken);
    if (payload) return payload;
  }
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const bearerToken = authHeader.substring(7).trim();
    const payload = await verifySessionToken(bearerToken);
    if (payload) return payload;
  }
  return null;
}
async function requireAuth(req, res) {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    sendJson(res, 401, {
      ok: false,
      error: "Unauthorized",
      message: "Authentication required to access this endpoint."
    });
    return null;
  }
  return user;
}

// server/handlers/auth-session.ts
async function handleAuthSession(req, res) {
  if (req.method !== "GET") {
    sendJson(res, 405, { ok: false, error: "Method not allowed" });
    return;
  }
  const user = await getAuthenticatedUser(req);
  if (user) {
    sendJson(res, 200, {
      authenticated: true,
      user: user.user
    });
    return;
  }
  sendJson(res, 200, {
    authenticated: false
  });
}

// server/handlers/files-detail.ts
import { mkdir as mkdir2, writeFile as writeFile2 } from "node:fs/promises";
import path3 from "node:path";

// server/github.ts
import { createHash } from "node:crypto";
import { readdir, readFile, stat, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { Octokit } from "@octokit/rest";
var cachedOctokit = null;
function isGitHubConfigured() {
  return Boolean(GITHUB_TOKEN && GITHUB_OWNER && GITHUB_REPO);
}
function getOctokit(customToken) {
  if (customToken) {
    return new Octokit({
      auth: customToken,
      userAgent: "portfolio-backoffice/1.0.0"
    });
  }
  if (cachedOctokit) {
    return cachedOctokit;
  }
  const token = GITHUB_TOKEN || void 0;
  cachedOctokit = new Octokit({
    auth: token,
    userAgent: "portfolio-backoffice/1.0.0"
  });
  return cachedOctokit;
}
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
function calculateGitBlobSha(content) {
  const buf = Buffer.isBuffer(content) ? content : Buffer.from(content, "utf-8");
  return createHash("sha1").update(`blob ${buf.length}\0`).update(buf).digest("hex");
}
function normalizeContentPath(filePath) {
  const cleanPath = filePath.replace(/\\/g, "/").replace(/^\/+/, "").replace(/^\.\//, "");
  if (cleanPath.startsWith("public/content/")) {
    return cleanPath;
  }
  if (cleanPath.startsWith("content/")) {
    return `public/${cleanPath}`;
  }
  if (!cleanPath.includes("/")) {
    return `public/content/${cleanPath}`;
  }
  return cleanPath;
}
async function readContentFileFromGit({
  filePath,
  branch = GITHUB_BRANCH || "main",
  owner = GITHUB_OWNER,
  repo = GITHUB_REPO
}) {
  const repoPath = normalizeContentPath(filePath);
  if (isGitHubConfigured()) {
    const octokit = getOctokit();
    try {
      const response = await octokit.repos.getContent({
        owner,
        repo,
        path: repoPath,
        ref: branch
      });
      const data = response.data;
      if (Array.isArray(data)) {
        throw new HttpError(400, `Expected file but found directory at "${repoPath}".`);
      }
      if ("content" in data && typeof data.content === "string") {
        const rawText = data.encoding === "base64" ? Buffer.from(data.content, "base64").toString("utf-8") : data.content;
        try {
          const content = JSON.parse(rawText);
          return {
            content,
            sha: data.sha,
            rawText
          };
        } catch {
          throw new HttpError(500, `Failed to parse JSON content from "${repoPath}".`);
        }
      }
      if ("sha" in data && data.sha) {
        const blobResponse = await octokit.git.getBlob({
          owner,
          repo,
          file_sha: data.sha
        });
        const rawText = Buffer.from(blobResponse.data.content, "base64").toString("utf-8");
        const content = JSON.parse(rawText);
        return {
          content,
          sha: data.sha,
          rawText
        };
      }
      throw new HttpError(404, `Content file "${repoPath}" could not be retrieved from GitHub.`);
    } catch (error) {
      if (error instanceof HttpError) throw error;
      const status = typeof error === "object" && error !== null && "status" in error ? Number(error.status) : null;
      if (status === 404) {
        throw new HttpError(404, `Content file "${repoPath}" not found on branch "${branch}".`);
      }
      const message = error instanceof Error ? error.message : "Unknown GitHub API error";
      throw new HttpError(status || 500, `GitHub error reading "${repoPath}": ${message}`);
    }
  }
  const localAbsolutePath = path.join(process.cwd(), repoPath);
  try {
    const rawText = await readFile(localAbsolutePath, "utf-8");
    const content = JSON.parse(rawText);
    const sha = calculateGitBlobSha(rawText);
    return {
      content,
      sha,
      rawText
    };
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
    if (code === "ENOENT") {
      throw new HttpError(404, `Content file "${repoPath}" not found on local filesystem.`);
    }
    const message = error instanceof Error ? error.message : "File read error";
    throw new HttpError(500, `Error reading local file "${repoPath}": ${message}`);
  }
}
async function listContentFilesFromGit({
  branch = GITHUB_BRANCH || "main",
  owner = GITHUB_OWNER,
  repo = GITHUB_REPO
} = {}) {
  if (isGitHubConfigured()) {
    const octokit = getOctokit();
    try {
      const response = await octokit.repos.getContent({
        owner,
        repo,
        path: "public/content",
        ref: branch
      });
      if (Array.isArray(response.data)) {
        return response.data.filter((item) => item.type === "file" && item.name.endsWith(".json")).map((item) => item.name).sort((left, right) => left.localeCompare(right));
      }
    } catch {
    }
    try {
      const treeResponse = await octokit.git.getTree({
        owner,
        repo,
        tree_sha: branch,
        recursive: "1"
      });
      return (treeResponse.data.tree || []).filter(
        (item) => item.type === "blob" && item.path && item.path.startsWith("public/content/") && item.path.endsWith(".json")
      ).map((item) => path.basename(item.path)).sort((left, right) => left.localeCompare(right));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      throw new HttpError(
        500,
        `Failed to list content files from GitHub branch "${branch}": ${message}`
      );
    }
  }
  const contentDir = path.join(process.cwd(), "public/content");
  try {
    const entries = await readdir(contentDir, { withFileTypes: true });
    return entries.filter((entry) => entry.isFile() && entry.name.endsWith(".json")).map((entry) => entry.name).sort((left, right) => left.localeCompare(right));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    throw new HttpError(500, `Failed to list local content files: ${message}`);
  }
}
async function listImagesFromGitTree({
  branch = GITHUB_BRANCH || "main",
  owner = GITHUB_OWNER,
  repo = GITHUB_REPO
} = {}) {
  if (isGitHubConfigured()) {
    const octokit = getOctokit();
    try {
      const treeResponse = await octokit.git.getTree({
        owner,
        repo,
        tree_sha: branch,
        recursive: "1"
      });
      const items2 = [];
      for (const item of treeResponse.data.tree || []) {
        if (item.type !== "blob" || !item.path || !item.path.startsWith("public/images/")) {
          continue;
        }
        const ext = path.extname(item.path).toLowerCase();
        if (!ALLOWED_IMAGE_EXTENSIONS.has(ext)) {
          continue;
        }
        const relativePath = item.path.replace(/^public\/images\//, "");
        const section = relativePath.includes("/") ? relativePath.split("/")[0] : "root";
        const bytes = typeof item.size === "number" ? item.size : 0;
        items2.push({
          name: path.basename(item.path),
          relativePath,
          publicPath: `/images/${relativePath}`,
          bytes,
          sizeLabel: formatBytes(bytes),
          section,
          sha: item.sha || ""
        });
      }
      return items2.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      throw new HttpError(
        500,
        `Failed to list images from Git tree on branch "${branch}": ${message}`
      );
    }
  }
  const imagesDir = path.join(process.cwd(), "public/images");
  async function scanDir(currentDir) {
    const results = [];
    let entries;
    try {
      entries = await readdir(currentDir, { withFileTypes: true });
    } catch {
      return [];
    }
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        results.push(...await scanDir(fullPath));
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (!ALLOWED_IMAGE_EXTENSIONS.has(ext)) continue;
        const relativeToImages = path.relative(imagesDir, fullPath).replace(/\\/g, "/");
        const section = relativeToImages.includes("/") ? relativeToImages.split("/")[0] : "root";
        const fileStat = await stat(fullPath).catch(() => ({ size: 0 }));
        const bytes = fileStat.size;
        results.push({
          name: entry.name,
          relativePath: relativeToImages,
          publicPath: `/images/${relativeToImages}`,
          bytes,
          sizeLabel: formatBytes(bytes),
          section,
          sha: ""
        });
      }
    }
    return results;
  }
  const items = await scanDir(imagesDir);
  return items.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}
async function getGitStatusSummary({
  branch = GITHUB_BRANCH || "main",
  owner = GITHUB_OWNER,
  repo = GITHUB_REPO
} = {}) {
  if (isGitHubConfigured()) {
    const octokit = getOctokit();
    try {
      const [commitResponse, pullsResponse] = await Promise.all([
        octokit.repos.getCommit({
          owner,
          repo,
          ref: branch
        }),
        octokit.pulls.list({
          owner,
          repo,
          state: "open",
          per_page: 10
        }).catch(() => ({ data: [] }))
      ]);
      const commit = commitResponse.data;
      const author = commit.commit.author?.name || commit.commit.committer?.name || "GitHub";
      const date = commit.commit.committer?.date || commit.commit.author?.date || (/* @__PURE__ */ new Date()).toISOString();
      const message = commit.commit.message.split("\n")[0] || "Update content";
      return {
        branch,
        ahead: 0,
        behind: 0,
        clean: true,
        statusText: "Synced with GitHub repository",
        configured: true,
        latestCommit: {
          sha: commit.sha.slice(0, 7),
          message,
          date,
          author
        },
        openPullRequestsCount: pullsResponse.data?.length ?? 0
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return {
        branch,
        ahead: 0,
        behind: 0,
        clean: true,
        statusText: `GitHub API query error: ${message}`,
        configured: true
      };
    }
  }
  return {
    branch: "main",
    ahead: 0,
    behind: 0,
    clean: true,
    statusText: "Local development mode (Git/GitHub API disabled)",
    configured: false
  };
}
async function createReviewBranch({
  branchName,
  baseBranch = GITHUB_BRANCH || "main",
  owner = GITHUB_OWNER,
  repo = GITHUB_REPO
}) {
  if (isGitHubConfigured()) {
    const octokit = getOctokit();
    try {
      const { data: refData } = await octokit.git.getRef({
        owner,
        repo,
        ref: `heads/${baseBranch}`
      });
      const baseSha = refData.object.sha;
      await octokit.git.createRef({
        owner,
        repo,
        ref: `refs/heads/${branchName}`,
        sha: baseSha
      });
      return {
        branchName,
        ref: `refs/heads/${branchName}`,
        sha: baseSha
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      throw new HttpError(
        500,
        `Failed to create review branch "${branchName}" from "${baseBranch}": ${message}`
      );
    }
  }
  return {
    branchName,
    ref: `refs/heads/${branchName}`,
    sha: "local-development-sha",
    local: true
  };
}
async function commitSessionChanges({
  branch,
  files,
  message,
  owner = GITHUB_OWNER,
  repo = GITHUB_REPO
}) {
  if (files.length === 0) {
    throw new HttpError(400, "Cannot commit an empty list of files.");
  }
  if (isGitHubConfigured()) {
    const octokit = getOctokit();
    try {
      const { data: refData } = await octokit.git.getRef({
        owner,
        repo,
        ref: `heads/${branch}`
      });
      const baseCommitSha = refData.object.sha;
      const { data: commitData } = await octokit.git.getCommit({
        owner,
        repo,
        commit_sha: baseCommitSha
      });
      const baseTreeSha = commitData.tree.sha;
      const treeItems = await Promise.all(
        files.map(async (file) => {
          const isBuffer = Buffer.isBuffer(file.content);
          const cleanPath = file.path.replace(/\\/g, "/").replace(/^\/+/, "").replace(/^\.\//, "");
          const contentStr = isBuffer ? file.content.toString("base64") : typeof file.content === "string" ? file.content : String(file.content);
          const { data: blob } = await octokit.git.createBlob({
            owner,
            repo,
            content: contentStr,
            encoding: isBuffer ? "base64" : "utf-8"
          });
          return {
            path: cleanPath,
            mode: "100644",
            type: "blob",
            sha: blob.sha
          };
        })
      );
      const { data: newTree } = await octokit.git.createTree({
        owner,
        repo,
        base_tree: baseTreeSha,
        tree: treeItems
      });
      const { data: newCommit } = await octokit.git.createCommit({
        owner,
        repo,
        message,
        tree: newTree.sha,
        parents: [baseCommitSha]
      });
      await octokit.git.updateRef({
        owner,
        repo,
        ref: `heads/${branch}`,
        sha: newCommit.sha,
        force: false
      });
      return {
        commitSha: newCommit.sha,
        treeSha: newTree.sha
      };
    } catch (error) {
      const message2 = error instanceof Error ? error.message : "Unknown error";
      throw new HttpError(500, `Failed to commit session changes to branch "${branch}": ${message2}`);
    }
  }
  for (const file of files) {
    const cleanPath = file.path.replace(/\\/g, "/").replace(/^\/+/, "").replace(/^\.\//, "");
    const fullPath = path.join(process.cwd(), cleanPath);
    await mkdir(path.dirname(fullPath), { recursive: true });
    if (Buffer.isBuffer(file.content)) {
      await writeFile(fullPath, file.content);
    } else {
      await writeFile(fullPath, file.content, "utf-8");
    }
  }
  const simulatedCommitSha = `local-${Date.now()}`;
  return {
    commitSha: simulatedCommitSha,
    treeSha: `tree-${simulatedCommitSha}`
  };
}
async function createPullRequestForFinalize({
  branchName,
  baseBranch = GITHUB_BRANCH || "main",
  title,
  body,
  commitMessage,
  owner = GITHUB_OWNER,
  repo = GITHUB_REPO
}) {
  if (!isGitHubConfigured()) {
    return {
      created: false,
      skipped: true,
      warning: "PR creation skipped: GITHUB_TOKEN, GITHUB_OWNER, or GITHUB_REPO is not configured."
    };
  }
  const prTitle = title || `Backoffice update: ${commitMessage || branchName}`;
  const prBody = body || [
    "Automated Pull Request created by Portfolio Backoffice.",
    "",
    `Review Branch: \`${branchName}\``,
    `Target Branch: \`${baseBranch}\``,
    "",
    "Please review the content changes and merge when ready."
  ].join("\n");
  const octokit = getOctokit();
  try {
    const response = await octokit.pulls.create({
      owner,
      repo,
      head: branchName,
      base: baseBranch,
      title: prTitle,
      body: prBody,
      maintainer_can_modify: true
    });
    return {
      created: true,
      url: response.data.html_url,
      number: response.data.number
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      created: false,
      warning: `Review branch pushed successfully, but Pull Request creation failed: ${message}`
    };
  }
}

// server/schemas.ts
import path2 from "node:path";
import { z } from "zod";
var NavItemSchema = z.object({
  label: z.string(),
  href: z.string()
});
var SocialItemSchema = z.object({
  label: z.string(),
  href: z.string(),
  icon: z.string()
});
var SiteContentSchema = z.object({
  seo: z.object({
    siteUrl: z.string(),
    defaultImage: z.string(),
    siteName: z.string(),
    locale: z.string(),
    author: z.string().optional(),
    pages: z.object({
      home: z.object({
        title: z.string(),
        description: z.string(),
        image: z.string(),
        path: z.string()
      }).optional(),
      timeline: z.object({
        title: z.string(),
        description: z.string(),
        image: z.string(),
        path: z.string()
      }).optional(),
      book: z.object({
        title: z.string(),
        description: z.string(),
        image: z.string(),
        path: z.string()
      }).optional(),
      moonlight: z.object({
        title: z.string(),
        description: z.string(),
        image: z.string(),
        path: z.string()
      }).optional(),
      paintedBooks: z.object({
        title: z.string(),
        description: z.string(),
        image: z.string(),
        path: z.string()
      }).optional()
    }).optional()
  }),
  logo: z.object({
    src: z.string(),
    alt: z.string()
  }),
  nav: z.array(NavItemSchema),
  socials: z.array(SocialItemSchema),
  footer: z.object({
    copyright: z.string(),
    developer: z.string()
  })
});
var HomeContentSchema = z.object({
  hero: z.object({
    title: z.string(),
    subtitle: z.string(),
    cta: z.object({
      label: z.string(),
      href: z.string()
    }).optional(),
    backgroundImage: z.string()
  }),
  intro: z.object({
    title: z.string(),
    text: z.string(),
    image: z.object({
      src: z.string(),
      alt: z.string()
    })
  }),
  education: z.array(
    z.object({
      degree: z.string(),
      institution: z.string(),
      year: z.string(),
      icon: z.string().optional()
    })
  ).optional()
});
var TimelineItemSchema = z.object({
  year: z.number(),
  title: z.string(),
  cover: z.string(),
  blurb: z.string(),
  actions: z.string()
});
var TimelineContentSchema = z.object({
  items: z.array(TimelineItemSchema)
});
var ServiceItemSchema = z.object({
  title: z.string(),
  description: z.string(),
  focus: z.string().optional(),
  highlights: z.array(z.string()).optional(),
  icon: z.string().optional(),
  image: z.object({
    src: z.string(),
    alt: z.string()
  }).optional()
});
var ServicesContentSchema = z.object({
  heading: z.string().optional(),
  description: z.string().optional(),
  items: z.array(ServiceItemSchema)
});
var PostItemSchema = z.object({
  title: z.string(),
  image: z.string(),
  url: z.string(),
  summary: z.string(),
  contentHtml: z.string(),
  devOnly: z.boolean().optional()
});
var PostsContentSchema = z.object({
  heading: z.string().optional(),
  description: z.string().optional(),
  items: z.array(PostItemSchema)
});
var ContactContentSchema = z.object({
  title: z.string(),
  description: z.string(),
  mailto: z.string(),
  emailLabel: z.string().optional()
});
var BookEventSchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  date: z.string().optional(),
  location: z.string().optional(),
  description: z.string().optional(),
  instagramEmbedHtml: z.string().optional(),
  image: z.object({
    src: z.string(),
    alt: z.string()
  })
});
var BookContentSchema = z.object({
  hero: z.object({
    title: z.string(),
    tagline: z.string().optional(),
    cover: z.string(),
    coverAlt: z.string().optional(),
    goodreadsUrl: z.string().url().optional().or(z.literal("")),
    goodreadsLabel: z.string().optional(),
    moonlighttalesUrl: z.string().url().optional().or(z.literal("")),
    moonlighttalesLabel: z.string().optional()
  }),
  about: z.object({
    heading: z.string(),
    body: z.string(),
    pullQuote: z.string().optional(),
    pullQuoteAriaLabel: z.string().optional()
  }),
  eventsSection: z.object({
    heading: z.string(),
    subtitle: z.string().optional()
  }).optional(),
  events: z.array(BookEventSchema).optional(),
  preview: z.object({
    heading: z.string(),
    lede: z.string().optional(),
    excerpt: z.string(),
    note: z.string().optional(),
    previewUrl: z.string().url().optional().or(z.literal(""))
  })
});
var MoonlightHeroSchema = z.object({
  title: z.string(),
  subtitle: z.string(),
  description: z.string(),
  stats: z.array(
    z.object({
      label: z.string(),
      value: z.string()
    })
  ).optional(),
  media: z.object({
    primary: z.object({ src: z.string(), alt: z.string() }),
    secondary: z.object({ src: z.string(), alt: z.string() }).optional()
  })
});
var MoonlightMissionSchema = z.object({
  eyebrow: z.string(),
  heading: z.string(),
  body: z.string().optional(),
  pillars: z.array(
    z.object({
      firstName: z.string(),
      lastName: z.string(),
      href: z.string(),
      image: z.object({
        src: z.string(),
        alt: z.string()
      })
    })
  )
});
var MoonlightBubbleSchema = z.object({
  heading: z.string(),
  items: z.array(
    z.object({
      label: z.string(),
      value: z.string(),
      description: z.string().optional()
    })
  )
});
var MoonlightBookJournalSchema = z.object({
  heading: z.string(),
  description: z.string(),
  image: z.object({
    src: z.string(),
    alt: z.string()
  }),
  instagramHighlight: z.object({
    label: z.string(),
    href: z.string(),
    thumbnailSrc: z.string()
  })
});
var MoonlightReleasesSchema = z.object({
  heading: z.string(),
  description: z.string(),
  books: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      tagline: z.string(),
      genre: z.string(),
      cover: z.string()
    })
  )
});
var MoonlightCtaSchema = z.object({
  heading: z.string()
});
var MoonlightContentSchema = z.object({
  hero: MoonlightHeroSchema,
  mission: MoonlightMissionSchema,
  bubbles: MoonlightBubbleSchema.optional(),
  bookJournal: MoonlightBookJournalSchema.optional(),
  releases: MoonlightReleasesSchema.optional(),
  socials: z.array(SocialItemSchema).optional(),
  cta: MoonlightCtaSchema
});
var PaintedBooksContentSchema = z.object({
  hero: z.object({
    title: z.string(),
    subtitle: z.string(),
    description: z.string(),
    media: z.object({
      src: z.string(),
      alt: z.string()
    })
  }),
  gallery: z.object({
    heading: z.string(),
    itemsPerPage: z.number().optional(),
    items: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        author: z.string(),
        media: z.object({
          src: z.string(),
          alt: z.string()
        })
      })
    )
  }),
  cta: z.object({
    heading: z.string(),
    body: z.string(),
    buttons: z.array(
      z.object({
        label: z.string(),
        href: z.string(),
        variant: z.enum(["primary", "ghost"]).optional()
      })
    ).optional()
  })
});
var PublishersContentSchema = z.object({
  heading: z.string(),
  description: z.string().optional(),
  items: z.array(
    z.object({
      name: z.string(),
      description: z.string().optional(),
      logo: z.object({
        src: z.string(),
        alt: z.string()
      }).optional(),
      services: z.array(z.string()).optional()
    })
  )
});
var CONTENT_SCHEMAS = {
  "book.json": BookContentSchema,
  "contact.json": ContactContentSchema,
  "home.json": HomeContentSchema,
  "moonlight.json": MoonlightContentSchema,
  "painted-books.json": PaintedBooksContentSchema,
  "posts.json": PostsContentSchema,
  "publishers.json": PublishersContentSchema,
  "services.json": ServicesContentSchema,
  "site.json": SiteContentSchema,
  "timeline.json": TimelineContentSchema
};
var FILE_SCHEMA_OVERRIDES = {
  "book.json": {
    title: "Book Content",
    description: "Main content for the Book page.",
    sections: {
      hero: { label: "Hero" },
      about: { label: "About section" },
      eventsSection: { label: "Events intro" },
      events: { label: "Events list" },
      preview: { label: "Preview section" }
    }
  },
  "contact.json": {
    title: "Contact Section",
    description: "Contact details shown on the home page."
  },
  "home.json": {
    title: "Home Page Content",
    description: "Hero, intro and education sections for the home page."
  },
  "moonlight.json": {
    title: "Moonlight Page",
    description: "Full page content for the Moonlight route."
  },
  "painted-books.json": {
    title: "Painted Books Page",
    description: "Hero, gallery and CTA content for painted books."
  },
  "posts.json": {
    title: "Posts Content",
    description: "Posts listing and post detail feed content.",
    sections: {
      heading: { label: "Page heading" },
      description: { label: "Page description" },
      items: { label: "Posts list" }
    }
  },
  "publishers.json": {
    title: "Publishers Section",
    description: "Publisher cards and related text content."
  },
  "services.json": {
    title: "Services Section",
    description: "Service cards and highlights for home page."
  },
  "site.json": {
    title: "Global Site Content",
    description: "SEO, navigation, logo and footer content used across pages."
  },
  "timeline.json": {
    title: "Timeline Content",
    description: "Timeline entries shown on timeline and home carousel.",
    sections: {
      items: { label: "Timeline items" }
    }
  }
};
var FIELD_CONTROL_OVERRIDES = {
  contentHtml: "richtext",
  instagramEmbedHtml: "richtext",
  description: "textarea",
  summary: "textarea",
  blurb: "textarea",
  actions: "textarea",
  alt: "text",
  href: "url",
  url: "url",
  mailto: "url",
  email: "email"
};
function humanizeKey(value) {
  return String(value ?? "").replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().replace(/^\w/, (char) => char.toUpperCase());
}
function inferControlByKey(key, value) {
  const lowerKey = String(key ?? "").toLowerCase();
  if (FIELD_CONTROL_OVERRIDES[key]) return FIELD_CONTROL_OVERRIDES[key];
  if (lowerKey.includes("html")) return "richtext";
  if (lowerKey.includes("description") || lowerKey.includes("summary") || lowerKey.includes("blurb")) {
    return "textarea";
  }
  if (lowerKey === "url" || lowerKey.endsWith("url") || lowerKey === "href") return "url";
  if (lowerKey.includes("email")) return "email";
  if (lowerKey.includes("image") || lowerKey.includes("cover") || lowerKey.includes("thumbnail") || lowerKey.includes("logo") || lowerKey.includes("src")) {
    return "image";
  }
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";
  return "text";
}
function buildFieldMeta(value, pathPrefix = "", output = {}) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      const nextPath = pathPrefix ? `${pathPrefix}.${index}` : String(index);
      buildFieldMeta(item, nextPath, output);
    });
    return output;
  }
  if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, child]) => {
      const nextPath = pathPrefix ? `${pathPrefix}.${key}` : key;
      if (child && typeof child === "object" && !Array.isArray(child)) {
        output[nextPath] = {
          label: humanizeKey(key),
          control: "group"
        };
      }
      if (Array.isArray(child)) {
        output[nextPath] = {
          label: humanizeKey(key),
          control: "repeater"
        };
      }
      if (!Array.isArray(child) && (!child || typeof child !== "object")) {
        output[nextPath] = {
          label: humanizeKey(key),
          control: inferControlByKey(key, child),
          placeholder: typeof child === "string" ? `Enter ${humanizeKey(key).toLowerCase()}` : ""
        };
      }
      buildFieldMeta(child, nextPath, output);
    });
    return output;
  }
  return output;
}
function buildSectionsFromContent(filePath, content) {
  const fileName = path2.basename(filePath);
  const override = FILE_SCHEMA_OVERRIDES[fileName] ?? {};
  const sectionEntries = content && typeof content === "object" && !Array.isArray(content) ? Object.entries(content) : [];
  return sectionEntries.map(([key]) => {
    const sectionOverride = override.sections?.[key] ?? {};
    return {
      id: key,
      path: key,
      label: sectionOverride.label || humanizeKey(key),
      description: sectionOverride.description || "",
      collapsedByDefault: false
    };
  });
}
function getSchemaIdForFilePath(filePath) {
  return path2.basename(filePath);
}
function getUsageForFilePath(filePath) {
  return FILE_USAGE_REFERENCES[path2.basename(filePath)] ?? [];
}
function buildEditorSchema({
  filePath,
  content
}) {
  const fileName = path2.basename(filePath);
  const override = FILE_SCHEMA_OVERRIDES[fileName] ?? {};
  return {
    id: getSchemaIdForFilePath(filePath),
    file: filePath,
    title: override.title || `${humanizeKey(fileName.replace(/\.json$/i, ""))} Content`,
    description: override.description || "Guided content editing form.",
    usage: getUsageForFilePath(filePath),
    sections: buildSectionsFromContent(filePath, content),
    fieldMeta: buildFieldMeta(content)
  };
}
function getSchemaById(schemaId, content) {
  return buildEditorSchema({ filePath: schemaId, content });
}
function getContentFileDescriptor(filePath, stats) {
  const fileName = path2.basename(filePath);
  const override = FILE_SCHEMA_OVERRIDES[fileName] ?? {};
  return {
    file: filePath,
    title: override.title || `${humanizeKey(fileName.replace(/\.json$/i, ""))} Content`,
    description: override.description || "Guided content editing form.",
    usage: getUsageForFilePath(filePath),
    schemaId: getSchemaIdForFilePath(filePath),
    ...stats?.size !== void 0 ? { sizeBytes: stats.size } : {},
    ...stats?.updatedAt !== void 0 ? { updatedAt: stats.updatedAt } : {}
  };
}
function listContentFileDescriptors(files, statsMap) {
  return files.map((file) => getContentFileDescriptor(file, statsMap?.[file]));
}
function valueType(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}
function joinPath(pathPrefix, segment) {
  if (!pathPrefix) return String(segment);
  return `${pathPrefix}.${segment}`;
}
function validateWithTemplate({
  templateValue,
  nextValue,
  path: currentPath,
  issues
}) {
  const templateType = valueType(templateValue);
  const nextType = valueType(nextValue);
  if (templateType !== nextType) {
    issues.push({
      path: currentPath,
      code: "TYPE_MISMATCH",
      message: `Expected ${templateType} but got ${nextType}.`
    });
    return;
  }
  if (templateType === "object" && templateValue && nextValue) {
    const templateObj = templateValue;
    const nextObj = nextValue;
    const templateKeys = Object.keys(templateObj);
    const nextKeys = Object.keys(nextObj);
    const missingKeys = templateKeys.filter((key) => !Object.hasOwn(nextObj, key));
    const extraKeys = nextKeys.filter((key) => !Object.hasOwn(templateObj, key));
    missingKeys.forEach((key) => {
      issues.push({
        path: joinPath(currentPath, key),
        code: "MISSING_KEY",
        message: `Field "${key}" is required by the content structure.`
      });
    });
    extraKeys.forEach((key) => {
      issues.push({
        path: joinPath(currentPath, key),
        code: "EXTRA_KEY",
        message: `Field "${key}" is not allowed in this content structure.`
      });
    });
    templateKeys.forEach((key) => {
      if (!Object.hasOwn(nextObj, key)) return;
      validateWithTemplate({
        templateValue: templateObj[key],
        nextValue: nextObj[key],
        path: joinPath(currentPath, key),
        issues
      });
    });
    return;
  }
  if (templateType === "array") {
    const templateItems = Array.isArray(templateValue) ? templateValue : [];
    const nextItems = Array.isArray(nextValue) ? nextValue : [];
    if (!templateItems.length || !nextItems.length) return;
    const templateItem = templateItems[0];
    nextItems.forEach((item, index) => {
      validateWithTemplate({
        templateValue: templateItem,
        nextValue: item,
        path: `${currentPath}[${index}]`,
        issues
      });
    });
  }
}
function validateContentPayload({
  currentContent,
  nextContent,
  schemaId
}) {
  const issues = [];
  const fileKey = schemaId ? path2.basename(schemaId) : void 0;
  const schema = fileKey ? CONTENT_SCHEMAS[fileKey] : void 0;
  if (schema) {
    const zodResult = schema.safeParse(nextContent);
    if (!zodResult.success) {
      zodResult.error.issues.forEach((issue) => {
        const formattedPath = issue.path.map((seg) => typeof seg === "number" ? `[${seg}]` : String(seg)).join(".").replace(/\.\[/g, "[");
        issues.push({
          path: formattedPath,
          code: issue.code,
          message: issue.message
        });
      });
    }
  }
  if (currentContent !== void 0 && currentContent !== null) {
    const structuralIssues = [];
    validateWithTemplate({
      templateValue: currentContent,
      nextValue: nextContent,
      path: "",
      issues: structuralIssues
    });
    structuralIssues.forEach((issue) => {
      const exists = issues.some((existing) => existing.path === issue.path);
      if (!exists) {
        issues.push(issue);
      }
    });
  }
  return {
    ok: issues.length === 0,
    issues
  };
}
function collectImageUsages(value, jsonPath = "", output = []) {
  if (typeof value === "string" && value.startsWith("/images/")) {
    output.push({ imagePath: value, jsonPath });
    return output;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      collectImageUsages(item, `${jsonPath}[${index}]`, output);
    });
    return output;
  }
  if (value && typeof value === "object" && value !== null) {
    Object.entries(value).forEach(([key, item]) => {
      const nextPath = jsonPath ? `${jsonPath}.${key}` : key;
      collectImageUsages(item, nextPath, output);
    });
  }
  return output;
}

// server/handlers/files-detail.ts
function extractFilePath(req) {
  const queryFile = req.query.file;
  let rawFile = Array.isArray(queryFile) ? queryFile[0] : queryFile;
  if (!rawFile && req.url) {
    const url = new URL(req.url, "http://localhost");
    const match = url.pathname.match(/\/api\/files\/(.+)$/);
    if (match) {
      rawFile = decodeURIComponent(match[1]);
    }
  }
  if (!rawFile || typeof rawFile !== "string") {
    throw new HttpError(400, "Missing or invalid file parameter.");
  }
  const normalized = path3.normalize(rawFile).replace(/\\/g, "/");
  const baseName = path3.basename(normalized);
  if (normalized.includes("..") || normalized.startsWith("/") || !baseName) {
    throw new HttpError(400, "Invalid content file path.");
  }
  return baseName.endsWith(".json") ? baseName : `${baseName}.json`;
}
async function handleFilesDetail(req, res) {
  const method = req.method?.toUpperCase();
  if (method !== "GET" && method !== "PUT" && method !== "HEAD") {
    sendJson(res, 405, { ok: false, error: "Method not allowed" });
    return;
  }
  try {
    const fileName = extractFilePath(req);
    if (method === "GET" || method === "HEAD") {
      const { content, sha } = await readContentFileFromGit({ filePath: fileName });
      const schema = buildEditorSchema({ filePath: fileName, content });
      sendJson(res, 200, {
        file: fileName,
        content,
        revision: sha,
        schemaId: schema.id,
        usage: schema.usage
      });
      return;
    }
    if (method === "PUT") {
      const user = await requireAuth(req, res);
      if (!user) return;
      const body = await readJsonBody(req);
      const { content: currentContent, sha: currentSha } = await readContentFileFromGit({
        filePath: fileName
      });
      if (body?.baseRevision && body.baseRevision !== currentSha) {
        sendJson(res, 409, {
          ok: false,
          error: "This file changed elsewhere. Reload to sync latest content before saving.",
          currentRevision: currentSha
        });
        return;
      }
      const payloadContent = body && typeof body === "object" && "content" in body ? body.content : body;
      const validation = validateContentPayload({
        currentContent,
        nextContent: payloadContent,
        schemaId: fileName
      });
      if (!validation.ok) {
        sendJson(res, 422, {
          ok: false,
          error: "Validation failed. Please review highlighted fields and try again.",
          issues: validation.issues
        });
        return;
      }
      const formattedJson = `${JSON.stringify(payloadContent, null, 2)}
`;
      const nextSha = calculateGitBlobSha(formattedJson);
      try {
        const localPath = path3.join(process.cwd(), "public/content", fileName);
        await mkdir2(path3.dirname(localPath), { recursive: true });
        await writeFile2(localPath, formattedJson, "utf-8");
      } catch {
      }
      sendJson(res, 200, {
        ok: true,
        file: fileName,
        content: payloadContent,
        revision: nextSha
      });
      return;
    }
  } catch (error) {
    if (isHttpError(error)) {
      sendJson(res, error.statusCode, {
        ok: false,
        error: error.message,
        details: error.details
      });
      return;
    }
    const message = error instanceof Error ? error.message : "Operation failed on content file.";
    sendJson(res, 500, {
      ok: false,
      error: message
    });
  }
}

// server/handlers/files-index.ts
import { stat as stat2 } from "node:fs/promises";
import path4 from "node:path";
async function handleFilesIndex(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    sendJson(res, 405, { ok: false, error: "Method not allowed" });
    return;
  }
  try {
    const files = await listContentFilesFromGit();
    const statsMap = {};
    await Promise.all(
      files.map(async (file) => {
        try {
          const filePath = path4.join(process.cwd(), "public/content", file);
          const fileStat = await stat2(filePath);
          statsMap[file] = {
            size: fileStat.size,
            updatedAt: fileStat.mtime.toISOString()
          };
        } catch {
        }
      })
    );
    const descriptors = listContentFileDescriptors(files, statsMap);
    sendJson(res, 200, {
      files,
      descriptors
    });
  } catch (error) {
    if (isHttpError(error)) {
      sendJson(res, error.statusCode, {
        ok: false,
        error: error.message,
        details: error.details
      });
      return;
    }
    const message = error instanceof Error ? error.message : "Failed to list content files.";
    sendJson(res, 500, {
      ok: false,
      error: message
    });
  }
}

// server/handlers/git-finalize.ts
function normalizeRepoPath(filePath) {
  const clean = filePath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (clean.startsWith("public/")) return clean;
  if (clean.startsWith("content/")) return `public/${clean}`;
  if (clean.endsWith(".json")) return `public/content/${clean}`;
  return `public/${clean}`;
}
function generateReviewBranchName(date = /* @__PURE__ */ new Date()) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const rand = Math.random().toString(36).slice(2, 6);
  return `ui-backoffice-${yyyy}-${mm}-${dd}-${rand}`;
}
function generateDefaultCommitMessage(date = /* @__PURE__ */ new Date()) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `ui-backoffice-${yyyy}-${mm}-${dd}`;
}
function formatContentForCommit(content) {
  if (Buffer.isBuffer(content)) return content;
  if (typeof content === "string") {
    if (content.startsWith("data:") && content.includes(";base64,")) {
      return Buffer.from(content.split(";base64,")[1], "base64");
    }
    return content;
  }
  return `${JSON.stringify(content, null, 2)}
`;
}
async function handleGitFinalize(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { ok: false, error: "Method not allowed" });
    return;
  }
  const user = await requireAuth(req, res);
  if (!user) return;
  try {
    const body = await readJsonBody(req);
    const commitFiles = [];
    if (Array.isArray(body?.files) && body.files.length > 0) {
      for (const item of body.files) {
        if (!item || typeof item.path !== "string") continue;
        commitFiles.push({
          path: normalizeRepoPath(item.path),
          content: formatContentForCommit(item.content)
        });
      }
    } else if (Array.isArray(body?.sessionPaths) && body.sessionPaths.length > 0) {
      for (const rawPath of body.sessionPaths) {
        if (typeof rawPath !== "string") continue;
        const repoPath = normalizeRepoPath(rawPath);
        if (repoPath.endsWith(".json")) {
          const fileName = repoPath.split("/").pop() || "";
          try {
            const { content } = await readContentFileFromGit({ filePath: fileName });
            commitFiles.push({
              path: repoPath,
              content: formatContentForCommit(content)
            });
          } catch {
          }
        }
      }
    }
    if (!commitFiles.length) {
      sendJson(res, 400, {
        ok: false,
        error: "No files provided to finalize."
      });
      return;
    }
    const branchName = generateReviewBranchName();
    const commitMessage = (body?.commitMessage ?? "").trim() || generateDefaultCommitMessage();
    await createReviewBranch({ branchName, baseBranch: "main" });
    const commitResult = await commitSessionChanges({
      branch: branchName,
      files: commitFiles,
      message: commitMessage
    });
    const prResult = await createPullRequestForFinalize({
      branchName,
      baseBranch: "main",
      commitMessage
    });
    const responsePayload = {
      result: {
        branchName,
        commitMessage,
        commitSha: commitResult.commitSha,
        pullRequest: prResult
      }
    };
    sendJson(res, 200, responsePayload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Git finalize workflow failed.";
    sendJson(res, 500, { ok: false, error: message });
  }
}

// server/handlers/git-preview.ts
import path5 from "node:path";
function normalizeSessionPaths(sessionPaths) {
  if (!Array.isArray(sessionPaths)) return [];
  const unique = /* @__PURE__ */ new Set();
  for (const item of sessionPaths) {
    if (typeof item !== "string") continue;
    const clean = item.trim().replace(/\\/g, "/").replace(/^\/+/, "").replace(/^\.\//, "");
    if (!clean) continue;
    const normalized = path5.posix.normalize(clean);
    if (!normalized || normalized === "." || normalized.startsWith("../") || normalized.includes("/../")) {
      continue;
    }
    unique.add(normalized);
  }
  return Array.from(unique);
}
async function handleGitPreview(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { ok: false, error: "Method not allowed" });
    return;
  }
  try {
    const body = await readJsonBody(req);
    const sessionPaths = normalizeSessionPaths(body?.sessionPaths);
    const entries = sessionPaths.map((filePath) => ({
      code: "M ",
      path: filePath,
      raw: `M  ${filePath}`
    }));
    const summary = sessionPaths.length > 0 ? `${sessionPaths.length} file(s) staged for review (${sessionPaths.join(", ")})` : "No tracked changes found for this session.";
    const preview = {
      paths: sessionPaths,
      entries,
      summary
    };
    sendJson(res, 200, { preview });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate git preview.";
    sendJson(res, 500, { ok: false, error: message });
  }
}

// server/handlers/git-status.ts
async function handleGitStatus(req, res) {
  if (req.method !== "GET") {
    sendJson(res, 405, { ok: false, error: "Method not allowed" });
    return;
  }
  try {
    const summary = await getGitStatusSummary();
    const status = {
      ...summary,
      currentBranch: summary.branch,
      mainAhead: summary.ahead,
      mainBehind: summary.behind,
      worktreeDirty: !summary.clean,
      changeCount: summary.clean ? 0 : 1,
      changes: [],
      sync: {
        action: "up-to-date",
        details: summary.statusText
      }
    };
    sendJson(res, 200, { status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to retrieve git status.";
    sendJson(res, 500, { ok: false, error: message });
  }
}

// server/handlers/images-index.ts
async function handleImagesIndex(req, res) {
  if (req.method !== "GET") {
    sendJson(res, 405, { ok: false, error: "Method not allowed" });
    return;
  }
  const user = await requireAuth(req, res);
  if (!user) return;
  try {
    const contentFiles = await listContentFilesFromGit();
    const usagesByImage = /* @__PURE__ */ new Map();
    await Promise.all(
      contentFiles.map(async (file) => {
        try {
          const { content } = await readContentFileFromGit({ filePath: file });
          const usages = collectImageUsages(content, "");
          usages.forEach((usage) => {
            if (!usagesByImage.has(usage.imagePath)) {
              usagesByImage.set(usage.imagePath, []);
            }
            usagesByImage.get(usage.imagePath)?.push({
              file,
              jsonPath: usage.jsonPath
            });
          });
        } catch {
        }
      })
    );
    const treeImages = await listImagesFromGitTree();
    const images = treeImages.map((img) => ({
      name: img.name,
      relativePath: img.relativePath,
      publicPath: img.publicPath,
      bytes: img.bytes,
      sizeLabel: img.sizeLabel,
      section: img.section,
      usages: usagesByImage.get(img.publicPath) ?? []
    }));
    const queryRaw = req.query.q;
    const queryStr = Array.isArray(queryRaw) ? queryRaw[0] : queryRaw;
    const query = (queryStr ?? "").trim().toLowerCase();
    const filteredImages = query ? images.filter((img) => {
      const usageText = img.usages.map((u) => `${u.file} ${u.jsonPath}`).join(" ");
      const haystack = `${img.name} ${img.relativePath} ${img.publicPath} ${img.section} ${usageText}`.toLowerCase();
      return haystack.includes(query);
    }) : images;
    sendJson(res, 200, {
      images: filteredImages
    });
  } catch (error) {
    if (isHttpError(error)) {
      sendJson(res, error.statusCode, { ok: false, error: error.message });
      return;
    }
    const message = error instanceof Error ? error.message : "Failed to list images.";
    sendJson(res, 500, { ok: false, error: message });
  }
}

// server/handlers/schemas-detail.ts
import path6 from "node:path";
function extractSchemaId(req) {
  const queryId = req.query.id;
  let rawId = Array.isArray(queryId) ? queryId[0] : queryId;
  if (!rawId && req.url) {
    const url = new URL(req.url, "http://localhost");
    const match = url.pathname.match(/\/api\/schemas\/(.+)$/);
    if (match) {
      rawId = decodeURIComponent(match[1]);
    }
  }
  if (!rawId || typeof rawId !== "string") {
    throw new HttpError(400, "Missing or invalid schema id parameter.");
  }
  const normalized = path6.normalize(rawId).replace(/\\/g, "/");
  const baseName = path6.basename(normalized);
  if (normalized.includes("..") || normalized.startsWith("/") || !baseName) {
    throw new HttpError(400, "Invalid schema id.");
  }
  return baseName.endsWith(".json") ? baseName : `${baseName}.json`;
}
async function handleSchemasDetail(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    sendJson(res, 405, { ok: false, error: "Method not allowed" });
    return;
  }
  try {
    const schemaId = extractSchemaId(req);
    const { content } = await readContentFileFromGit({ filePath: schemaId });
    const schema = getSchemaById(schemaId, content);
    sendJson(res, 200, {
      schema
    });
  } catch (error) {
    if (isHttpError(error)) {
      sendJson(res, error.statusCode, {
        ok: false,
        error: error.message,
        details: error.details
      });
      return;
    }
    const message = error instanceof Error ? error.message : "Failed to retrieve schema.";
    sendJson(res, 500, {
      ok: false,
      error: message
    });
  }
}

// server/handlers/session-summary.ts
import path7 from "node:path";
function parseQueryPaths(raw) {
  if (!raw) return [];
  const list = [];
  if (Array.isArray(raw)) {
    raw.forEach((item) => {
      if (typeof item === "string") {
        list.push(...item.split(","));
      }
    });
  } else if (typeof raw === "string") {
    list.push(...raw.split(","));
  }
  const unique = /* @__PURE__ */ new Set();
  for (const item of list) {
    const clean = item.trim().replace(/\\/g, "/").replace(/^\/+/, "");
    if (!clean) continue;
    const normalized = path7.posix.normalize(clean);
    if (!normalized || normalized === "." || normalized.startsWith("../") || normalized.includes("/../")) {
      continue;
    }
    unique.add(normalized);
  }
  return Array.from(unique);
}
async function handleSessionSummary(req, res) {
  if (req.method !== "GET") {
    sendJson(res, 405, { ok: false, error: "Method not allowed" });
    return;
  }
  try {
    const rawPaths = req.query.paths;
    const touchedPaths = parseQueryPaths(rawPaths);
    const changedEntries = touchedPaths.map((itemPath) => {
      const fileName = path7.posix.basename(itemPath);
      let type = "unknown";
      if (itemPath.includes("content/") || itemPath.endsWith(".json")) {
        type = "content";
      } else if (itemPath.includes("images/") || /\.(png|jpe?g|webp|svg|jfif)$/i.test(itemPath)) {
        type = "asset";
      }
      return {
        path: itemPath,
        name: fileName,
        type
      };
    });
    const summary = {
      touchedPaths,
      changedEntries,
      pendingTempUploads: {
        referenced: [],
        dangling: [],
        count: 0
      }
    };
    sendJson(res, 200, { summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to retrieve session summary.";
    sendJson(res, 500, { ok: false, error: message });
  }
}

// server/image-processor.ts
import path8 from "node:path";
import sharp from "sharp";
var RESPONSIVE_FOLDERS = {
  posts: true,
  "posts/webp": true,
  books: true,
  "painted-books": true,
  moonlight: true
};
var RESPONSIVE_WIDTHS = [400, 800];
function sanitizeFileName(filename) {
  const normalized = String(filename ?? "").trim().replace(/\\/g, "/");
  const parsed = path8.posix.parse(normalized);
  const safeName = parsed.name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^\p{L}\p{N}.-]+/gu, "-").replace(/_/g, "-").replace(/-+/g, "-").replace(/^[-_.]+|[-_.]+$/g, "");
  const safeExt = parsed.ext.toLowerCase();
  if (!ALLOWED_IMAGE_EXTENSIONS.has(safeExt)) {
    throw new HttpError(
      400,
      `Unsupported image extension "${parsed.ext}". Allowed extensions: ${Array.from(
        ALLOWED_IMAGE_EXTENSIONS
      ).join(", ")}`
    );
  }
  const baseName = safeName || "upload";
  return `${baseName}${safeExt}`;
}
function buildUniqueImageName(safeName, ext = ".webp") {
  const normalized = safeName.replace(/\\/g, "/");
  const parsed = path8.posix.parse(normalized);
  const baseName = parsed.name || safeName;
  const normalizedExt = ext.startsWith(".") ? ext.toLowerCase() : `.${ext.toLowerCase()}`;
  return `${baseName}-${Date.now()}${normalizedExt}`;
}
function resolveFolderFromPreviousPath(previousImagePath) {
  if (typeof previousImagePath !== "string" || !previousImagePath.startsWith("/images/")) {
    return "";
  }
  const relativePath = previousImagePath.replace(/^\/images\//, "");
  const normalizedPath = path8.posix.normalize(relativePath);
  if (!normalizedPath || normalizedPath.startsWith("../") || normalizedPath.includes("/../")) {
    return "";
  }
  const directory = path8.posix.dirname(normalizedPath);
  return directory === "." ? "root" : directory;
}
function getImageDestinationFolder(options = {}) {
  const { activeFile, fieldPath, previousImagePath } = options;
  const previousFolder = resolveFolderFromPreviousPath(previousImagePath);
  if (previousFolder) {
    return previousFolder;
  }
  const fileName = activeFile ? path8.posix.basename(activeFile.replace(/\\/g, "/")) : "";
  const normalizedFieldPath = String(fieldPath ?? "").trim();
  if (fileName && normalizedFieldPath) {
    const matchingOverride = FOLDER_OVERRIDE_RULES.find(
      (rule) => rule.file === fileName && rule.pattern.test(normalizedFieldPath)
    );
    if (matchingOverride) {
      return matchingOverride.folder;
    }
  }
  if (fileName && fileName in IMAGE_FOLDER_BY_FILE) {
    return IMAGE_FOLDER_BY_FILE[fileName];
  }
  return "common";
}
function shouldKeepOriginalFormat(options) {
  const fileName = options.activeFile ? path8.posix.basename(options.activeFile.replace(/\\/g, "/")) : "";
  const normalizedFieldPath = String(options.fieldPath ?? "").trim();
  if (!fileName || !normalizedFieldPath) return false;
  return ORIGINAL_PATH_RULES.some(
    (rule) => rule.file === fileName && rule.pattern.test(normalizedFieldPath)
  );
}
async function processUploadedImage(options) {
  const { buffer, originalFilename, activeFile, fieldPath, previousImagePath } = options;
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.byteLength === 0) {
    throw new HttpError(400, "Image payload is empty or missing.");
  }
  if (buffer.byteLength > MAX_UPLOAD_BYTES) {
    const maxMb = Math.round(MAX_UPLOAD_BYTES / (1024 * 1024));
    throw new HttpError(400, `Image is too large. Maximum upload size is ${maxMb} MB.`);
  }
  const sanitized = sanitizeFileName(originalFilename);
  const parsedSafe = path8.posix.parse(sanitized);
  const originalExt = parsedSafe.ext.toLowerCase();
  const baseName = parsedSafe.name;
  const folder = getImageDestinationFolder({ activeFile, fieldPath, previousImagePath });
  const keepOriginal = shouldKeepOriginalFormat({ activeFile, fieldPath });
  const isSvg = originalExt === ".svg";
  const folderPrefix = folder === "root" ? "" : `${folder}/`;
  if (isSvg) {
    const uniqueName = buildUniqueImageName(baseName, ".svg");
    const publicPath = `/images/${folderPrefix}${uniqueName}`;
    const repoPath = `public/images/${folderPrefix}${uniqueName}`;
    let metaWidth;
    let metaHeight;
    try {
      const svgMeta = await sharp(buffer).metadata();
      metaWidth = svgMeta.width;
      metaHeight = svgMeta.height;
    } catch {
    }
    const primaryVariant2 = {
      path: repoPath,
      buffer,
      publicPath,
      width: metaWidth,
      height: metaHeight
    };
    return {
      primaryPublicPath: publicPath,
      variants: [primaryVariant2],
      metadata: {
        width: metaWidth,
        height: metaHeight,
        format: "svg",
        size: buffer.byteLength
      }
    };
  }
  const sharpInstance = sharp(buffer);
  const metadata = await sharpInstance.metadata();
  if (!metadata.format) {
    throw new HttpError(400, "Could not decode image format.");
  }
  let primaryBuffer;
  let primaryExt;
  if (keepOriginal) {
    primaryExt = originalExt;
    if (metadata.format === "png") {
      primaryBuffer = await sharp(buffer).png({ compressionLevel: 9 }).toBuffer();
    } else if (metadata.format === "jpeg") {
      primaryBuffer = await sharp(buffer).jpeg({ quality: 85 }).toBuffer();
    } else if (metadata.format === "webp") {
      primaryBuffer = await sharp(buffer).webp({ quality: 85, effort: 4 }).toBuffer();
    } else {
      primaryBuffer = buffer;
    }
  } else {
    primaryExt = ".webp";
    primaryBuffer = await sharp(buffer).webp({ quality: 85, effort: 4 }).toBuffer();
  }
  const primaryUniqueName = buildUniqueImageName(baseName, primaryExt);
  const primaryPublicPath = `/images/${folderPrefix}${primaryUniqueName}`;
  const primaryRepoPath = `public/images/${folderPrefix}${primaryUniqueName}`;
  const primaryMeta = await sharp(primaryBuffer).metadata();
  const primaryVariant = {
    path: primaryRepoPath,
    buffer: primaryBuffer,
    publicPath: primaryPublicPath,
    width: primaryMeta.width ?? metadata.width,
    height: primaryMeta.height ?? metadata.height
  };
  const variants = [primaryVariant];
  const isResponsive = Boolean(RESPONSIVE_FOLDERS[folder]) || Object.keys(RESPONSIVE_FOLDERS).some((target) => folder.startsWith(`${target}/`));
  if (isResponsive && !keepOriginal) {
    const uniqueBase = path8.posix.parse(primaryUniqueName).name;
    for (const targetWidth of RESPONSIVE_WIDTHS) {
      const wBuffer = await sharp(buffer).resize({ width: targetWidth, withoutEnlargement: true }).webp({ quality: 80, effort: 4 }).toBuffer();
      const wMeta = await sharp(wBuffer).metadata();
      const variantName = `${uniqueBase}-${targetWidth}w.webp`;
      const variantPublicPath = `/images/${folderPrefix}${variantName}`;
      const variantRepoPath = `public/images/${folderPrefix}${variantName}`;
      variants.push({
        path: variantRepoPath,
        buffer: wBuffer,
        publicPath: variantPublicPath,
        width: wMeta.width,
        height: wMeta.height
      });
    }
  }
  return {
    primaryPublicPath,
    variants,
    metadata: {
      width: primaryVariant.width ?? metadata.width,
      height: primaryVariant.height ?? metadata.height,
      format: keepOriginal ? metadata.format ?? primaryExt.replace(".", "") : "webp",
      size: primaryBuffer.byteLength
    }
  };
}

// server/handlers/upload-image.ts
async function handleUploadImage(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { ok: false, error: "Method not allowed" });
    return;
  }
  const user = await requireAuth(req, res);
  if (!user) return;
  try {
    const body = await readJsonBody(req);
    const rawBase64 = body?.base64 || body?.fileDataBase64 || body?.data || "";
    if (!rawBase64) {
      sendJson(res, 400, { ok: false, error: "Missing image base64 data." });
      return;
    }
    const cleanBase64 = rawBase64.replace(/^data:[^;]+;base64,/, "");
    const buffer = Buffer.from(cleanBase64, "base64");
    if (!buffer.length) {
      sendJson(res, 400, { ok: false, error: "Invalid or empty image data." });
      return;
    }
    const originalFilename = body?.filename || body?.fileName || body?.name || body?.originalFilename || "upload.png";
    const activeFile = body?.activeFile || body?.file || "";
    const fieldPath = body?.fieldPath || body?.path || "";
    const previousImagePath = body?.previousPath || body?.previousImagePath || "";
    const processed = await processUploadedImage({
      buffer,
      originalFilename,
      activeFile,
      fieldPath,
      previousImagePath
    });
    const variants = processed.variants.map((v) => ({
      path: v.path,
      bufferBase64: v.buffer.toString("base64"),
      publicPath: v.publicPath,
      width: v.width,
      height: v.height
    }));
    const responsePayload = {
      ok: true,
      imagePath: processed.primaryPublicPath,
      publicPath: processed.primaryPublicPath,
      variants,
      sizeLabel: formatBytes(processed.metadata.size),
      metadata: processed.metadata
    };
    sendJson(res, 200, responsePayload);
  } catch (error) {
    if (isHttpError(error)) {
      sendJson(res, error.statusCode, { ok: false, error: error.message });
      return;
    }
    const message = error instanceof Error ? error.message : "Image upload processing failed.";
    sendJson(res, 500, { ok: false, error: message });
  }
}

// server/handlers/validate-file.ts
import path9 from "node:path";
function extractFilePath2(req) {
  const queryFile = req.query.file;
  let rawFile = Array.isArray(queryFile) ? queryFile[0] : queryFile;
  if (!rawFile && req.url) {
    const url = new URL(req.url, "http://localhost");
    const match = url.pathname.match(/\/api\/validate\/(.+)$/);
    if (match) {
      rawFile = decodeURIComponent(match[1]);
    }
  }
  if (!rawFile || typeof rawFile !== "string") {
    throw new HttpError(400, "Missing or invalid file parameter.");
  }
  const normalized = path9.normalize(rawFile).replace(/\\/g, "/");
  const baseName = path9.basename(normalized);
  if (normalized.includes("..") || normalized.startsWith("/") || !baseName) {
    throw new HttpError(400, "Invalid content file path.");
  }
  return baseName.endsWith(".json") ? baseName : `${baseName}.json`;
}
async function handleValidateFile(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { ok: false, error: "Method not allowed" });
    return;
  }
  try {
    const filePath = extractFilePath2(req);
    const body = await readJsonBody(req);
    const nextContent = body && typeof body === "object" && "content" in body ? body.content : body;
    let currentContent = void 0;
    try {
      const current = await readContentFileFromGit({ filePath });
      currentContent = current.content;
    } catch {
    }
    const validation = validateContentPayload({
      currentContent,
      nextContent,
      schemaId: filePath
    });
    sendJson(res, 200, {
      ok: validation.ok,
      issues: validation.issues
    });
  } catch (error) {
    if (isHttpError(error)) {
      sendJson(res, error.statusCode, {
        ok: false,
        error: error.message,
        details: error.details
      });
      return;
    }
    const message = error instanceof Error ? error.message : "Validation request failed.";
    sendJson(res, 500, {
      ok: false,
      error: message
    });
  }
}

// server/router.ts
function resolvePathname(req) {
  let pathname = "";
  if (req.url) {
    try {
      pathname = new URL(req.url, "http://localhost").pathname;
    } catch {
      pathname = req.url.split("?")[0] || "";
    }
  }
  if (!pathname || pathname === "/" || pathname === "/api" || pathname.startsWith("/api/[...path]")) {
    const queryPath = req.query?.path;
    if (Array.isArray(queryPath)) {
      pathname = `/api/${queryPath.join("/")}`;
    } else if (typeof queryPath === "string" && queryPath.length > 0) {
      pathname = `/api/${queryPath}`;
    }
  }
  if (pathname.length > 1 && pathname.endsWith("/")) {
    pathname = pathname.slice(0, -1);
  }
  return pathname;
}
async function handler(req, res) {
  const pathname = resolvePathname(req);
  if (pathname === "/api/auth/login") {
    return handleAuthLogin(req, res);
  }
  if (pathname === "/api/auth/logout") {
    return handleAuthLogout(req, res);
  }
  if (pathname === "/api/auth/session") {
    return handleAuthSession(req, res);
  }
  if (pathname === "/api/files") {
    return handleFilesIndex(req, res);
  }
  if (pathname.startsWith("/api/files/")) {
    const file = pathname.replace(/^\/api\/files\//, "");
    req.query = { ...req.query, file };
    return handleFilesDetail(req, res);
  }
  if (pathname.startsWith("/api/schemas/")) {
    const id = pathname.replace(/^\/api\/schemas\//, "");
    req.query = { ...req.query, id };
    return handleSchemasDetail(req, res);
  }
  if (pathname.startsWith("/api/validate/")) {
    const file = pathname.replace(/^\/api\/validate\//, "");
    req.query = { ...req.query, file };
    return handleValidateFile(req, res);
  }
  if (pathname === "/api/images") {
    return handleImagesIndex(req, res);
  }
  if (pathname === "/api/upload-image") {
    return handleUploadImage(req, res);
  }
  if (pathname === "/api/git/status") {
    return handleGitStatus(req, res);
  }
  if (pathname === "/api/git/preview") {
    return handleGitPreview(req, res);
  }
  if (pathname === "/api/git/finalize") {
    return handleGitFinalize(req, res);
  }
  if (pathname === "/api/session/summary") {
    return handleSessionSummary(req, res);
  }
  sendJson(res, 404, {
    ok: false,
    error: `API route not found: ${req.method} ${pathname}`
  });
}
export {
  handler as default
};
