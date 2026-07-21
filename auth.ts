import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';

import {
  evaluateGoogleSignIn,
  isEmailAuthorized,
  LOGIN_GOOGLE_SCOPES,
  normalizeEmail,
  resolveAllowedEmails,
} from '@/lib/auth/authorize';

/**
 * Auth.js (NextAuth v5) — login Google con lista pequeña de correos.
 * Scopes: openid email profile. Sin Calendar / offline / refresh.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.AUTH_SECRET,
  trustHost: process.env.AUTH_TRUST_HOST === 'true',
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      authorization: {
        params: {
          scope: LOGIN_GOOGLE_SCOPES,
          // Sin access_type=offline ni prompt=consent de refresh.
        },
      },
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 60 * 60 * 24 * 7,
  },
  pages: {
    signIn: '/login',
    error: '/unauthorized',
  },
  cookies: {
    sessionToken: {
      name:
        process.env.NODE_ENV === 'production'
          ? '__Secure-vida.session-token'
          : 'vida.session-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
  },
  callbacks: {
    async signIn({ user, account, profile }) {
      const allowedEmails = resolveAllowedEmails(process.env);
      const emailVerified =
        typeof profile === 'object' && profile !== null && 'email_verified' in profile
          ? Boolean((profile as { email_verified?: boolean }).email_verified)
          : null;

      const result = evaluateGoogleSignIn({
        provider: account?.provider,
        email: user.email ?? (profile as { email?: string } | undefined)?.email,
        emailVerified,
        allowedEmails,
      });

      return result.ok;
    },
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id ?? token.sub;
        token.email = normalizeEmail(user.email) ?? undefined;
      }

      // Nunca persistir tokens de proveedor en el JWT de sesión.
      delete (token as { accessToken?: unknown }).accessToken;
      delete (token as { refreshToken?: unknown }).refreshToken;
      delete (token as { access_token?: unknown }).access_token;
      delete (token as { refresh_token?: unknown }).refresh_token;

      const allowed = resolveAllowedEmails(process.env);
      if (token.email && !isEmailAuthorized(String(token.email), allowed)) {
        return { ...token, email: undefined, sub: undefined };
      }

      return token;
    },
    async session({ session, token }) {
      const email = normalizeEmail(typeof token.email === 'string' ? token.email : null);
      const userId = typeof token.sub === 'string' ? token.sub : null;

      return {
        ...session,
        user: {
          ...session.user,
          id: userId ?? '',
          email: email ?? '',
          name: undefined,
          image: undefined,
        },
      };
    },
    authorized({ auth: session, request }) {
      // Lógica fina en proxy.ts; aquí solo señal básica.
      void session;
      void request;
      return true;
    },
  },
});
