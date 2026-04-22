import type { NextAuthOptions } from "next-auth";
import GitHubProvider from "next-auth/providers/github";

export const authOptions: NextAuthOptions = {
  providers: [
    GitHubProvider({
      clientId: process.env.GITHUB_CLIENT_ID ?? "",
      clientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
      authorization: {
        params: {
          scope: "read:user user:email repo admin:repo_hook repo:status"
        }
      }
    })
  ],
  secret: process.env.NEXTAUTH_SECRET,
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 24
  },
  cookies: {
    sessionToken: {
      name:
        process.env.NODE_ENV === "production"
          ? "__Secure-next-auth.session-token"
          : "next-auth.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production"
      }
    }
  },
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account?.access_token) {
        token.accessToken = account.access_token;
      }

      if (profile && "login" in profile) {
        token.username = String(profile.login);
      }

      if (profile && "avatar_url" in profile) {
        token.avatar = String(profile.avatar_url);
      }

      return token;
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken;

      if (session.user) {
        session.user.username = token.username;
        session.user.avatar = token.avatar;
      }

      return session;
    }
  }
};
