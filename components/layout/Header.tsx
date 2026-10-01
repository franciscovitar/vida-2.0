import { MobileNav } from '@/components/navigation/MobileNav';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { getAppNavigation } from '@/lib/web-catalog/service';

import { Brand } from './Brand';
import { SignOutButton } from './SignOutButton';
import styles from './Header.module.scss';

export async function Header() {
  const nav = await getAppNavigation();

  return (
    <header className={styles.header}>
      <div className={styles.left}>
        <MobileNav primary={nav.primary} secondary={nav.secondary} />
        <div className={styles.brand}>
          <Brand />
        </div>
      </div>
      <div className={styles.right}>
        <ThemeToggle />
        <SignOutButton />
      </div>
    </header>
  );
}
