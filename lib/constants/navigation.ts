import type { LucideIcon } from 'lucide-react';
import {
  BookOpen,
  Boxes,
  Brain,
  CalendarCheck,
  CalendarClock,
  CalendarRange,
  Dumbbell,
  FileText,
  Film,
  HeartPulse,
  Globe2,
  LayoutDashboard,
  LineChart,
  ListTodo,
  WalletCards,
  NotebookPen,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Target,
  UtensilsCrossed,
  Workflow,
} from 'lucide-react';

import type { Domain } from '@/types';

/** Clave serializable de icono (server → client). */
export type NavIconKey =
  | 'hoy'
  | 'norte'
  | 'habitos'
  | 'salud'
  | 'finanzas'
  | 'productividad'
  | 'agenda'
  | 'planificacion'
  | 'proyectos'
  | 'professional'
  | 'inteligencia'
  | 'world'
  | 'tareas'
  | 'aprendizaje'
  | 'compras'
  | 'areas'
  | 'gimnasio'
  | 'dieta'
  | 'media'
  | 'aprobaciones'
  | 'journaling'
  | 'ajustes'
  | 'automatizaciones'
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
  norte: Target,
  habitos: CalendarCheck,
  salud: HeartPulse,
  finanzas: WalletCards,
  productividad: ListTodo,
  agenda: CalendarClock,
  planificacion: CalendarRange,
  proyectos: Boxes,
  professional: Brain,
  inteligencia: LineChart,
  world: Globe2,
  tareas: ListTodo,
  aprendizaje: BookOpen,
  compras: ShoppingCart,
  areas: Boxes,
  gimnasio: Dumbbell,
  dieta: UtensilsCrossed,
  media: Film,
  aprobaciones: ShieldCheck,
  journaling: NotebookPen,
  ajustes: Settings,
  automatizaciones: Workflow,
  document: FileText,
};

/** Navegación principal de la aplicación (módulos funcionales + documentales fijos). */
export const primaryNav: NavItemData[] = [
  { label: 'Hoy', href: '/', icon: 'hoy', domain: 'neutral' },
  { label: 'Hábitos', href: '/habitos', icon: 'habitos', domain: 'habits' },
  { label: 'Salud', href: '/salud', icon: 'salud', domain: 'health' },
  { label: 'Finanzas', href: '/finanzas', icon: 'finanzas', domain: 'finance' },
  {
    label: 'Planificación',
    href: '/planificacion',
    icon: 'planificacion',
    domain: 'productivity',
  },
  { label: 'Proyectos', href: '/proyectos', icon: 'proyectos', domain: 'projects' },
  { label: 'World', href: '/world', icon: 'world', domain: 'learning' },
  { label: 'Profesional', href: '/professional', icon: 'professional', domain: 'projects' },
  { label: 'Gimnasio', href: '/gimnasio', icon: 'gimnasio', domain: 'health' },
  { label: 'Dieta', href: '/dieta', icon: 'dieta', domain: 'health' },
  { label: 'Media', href: '/media', icon: 'media', domain: 'neutral' },
  { label: 'Aprendizaje', href: '/aprendizaje', icon: 'aprendizaje', domain: 'learning' },
  { label: 'Compras', href: '/compras', icon: 'compras', domain: 'neutral' },
];

/** Navegación secundaria, más discreta. */
export const secondaryNav: NavItemData[] = [
  { label: 'Aprobaciones', href: '/aprobaciones', icon: 'aprobaciones', domain: 'neutral' },
  { label: 'Journaling', href: '/journaling', icon: 'journaling', domain: 'neutral' },
  {
    label: 'Automatizaciones',
    href: '/automatizaciones',
    icon: 'automatizaciones',
    domain: 'productivity',
  },
  { label: 'Ajustes', href: '/ajustes', icon: 'ajustes', domain: 'neutral' },
];

/** Ítems que aparecen en la barra inferior móvil (subconjunto priorizado). */
export const mobileNav: NavItemData[] = [
  primaryNav.find((item) => item.href === '/')!,
  primaryNav.find((item) => item.href === '/habitos')!,
  primaryNav.find((item) => item.href === '/planificacion')!,
];
