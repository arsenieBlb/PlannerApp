import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { prisma } from "@/lib/db";

// Google OAuth scopes — least privilege needed for email + calendar
const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/calendar",
].join(" ");

async function refreshAccessToken(refreshToken: string) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  const tokens = await response.json();
  if (!response.ok) throw tokens;

  return {
    accessToken: tokens.access_token as string,
    refreshToken: (tokens.refresh_token as string) ?? refreshToken,
    accessTokenExpires: Date.now() + (tokens.expires_in as number) * 1000,
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: GOOGLE_SCOPES,
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, account, profile }) {
      // Initial sign-in: store tokens and upsert Profile
      if (account && profile) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.accessTokenExpires = account.expires_at
          ? account.expires_at * 1000
          : Date.now() + 3600 * 1000;

        // Upsert single-user profile
        const upserted = await prisma.profile.upsert({
          where: { email: profile.email! },
          create: {
            email: profile.email!,
            name: profile.name ?? null,
            avatarUrl: (profile as { picture?: string }).picture ?? null,
            googleAccessToken: account.access_token,
            googleRefreshToken: account.refresh_token ?? null,
            googleTokenExpiry: new Date(token.accessTokenExpires as number),
          },
          update: {
            name: profile.name ?? undefined,
            avatarUrl: (profile as { picture?: string }).picture ?? undefined,
            googleAccessToken: account.access_token,
            googleRefreshToken: account.refresh_token ?? undefined,
            googleTokenExpiry: new Date(token.accessTokenExpires as number),
          },
        });

        // Ensure default settings exist
        await prisma.settings.upsert({
          where: { profileId: upserted.id },
          create: {
            profileId: upserted.id,
            gmailSyncEnabled: true,
            calendarSyncEnabled: true,
          },
          update: {},
        });

        token.profileId = upserted.id;
        return token;
      }

      // Return token if not expired
      if (Date.now() < (token.accessTokenExpires as number)) {
        return token;
      }

      // Refresh expired token
      try {
        const refreshed = await refreshAccessToken(token.refreshToken as string);
        token.accessToken = refreshed.accessToken;
        token.refreshToken = refreshed.refreshToken;
        token.accessTokenExpires = refreshed.accessTokenExpires;

        // Persist refreshed tokens
        if (token.profileId) {
          await prisma.profile.update({
            where: { id: token.profileId as string },
            data: {
              googleAccessToken: refreshed.accessToken,
              googleRefreshToken: refreshed.refreshToken,
              googleTokenExpiry: new Date(refreshed.accessTokenExpires),
            },
          });
        }

        return token;
      } catch {
        return { ...token, error: "RefreshAccessTokenError" as const };
      }
    },

    async session({ session, token }) {
      session.accessToken = token.accessToken as string;
      session.refreshToken = token.refreshToken as string;
      session.accessTokenExpires = token.accessTokenExpires as number;
      session.error = token.error as "RefreshAccessTokenError" | undefined;
      session.userId = token.profileId as string;
      return session;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
});
