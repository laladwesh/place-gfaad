import { execFile } from "node:child_process";
import { access, mkdir, symlink, unlink, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import path from "node:path";

import { getSharedEnv } from "@platform/utils";

const execFileAsync = promisify(execFile);

export interface ConfigureRoutingInput {
  siteName: string;
  subdomain: string;
  port: number;
  rootDomain: string;
  sitesAvailableDir?: string;
  sitesEnabledDir?: string;
  nginxBinary?: string;
}

function validateSiteName(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (!/^[a-z0-9-]+$/.test(trimmed)) {
    throw new Error(`Invalid site name '${value}'. Allowed: a-z, 0-9, -`);
  }

  return trimmed;
}

function validateSubdomain(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)*$/.test(trimmed)) {
    throw new Error(
      `Invalid subdomain '${value}'. Allowed chars are a-z, 0-9, -, and .`
    );
  }

  return trimmed;
}

function validatePort(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error(`Invalid port '${value}'. Expected an integer in range 1..65535.`);
  }

  return value;
}

export function renderNginxConfig(subdomain: string, rootDomain: string, port: number): string {
  const host = `${subdomain}.${rootDomain}`;
  return `server {
    listen 80;
    server_name ${host};

    location / {
        proxy_pass http://127.0.0.1:${port};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
`;
}

export async function testNginxConfig(nginxBinary: string): Promise<void> {
  await execFileAsync(nginxBinary, ["-t"], { shell: true });
}

export async function reloadNginx(nginxBinary: string): Promise<void> {
  await execFileAsync(nginxBinary, ["-s", "reload"], { shell: true });
}

async function ensureSymlink(target: string, linkPath: string): Promise<void> {
  try {
    await access(linkPath);
    await unlink(linkPath);
  } catch {
    // The symlink does not exist yet.
  }

  await symlink(target, linkPath);
}

export async function configureProjectRouting(
  input: ConfigureRoutingInput
): Promise<{ configPath: string; enabledPath: string }> {
  const env = getSharedEnv();
  const siteName = validateSiteName(input.siteName);
  const subdomain = validateSubdomain(input.subdomain);
  const port = validatePort(input.port);
  const rootDomain = input.rootDomain.trim().toLowerCase();

  const sitesAvailableDir =
    input.sitesAvailableDir?.trim() || env.NGINX_SITES_AVAILABLE_DIR;
  const sitesEnabledDir = input.sitesEnabledDir?.trim() || env.NGINX_SITES_ENABLED_DIR;
  const nginxBinary = input.nginxBinary?.trim() || env.NGINX_BIN;

  await mkdir(sitesAvailableDir, { recursive: true });
  await mkdir(sitesEnabledDir, { recursive: true });

  const fileName = `${siteName}.conf`;
  const configPath = path.join(sitesAvailableDir, fileName);
  const enabledPath = path.join(sitesEnabledDir, fileName);
  const configContent = renderNginxConfig(subdomain, rootDomain, port);

  await writeFile(configPath, configContent, {
    encoding: "utf8",
    mode: 0o644
  });

  await ensureSymlink(configPath, enabledPath);
  await testNginxConfig(nginxBinary);
  await reloadNginx(nginxBinary);

  return {
    configPath,
    enabledPath
  };
}
