// The lab page: tabs, hash routing (#/ask, #/compare, #/runs, #/run/<id>,
// #/injection[/<campaign>], #/evals, #/eval/<id>, #/rules, #/actions)
// and the service health banner.
// Model profiles moved to /settings/ in requirement 029; the old #/models
// hash redirects there.
import { withBase } from '../../../src/lib/site-path.mjs';
import { SETTINGS_PATH } from '../../routes.mjs';
import { el } from '../dom';
import { labApi } from './api';
import { mountActions, pendingCount } from './actions';
import { mountAsk } from './ask';
import { mountCompare } from './compare';
import { mountEvalReport } from './eval-report';
import { mountEvals } from './evals';
import { mountHistory, mountRun } from './history';
import { mountInjection } from './injection';
import { mountRules } from './rules';
import './lab.css';
import './lab-run.css';
import './lab-panels.css';

type Tab = { id: string; label: string };
const TABS: Tab[] = [
  { id: 'ask', label: '提问' },
  { id: 'compare', label: '对比' },
  { id: 'injection', label: '注入' },
  { id: 'runs', label: '历史' },
  { id: 'evals', label: '评估' },
  { id: 'rules', label: '规则' },
  { id: 'actions', label: '待确认' },
];
const PARENT: Record<string, string> = { run: 'runs', eval: 'evals' };

function parseHash(): { tab: string; id?: string } {
  const [, tab = 'ask', id] = location.hash.replace(/^#\/?/, '#/').split('/');
  return { tab: tab || 'ask', id: id ? decodeURIComponent(id) : undefined };
}

async function healthBanner(host: HTMLElement) {
  try {
    const health = await labApi<{ llm: { ok: boolean; error?: string; base_url?: string } }>('/health');
    if (!health.llm.ok) {
      host.append(el('p', 'lab-notice lab-notice--warn', `模型接口不可达（${health.llm.base_url ?? ''}）：${health.llm.error ?? ''}。运行会以「模型接口出错」结束。`));
    }
  } catch (error) {
    host.append(el('p', 'lab-notice lab-notice--error', error instanceof Error ? error.message : String(error)));
  }
}

function init() {
  const root = document.getElementById('lab-root');
  const nav = document.getElementById('lab-tabs');
  const banner = document.getElementById('lab-banner');
  if (!root || !nav || !banner) return;
  const links = new Map<string, HTMLAnchorElement>();
  const pendingBadge = el('span', 'lab-tab-count');
  pendingBadge.hidden = true;
  for (const tab of TABS) {
    const link = el('a', 'lab-tab', tab.label);
    link.href = `#/${tab.id}`;
    if (tab.id === 'actions') link.append(pendingBadge);
    links.set(tab.id, link);
    nav.append(link);
  }
  const setPending = (n: number) => {
    pendingBadge.hidden = n === 0;
    pendingBadge.textContent = String(n);
  };
  const refreshPending = () => void pendingCount().then(setPending);
  refreshPending();
  window.setInterval(() => {
    if (!document.hidden) refreshPending();
  }, 15000);

  let cleanup: (() => void) | undefined;
  const route = () => {
    const { tab, id } = parseHash();
    if (tab === 'models') {
      location.replace(withBase(SETTINGS_PATH));
      return;
    }
    cleanup?.();
    root.replaceChildren();
    const active = PARENT[tab] ?? tab;
    links.forEach((link, key) => (key === active ? link.setAttribute('aria-current', 'page') : link.removeAttribute('aria-current')));
    if (tab === 'run' && id) cleanup = mountRun(root, id);
    else if (tab === 'eval' && id) cleanup = mountEvalReport(root, id);
    else if (tab === 'compare') cleanup = mountCompare(root);
    else if (tab === 'injection') cleanup = mountInjection(root, id);
    else if (tab === 'runs') cleanup = mountHistory(root);
    else if (tab === 'evals') cleanup = mountEvals(root);
    else if (tab === 'rules') cleanup = mountRules(root);
    else if (tab === 'actions') cleanup = mountActions(root, setPending);
    else cleanup = mountAsk(root);
    window.scrollTo({ top: 0 });
  };
  window.addEventListener('hashchange', route);
  route();
  void healthBanner(banner);
}

init();
