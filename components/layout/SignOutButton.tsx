import { signOut } from '@/auth';

import styles from './SignOutButton.module.scss';

export function SignOutButton() {
  return (
    <form
      action={async () => {
        'use server';
        await signOut({ redirectTo: '/login' });
      }}
    >
      <button type="submit" className={styles.button}>
        Salir
      </button>
    </form>
  );
}
