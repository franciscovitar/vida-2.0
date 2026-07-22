import { Plus } from 'lucide-react';

import { MobileNav } from '@/components/navigation/MobileNav';
import { Button } from '@/components/ui/Button';
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
        <span className={styles.capture}>
          <Button href="/bandeja" variant="secondary" iconLeft={Plus}>
            Captura rápida
          </Button>
        </span>
        <span className={styles['capture-compact']}>
          <Button
            href="/bandeja"
            variant="secondary"
            iconLeft={Plus}
            iconOnly
            aria-label="Captura rápida"
          />
        </span>
        <ThemeToggle />
        <SignOutButton />
      </div>
    </header>
  );
}
