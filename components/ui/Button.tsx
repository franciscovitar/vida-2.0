import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';

import styles from './Button.module.scss';

type Variant = 'primary' | 'secondary' | 'ghost';
type Size = 'sm' | 'md';

interface BaseProps {
  children?: ReactNode;
  variant?: Variant;
  size?: Size;
  iconLeft?: LucideIcon;
  /** Botón cuadrado solo con icono; requiere aria-label. */
  iconOnly?: boolean;
  className?: string;
}

type ButtonProps = BaseProps & ButtonHTMLAttributes<HTMLButtonElement> & { href?: undefined };

type LinkProps = BaseProps & AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };

function classNames(variant: Variant, size: Size, iconOnly: boolean, extra?: string): string {
  return [
    styles.button,
    styles[variant],
    styles[size],
    iconOnly ? styles['icon-only'] : '',
    extra ?? '',
  ]
    .filter(Boolean)
    .join(' ');
}

export function Button(props: ButtonProps | LinkProps) {
  const {
    children,
    variant = 'secondary',
    size = 'md',
    iconLeft: Icon,
    iconOnly = false,
    className,
    ...rest
  } = props;

  const content = (
    <>
      {Icon ? <Icon size={size === 'sm' ? 15 : 16} strokeWidth={2} aria-hidden="true" /> : null}
      {children ? <span>{children}</span> : null}
    </>
  );

  const classes = classNames(variant, size, iconOnly, className);

  if ('href' in props && props.href !== undefined) {
    const { href, ...anchorRest } = rest as AnchorHTMLAttributes<HTMLAnchorElement> & {
      href: string;
    };
    return (
      <Link href={href} className={classes} {...anchorRest}>
        {content}
      </Link>
    );
  }

  return (
    <button className={classes} {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)}>
      {content}
    </button>
  );
}
