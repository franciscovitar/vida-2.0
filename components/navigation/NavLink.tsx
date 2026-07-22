'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { domainVars } from '@/lib/constants/domains';
import { NAV_ICON_MAP, type NavItemData } from '@/lib/constants/navigation';

import styles from './NavLink.module.scss';

interface NavLinkProps {
  item: NavItemData;
  onNavigate?: () => void;
}

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function NavLink({ item, onNavigate }: NavLinkProps) {
  const pathname = usePathname();
  const active = isActive(pathname, item.href);
  const Icon = NAV_ICON_MAP[item.icon];

  return (
    <Link
      href={item.href}
      className={styles.link}
      data-active={active}
      style={domainVars(item.domain)}
      aria-current={active ? 'page' : undefined}
      onClick={onNavigate}
    >
      <span className={styles.icon} aria-hidden="true">
        <Icon size={18} strokeWidth={2} />
      </span>
      <span className={styles.label}>{item.label}</span>
    </Link>
  );
}
