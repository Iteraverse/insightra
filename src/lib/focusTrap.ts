/** Keep keyboard focus in a modal, restoring its trigger on dismissal. */
import { tick } from 'svelte';

export function focusTrap(node: HTMLElement, trigger: HTMLElement | null) {
  const previous = trigger ?? (document.activeElement as HTMLElement | null);
  const items = () =>
    Array.from(
      node.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input, select, textarea, [tabindex="0"]',
      ),
    );
  items()[0]?.focus();
  function keydown(event: KeyboardEvent) {
    if (event.key !== 'Tab') return;
    const focusables = items();
    const first = focusables[0];
    const last = focusables.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }
  node.addEventListener('keydown', keydown);
  return {
    destroy() {
      node.removeEventListener('keydown', keydown);
      void tick().then(() => previous?.focus());
    },
  };
}
