import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { auth, signIn } from '@/auth';
import { isAuthConfigured, isEmailAuthorized, resolveAllowedEmails } from '@/lib/auth/authorize';

import styles from './login.module.scss';

export const metadata: Metadata = { title: 'Acceso' };

export const dynamic = 'force-dynamic';

type LoginPageProps = {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
};

function errorMessage(code: string | undefined): string | null {
  if (!code) return null;
  if (code === 'AccessDenied' || code === 'Configuration') {
    return 'No se pudo completar el acceso. Probá con la cuenta autorizada.';
  }
  if (code === 'OAuthAccountNotLinked' || code === 'OAuthCallback') {
    return 'Hubo un problema con el proveedor. Intentá de nuevo.';
  }
  return 'No se pudo iniciar sesión. Intentá de nuevo.';
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const session = await auth();
  const allowed = resolveAllowedEmails(process.env);
  if (session?.user?.email && isEmailAuthorized(session.user.email, allowed)) {
    redirect('/');
  }

  const configured = isAuthConfigured(process.env);
  const message = errorMessage(params.error);
  const callbackUrl =
    typeof params.callbackUrl === 'string' &&
    params.callbackUrl.startsWith('/') &&
    !params.callbackUrl.startsWith('//')
      ? params.callbackUrl
      : '/';

  async function startGoogleLogin() {
    'use server';
    await signIn('google', { redirectTo: callbackUrl });
  }

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <p className={styles.brand}>Vida 2.0</p>
        <h1 className={styles.title}>Acceso privado</h1>
        <p className={styles.lead}>
          Esta aplicación es personal. Solo una cuenta de Google autorizada puede entrar.
        </p>

        {!configured ? (
          <p className={styles.notice} role="status">
            El acceso aún no está configurado. Faltan variables AUTH_* en el servidor.
          </p>
        ) : null}

        {message ? (
          <p className={styles.error} role="alert">
            {message}
          </p>
        ) : null}

        {configured ? (
          <form action={startGoogleLogin}>
            <button type="submit" className={styles.button}>
              Continuar con Google
            </button>
          </form>
        ) : null}
      </div>
    </main>
  );
}
