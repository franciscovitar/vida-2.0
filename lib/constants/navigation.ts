import type { LucideIcon } from 'lucide-react';
import {
  BookOpen,
  Boxes,
  Brain,
  CalendarCheck,
  CalendarClock,
  CheckSquare,
  FileText,
  HeartPulse,
  Inbox,
  LayoutDashboard,
  LineChart,
  ListTodo,
  NotebookPen,
  Search,
  Settings,
  ShoppingCart,
} from 'lucide-react';

import type { Domain } from '@/types';

/** Clave serializable de icono (server → client). */
export type NavIconKey =
  | 'hoy'
  | 'habitos'
  | 'salud'
  | 'productividad'
  | 'tendencias'
  | 'agenda'
  | 'proyectos'
  | 'tareas'
  | 'aprendizaje'
  | 'compras'
  | 'analisis'
  | 'areas'
  | 'bandeja'
  | 'journaling'
  | 'ajustes'
  | 'buscar'
  | 'document';

export interface NavItemData {
  label: string;
  href: string;
  icon: NavIconKey;
  domain: Domain;
}

/** @deprecated Prefer NavItemData para props server→client. */
export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  domain: Domain;
}

export const NAV_ICON_MAP: Record<NavIconKey, LucideIcon> = {
  hoy: LayoutDashboard,
  habitos: CalendarCheck,
  salud: HeartPulse,
  productividad: ListTodo,
  tendencias: LineChart,
  agenda: CalendarClock,
  proyectos: Boxes,
  tareas: CheckSquare,
  aprendizaje: BookOpen,
  compras: ShoppingCart,
  analisis: Brain,
  areas: Boxes,
  bandeja: Inbox,
  journaling: NotebookPen,
  ajustes: Settings,
  buscar: Search,
  document: FileText,
};

/** Navegación principal de la aplicación (módulos funcionales + documentales fijos). */
export const primaryNav: NavItemData[] = [
  { label: 'Hoy', href: '/', icon: 'hoy', domain: 'neutral' },
  { label: 'Hábitos', href: '/habitos', icon: 'habitos', domain: 'habits' },
  { label: 'Salud', href: '/salud', icon: 'salud', domain: 'health' },
  { label: 'Productividad', href: '/productividad', icon: 'productividad', domain: 'productivity' },
  { label: 'Tendencias', href: '/tendencias', icon: 'tendencias', domain: 'productivity' },
  { label: 'Agenda', href: '/agenda', icon: 'agenda', domain: 'productivity' },
  { label: 'Proyectos', href: '/proyectos', icon: 'proyectos', domain: 'projects' },
  { label: 'Tareas', href: '/tareas', icon: 'tareas', domain: 'tasks' },
  { label: 'Áreas', href: '/areas', icon: 'areas', domain: 'projects' },
  { label: 'Aprendizaje', href: '/aprendizaje', icon: 'aprendizaje', domain: 'learning' },
  { label: 'Compras', href: '/compras', icon: 'compras', domain: 'neutral' },
  { label: 'Análisis IA', href: '/analisis-ia', icon: 'analisis', domain: 'productivity' },
];

/** Navegación secundaria, más discreta. */
export const secondaryNav: NavItemData[] = [
  { label: 'Bandeja de entrada', href: '/bandeja', icon: 'bandeja', domain: 'neutral' },
  { label: 'Journaling', href: '/journaling', icon: 'journaling', domain: 'neutral' },
  { label: 'Ajustes', href: '/ajustes', icon: 'ajustes', domain: 'neutral' },
];

/** Ítems que aparecen en la barra inferior móvil (subconjunto priorizado). */
export const mobileNav: NavItemData[] = [
  primaryNav[0],
  primaryNav[1],
  primaryNav[3],
  primaryNav[5],
];
