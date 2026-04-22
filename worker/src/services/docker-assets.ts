import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type RuntimeKind = "node" | "html" | "unsupported";

export interface RuntimeDetection {
  runtime: RuntimeKind;
  framework: string;
  reason?: string;
}

export interface DockerAssetOptions {
  installCommand?: string;
  buildCommand?: string;
  startCommand?: string;
  nodeVersion?: string;
}

interface PackageJson {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readPackageJson(repoPath: string): Promise<PackageJson | null> {
  const packageJsonPath = path.join(repoPath, "package.json");
  if (!(await fileExists(packageJsonPath))) return null;
  try {
    const raw = await readFile(packageJsonPath, "utf8");
    return JSON.parse(raw) as PackageJson;
  } catch {
    return null;
  }
}

function hasDep(pkg: PackageJson, name: string): boolean {
  return Boolean(pkg.dependencies?.[name] || pkg.devDependencies?.[name]);
}

export async function detectRuntime(repoPath: string): Promise<RuntimeDetection> {
  const pkg = await readPackageJson(repoPath);
  if (pkg) {
    if (hasDep(pkg, "next")) return { runtime: "node", framework: "nextjs" };
    if (hasDep(pkg, "@remix-run/react") || hasDep(pkg, "@remix-run/node"))
      return { runtime: "node", framework: "remix" };
    if (hasDep(pkg, "@sveltejs/kit")) return { runtime: "node", framework: "sveltekit" };
    if (hasDep(pkg, "nuxt") || hasDep(pkg, "nuxt3")) return { runtime: "node", framework: "nuxt" };
    if (hasDep(pkg, "gatsby")) return { runtime: "node", framework: "gatsby" };
    if (hasDep(pkg, "astro")) return { runtime: "node", framework: "astro" };
    if (hasDep(pkg, "@nestjs/core")) return { runtime: "node", framework: "nestjs" };
    if (hasDep(pkg, "fastify")) return { runtime: "node", framework: "fastify" };
    if (hasDep(pkg, "express") && !hasDep(pkg, "react"))
      return { runtime: "node", framework: "express" };
    if (hasDep(pkg, "vite")) return { runtime: "node", framework: "vite" };
    if (hasDep(pkg, "react")) return { runtime: "node", framework: "react" };
    if (hasDep(pkg, "vue")) return { runtime: "node", framework: "vue" };
    if (hasDep(pkg, "svelte")) return { runtime: "node", framework: "svelte" };
    if (hasDep(pkg, "solid-js")) return { runtime: "node", framework: "solid" };
    return { runtime: "node", framework: "node" };
  }

  if (await fileExists(path.join(repoPath, "index.html"))) {
    return { runtime: "html", framework: "html" };
  }

  const unsupportedRuntimes = [
    { file: "requirements.txt", name: "Python" },
    { file: "pom.xml", name: "Java" },
    { file: "go.mod", name: "Go" },
    { file: "Cargo.toml", name: "Rust" },
    { file: "composer.json", name: "PHP" }
  ];

  for (const { file, name } of unsupportedRuntimes) {
    if (await fileExists(path.join(repoPath, file))) {
      return {
        runtime: "unsupported",
        framework: name.toLowerCase(),
        reason: `${name} projects are not supported. Supported: Node.js, React, Next.js, Vue, Svelte, and static HTML.`
      };
    }
  }

  return {
    runtime: "unsupported",
    framework: "unknown",
    reason: "Cannot detect a supported runtime. Supported: Node.js / React / Next.js / HTML."
  };
}

function buildDockerfile(
  runtime: Exclude<RuntimeKind, "unsupported">,
  opts: DockerAssetOptions
): string {
  if (runtime === "html") {
    return `FROM nginx:1.27-alpine
COPY . /usr/share/nginx/html
RUN sed -i 's/listen       80;/listen       3000;/' /etc/nginx/conf.d/default.conf \\
 && sed -i 's/listen  \\[::\\]:80;/listen  [::]:3000;/' /etc/nginx/conf.d/default.conf
EXPOSE 3000
CMD ["nginx", "-g", "daemon off;"]
`;
  }

  const nodeImage = `node:${opts.nodeVersion ?? "20"}-alpine`;

  const installStep = opts.installCommand
    ? opts.installCommand
    : `if [ -f package-lock.json ]; then npm ci; \\
    elif [ -f pnpm-lock.yaml ]; then corepack enable && pnpm install --frozen-lockfile; \\
    elif [ -f yarn.lock ]; then yarn install --frozen-lockfile; \\
    else npm install; fi`;

  const buildStep = opts.buildCommand
    ? opts.buildCommand
    : `npm run build --if-present`;

  const startStep = opts.startCommand
    ? opts.startCommand
    : `npm run start --if-present || npm run serve --if-present || npx --yes serve -s dist -l 3000 || npx --yes serve -s build -l 3000 || npx --yes serve -s out -l 3000 || node server.js || node index.js`;

  return `# syntax=docker/dockerfile:1.7
FROM ${nodeImage} AS deps
WORKDIR /app
COPY package.json package-lock.json* yarn.lock* pnpm-lock.yaml* ./
RUN ${installStep}

FROM ${nodeImage} AS build
WORKDIR /app
COPY . .
COPY --from=deps /app/node_modules ./node_modules
RUN ${buildStep}

FROM ${nodeImage} AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app ./
EXPOSE 3000
CMD ["sh", "-c", "${startStep.replace(/"/g, '\\"')}"]
`;
}

const DEFAULT_DOCKERIGNORE = [
  "node_modules",
  ".git",
  ".github",
  ".next/cache",
  "dist",
  "coverage",
  "*.log",
  ".env",
  ".env.*",
  "Dockerfile*"
].join("\n");

export async function ensureDockerAssets(
  repoPath: string,
  opts: DockerAssetOptions = {}
): Promise<RuntimeDetection> {
  const dockerfilePath = path.join(repoPath, "Dockerfile");
  const dockerignorePath = path.join(repoPath, ".dockerignore");

  const detection = await detectRuntime(repoPath);
  if (detection.runtime === "unsupported") {
    throw new Error(detection.reason ?? "Unsupported project runtime");
  }

  if (!(await fileExists(dockerfilePath))) {
    await writeFile(dockerfilePath, buildDockerfile(detection.runtime, opts), "utf8");
  }

  if (!(await fileExists(dockerignorePath))) {
    await writeFile(dockerignorePath, DEFAULT_DOCKERIGNORE, "utf8");
  }

  return detection;
}
