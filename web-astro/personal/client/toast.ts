// One transient message at a time, with an optional action such as Undo.
import { button, el } from './dom';

interface ToastAction {
  label: string;
  onClick(): void | Promise<void>;
}

export function createToast(host: HTMLElement, duration = 8000) {
  let timer: number | undefined;
  return {
    show(message: string, action?: ToastAction) {
      clearTimeout(timer);
      host.replaceChildren(el('span', 'hl-toast-text', message));
      if (action) {
        host.append(
          button(action.label, 'hl-toast-action', () => {
            host.hidden = true;
            void action.onClick();
          }),
        );
      }
      host.hidden = false;
      timer = window.setTimeout(() => {
        host.hidden = true;
      }, action ? duration : 3000);
    },
  };
}
