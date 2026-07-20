/**
 * Script que se inyecta en el <head> para fijar el tema antes de la hidratación
 * y evitar el parpadeo. Lee la preferencia guardada; si es "system" o no existe,
 * deja que la media query de `globals.scss` resuelva el modo.
 */
export const THEME_STORAGE_KEY = 'vida2-theme';

export const themeInitScript = `(() => {
  try {
    const pref = localStorage.getItem('${THEME_STORAGE_KEY}');
    if (pref === 'light' || pref === 'dark') {
      document.documentElement.setAttribute('data-theme', pref);
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  } catch (_) {}
})();`;
