import type { Metadata } from 'next';
import Link from 'next/link';

import { signIn, signOut } from '@/auth';

import styles from '../login/login.module.scss';

export const metadata: Metadata = { title: 'Sin acceso' };

export const dynamic = 'force-dynamic';

export default function UnauthorizedPage() {
  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <p className={styles.brand}>Vida 2.0</p>
        <h1 className={styles.title}>Sin acceso</h1>
        <p className={styles.lead}>Esta cuenta no tiene acceso a Vida 2.0.</p>

        <form
          action={async () => {
            'use server';
            await signOut({ redirectTo: '/login' });
          }}
        >
          <button type="submit" className={styles.button}>
            Cerrar sesión
          </button>
        </form>

        <form
          className={styles['secondary-form']}
          action={async () => {
            'use server';
            await signOut({ redirect: false });
            await signIn('google', { redirectTo: '/' });
          }}
        >
          <button type="submit" className={styles['button-secondary']}>
            Probar con otra cuenta
          </button>
        </form>

        <p className={styles.notice}>
          <Link href="/login">Volver al inicio de sesión</Link>
        </p>
      </div>
    </main>
  );
}
