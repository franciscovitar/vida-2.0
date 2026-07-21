import type { LucideIcon } from 'lucide-react';
import {
  BookOpen,
  Boxes,
  Brain,
  CalendarCheck,
  CalendarClock,
  CheckSquare,
  HeartPulse,
  Inbox,
  LayoutDashboard,
  LineChart,
  ListTodo,
  NotebookPen,
  Settings,
  ShoppingCart,
} from 'lucide-react';

import type { Domain } from '@/types';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Dominio semántico para acentuar el ítem activo. */
  domain: Domain;
}

/** Navegación principal de la aplicación. */
export const primaryNav: NavItem[] = [
  { label: 'Hoy', href: '/', icon: LayoutDashboard, domain: 'neutral' },
  { label: 'Hábitos', href: '/habitos', icon: CalendarCheck, domain: 'habits' },
  { label: 'Salud', href: '/salud', icon: HeartPulse, domain: 'health' },
  { label: 'Productividad', href: '/productividad', icon: ListTodo, domain: 'productivity' },
  { label: 'Tendencias', href: '/tendencias', icon: LineChart, domain: 'productivity' },
  { label: 'Agenda', href: '/agenda', icon: CalendarClock, domain: 'productivity' },
  { label: 'Proyectos', href: '/proyectos', icon: Boxes, domain: 'projects' },
  { label: 'Tareas', href: '/tareas', icon: CheckSquare, domain: 'tasks' },
  { label: 'Aprendizaje', href: '/aprendizaje', icon: BookOpen, domain: 'learning' },
  { label: 'Compras', href: '/compras', icon: ShoppingCart, domain: 'neutral' },
  { label: 'Análisis IA', href: '/analisis-ia', icon: Brain, domain: 'productivity' },
];

/** Navegación secundaria, más discreta. */
export const secondaryNav: NavItem[] = [
  { label: 'Bandeja de entrada', href: '/bandeja', icon: Inbox, domain: 'neutral' },
  { label: 'Journaling', href: '/journaling', icon: NotebookPen, domain: 'neutral' },
  { label: 'Ajustes', href: '/ajustes', icon: Settings, domain: 'neutral' },
];

/** Ítems que aparecen en la barra inferior móvil (subconjunto priorizado). */
export const mobileNav: NavItem[] = [primaryNav[0], primaryNav[1], primaryNav[3], primaryNav[5]];
