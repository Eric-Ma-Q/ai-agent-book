export function initChapterFlow(root: HTMLElement) {
  const tabs = [...root.querySelectorAll<HTMLAnchorElement>('[data-flow-tab]')];
  const panels = [...root.querySelectorAll<HTMLElement>('[data-flow-panel]')];
  const tablist = root.querySelector<HTMLElement>('[data-flow-tabs]');
  const tools = root.querySelector<HTMLElement>('[data-flow-tools]');
  const expand = root.querySelector<HTMLButtonElement>('[data-flow-expand]');
  if (!tabs.length || !panels.length || !tablist || !tools || !expand) return;

  let current = 0;
  const nodes = () => [
    ...panels[current].querySelectorAll<HTMLDetailsElement>('[data-flow-node]'),
  ];
  const updateExpand = () => {
    expand.textContent = nodes().every((node) => node.open)
      ? '收起全部节点'
      : '展开全部节点';
  };
  const select = (index: number, focus = false) => {
    current = index;
    tabs.forEach((tab, i) => {
      tab.setAttribute('aria-selected', String(i === index));
      tab.tabIndex = i === index ? 0 : -1;
      panels[i].hidden = i !== index;
    });
    expand.setAttribute('aria-controls', panels[index].id);
    updateExpand();
    if (focus) tabs[index].focus();
  };

  tablist.setAttribute('role', 'tablist');
  tabs.forEach((tab, index) => {
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', panels[index].id);
    panels[index].setAttribute('role', 'tabpanel');
    panels[index].setAttribute('aria-labelledby', tab.id);
    panels[index].tabIndex = 0;
    tab.addEventListener('click', (event) => {
      event.preventDefault();
      select(index);
    });
    tab.addEventListener('keydown', (event) => {
      let next: number;
      switch (event.key) {
        case 'ArrowRight':
          next = (index + 1) % tabs.length;
          break;
        case 'ArrowLeft':
          next = (index + tabs.length - 1) % tabs.length;
          break;
        case 'Home':
          next = 0;
          break;
        case 'End':
          next = tabs.length - 1;
          break;
        default:
          return;
      }
      event.preventDefault();
      select(next, true);
    });
  });
  root
    .querySelectorAll<HTMLDetailsElement>('[data-flow-node]')
    .forEach((node) => {
      node.addEventListener('toggle', updateExpand);
    });
  expand.addEventListener('click', () => {
    const open = !nodes().every((node) => node.open);
    nodes().forEach((node) => {
      node.open = open;
    });
    updateExpand();
  });
  // Honor fallback navigation to a view, including a link opened in a new tab.
  const selectFromHash = () => {
    const target = document.getElementById(window.location.hash.slice(1));
    if (target === root && root instanceof HTMLDetailsElement) root.open = true;
    const index = panels.findIndex(
      (panel) =>
        target === panel || (target !== null && panel.contains(target)),
    );
    if (index < 0) return;
    if (root instanceof HTMLDetailsElement) root.open = true;
    select(index);
    if (target instanceof HTMLDetailsElement) {
      target.open = true;
      target.querySelector('summary')?.focus({ preventScroll: true });
      target.scrollIntoView({ block: 'start' });
    }
  };
  root.addEventListener('click', (event) => {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    if (!(event.target instanceof Element)) return;
    const link = event.target.closest<HTMLAnchorElement>('.flow-links a');
    // A repeated link to the current fragment does not fire hashchange.
    if (link?.hash === window.location.hash) {
      event.preventDefault();
      selectFromHash();
    }
  });
  select(0);
  selectFromHash();
  window.addEventListener('hashchange', selectFromHash);
  tools.hidden = false;
}
