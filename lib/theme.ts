export type Theme = "light" | "dark";

const STORAGE_KEY = "infracanvas.theme";

/**
 * The theme lives on `<html data-theme>` rather than in React state.
 *
 * An inline script in the document head applies the stored preference before
 * first paint, so there is no flash of the wrong theme, and the DOM stays the
 * single source of truth. React subscribes to it with `useSyncExternalStore`,
 * which avoids a hydration mismatch without a setState-in-effect cascade.
 */
const listeners = new Set<() => void>();

export function subscribeTheme(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

export function getTheme(): Theme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

/** Server snapshot — must match what the inline script renders for SSR. */
export function getServerTheme(): Theme {
  return "light";
}

export function setTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = theme;
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Private browsing modes can reject writes; the in-memory theme still applies.
  }
  listeners.forEach((listener) => listener());
}

/**
 * Runs before hydration via `<script>` in the layout. Kept as a string because
 * it has to execute ahead of any bundle evaluation.
 */
export const THEME_BOOTSTRAP_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  STORAGE_KEY,
)});if(t!=="dark"&&t!=="light"){t=window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme="light";}})();`;
