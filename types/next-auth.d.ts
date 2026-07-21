import type { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email: string;
    } & Omit<DefaultSession['user'], 'email' | 'id'>;
  }

  interface User {
    id?: string;
    email?: string | null;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    email?: string;
  }
}
