import type { Request } from "express";

declare module "express-serve-static-core" {
  interface Request {
    githubToken?: string;
    githubUser?: {
      id: number;
      login: string;
      avatarUrl?: string;
    };
  }
}

export type AuthenticatedRequest = Request & {
  githubToken: string;
  githubUser: {
    id: number;
    login: string;
    avatarUrl?: string;
  };
};
