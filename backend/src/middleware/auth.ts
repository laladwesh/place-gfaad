import type { NextFunction, Request, Response } from "express";

import { fetchGithubUser } from "@platform/utils";

const USER_CACHE_TTL_MS = 5 * 60 * 1000;
const userCache = new Map<
  string,
  { expiresAt: number; user: { id: number; login: string; avatar_url?: string } }
>();

function parseBearerToken(headerValue?: string): string | null {
  if (!headerValue || !headerValue.startsWith("Bearer ")) {
    return null;
  }

  const token = headerValue.slice(7).trim();
  return token || null;
}

export async function requireGithubAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token = parseBearerToken(req.header("authorization"));
    if (!token) {
      res.status(401).json({
        error: "Missing or invalid Authorization header"
      });
      return;
    }

    const now = Date.now();
    const cached = userCache.get(token);
    const user =
      cached && cached.expiresAt > now ? cached.user : await fetchGithubUser(token);

    if (!cached || cached.expiresAt <= now) {
      userCache.set(token, {
        user,
        expiresAt: now + USER_CACHE_TTL_MS
      });
    }

    req.githubToken = token;
    req.githubUser = {
      id: user.id,
      login: user.login.toLowerCase(),
      avatarUrl: user.avatar_url
    };

    next();
  } catch (error) {
    res.status(401).json({
      error: "Invalid GitHub token",
      detail: error instanceof Error ? error.message : "Unknown auth error"
    });
  }
}
