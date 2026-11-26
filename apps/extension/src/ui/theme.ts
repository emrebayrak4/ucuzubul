/** Follows the OS color scheme (extension pages have no theme switcher of their own). */
export function applySystemTheme(): void {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const apply = () => document.documentElement.classList.toggle("dark", mq.matches);
  apply();
  mq.addEventListener("change", apply);
}
