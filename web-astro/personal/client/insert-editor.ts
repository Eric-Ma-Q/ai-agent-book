// Modal editor for one inserted passage. Reuses the reader's note-dialog styles.
import { strings } from './strings';

export interface EditorRequest {
  title: string;
  context: string;
  markdown: string;
  canDelete: boolean;
  onSave: (markdown: string) => Promise<void>;
  onDelete: () => Promise<void>;
}

const CLOSE_ICON =
  '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6"/></svg>';

function build() {
  const s = strings();
  const dialog = document.createElement('dialog');
  dialog.className = 'highlights-dialog note-dialog personal-insert-dialog';
  dialog.setAttribute('aria-labelledby', 'personal-insert-title');
  dialog.innerHTML = `
    <div class="highlights-heading">
      <div><p class="eyebrow"></p><h2 id="personal-insert-title"></h2></div>
      <button class="icon-button" type="button" data-role="close">${CLOSE_ICON}</button>
    </div>
    <blockquote data-role="context"></blockquote>
    <label for="personal-insert-text"></label>
    <textarea id="personal-insert-text" rows="12" maxlength="100000"></textarea>
    <p role="status" data-role="status"></p>
    <div class="note-editor-actions">
      <button type="button" data-role="delete"></button>
      <button type="button" class="button button-primary" data-role="save"></button>
    </div>`;
  const get = <T extends HTMLElement>(role: string) =>
    dialog.querySelector<T>(`[data-role="${role}"]`)!;
  dialog.querySelector('.eyebrow')!.textContent = s.eyebrow;
  dialog.querySelector('label')!.textContent = s.label;
  get('close').setAttribute('aria-label', s.close);
  get('save').textContent = s.save;
  document.body.append(dialog);
  return {
    dialog,
    title: dialog.querySelector('h2')!,
    text: dialog.querySelector('textarea')!,
    context: get('context'),
    status: get('status'),
    save: get<HTMLButtonElement>('save'),
    remove: get<HTMLButtonElement>('delete'),
    close: get<HTMLButtonElement>('close'),
  };
}

export function createInsertEditor() {
  const s = strings();
  const ui = build();
  ui.text.placeholder = s.placeholder;
  let request: EditorRequest | undefined;
  let original = '';
  let busy = false;
  let confirmDiscard = false;
  let confirmDelete = 0;

  const dirty = () => ui.text.value !== original;
  const setBusy = (value: boolean) => {
    busy = value;
    for (const control of [ui.text, ui.save, ui.remove, ui.close]) control.disabled = value;
  };
  const resetDelete = () => {
    window.clearTimeout(confirmDelete);
    confirmDelete = 0;
    ui.remove.textContent = s.remove;
  };
  // Closing with unsaved text needs a second attempt, so a stray Esc never loses writing.
  const tryClose = () => {
    if (busy) return;
    if (dirty() && !confirmDiscard) {
      confirmDiscard = true;
      ui.status.textContent = s.unsaved;
      return;
    }
    ui.dialog.close();
  };

  async function run(action: () => Promise<void>, failure: string) {
    setBusy(true);
    try {
      await action();
      original = ui.text.value;
      ui.dialog.close();
    } catch (error) {
      ui.status.textContent = `${failure} ${error instanceof Error ? error.message : ''}`;
    } finally {
      setBusy(false);
    }
  }

  ui.text.addEventListener('input', () => {
    confirmDiscard = false;
    ui.status.textContent = s.hint;
  });
  ui.text.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      ui.save.click();
    }
  });
  ui.dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    tryClose();
  });
  ui.close.addEventListener('click', tryClose);
  ui.dialog.addEventListener('close', resetDelete);
  ui.save.addEventListener('click', () => {
    if (!request || busy) return;
    const markdown = ui.text.value;
    if (!markdown.trim()) {
      ui.status.textContent = s.empty;
      return;
    }
    void run(() => request!.onSave(markdown), s.saveFailed);
  });
  ui.remove.addEventListener('click', () => {
    if (!request || busy) return;
    if (!confirmDelete) {
      ui.remove.textContent = s.confirmRemove;
      confirmDelete = window.setTimeout(resetDelete, 4000);
      return;
    }
    resetDelete();
    void run(() => request!.onDelete(), s.removeFailed);
  });

  return {
    open(next: EditorRequest) {
      request = next;
      original = next.markdown;
      confirmDiscard = false;
      resetDelete();
      ui.title.textContent = next.title;
      ui.context.textContent = next.context;
      ui.context.hidden = !next.context;
      ui.text.value = next.markdown;
      ui.status.textContent = s.hint;
      ui.remove.hidden = !next.canDelete;
      ui.dialog.showModal();
      ui.text.focus();
    },
  };
}
