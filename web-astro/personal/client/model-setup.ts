// 需求 041：没有可用模型时，在用到模型的页面指向设置页。
// 只负责生成提示元素，是否显示由调用方用 needsModelSetup 判断。
import { el } from './dom';
import { withBase } from '../../src/lib/site-path.mjs';
import { SETTINGS_PATH } from '../routes.mjs';

export function modelSetupNotice(className: string, compact = false): HTMLElement {
  const link = el('a', 'model-setup-link', compact ? '去设置页添加 →' : '打开设置 · 模型档案 →');
  link.href = withBase(SETTINGS_PATH);
  link.title = '打开设置，添加或编辑模型档案';
  const text = compact
    ? '还没有可用模型。'
    : '还没有可用模型：先在设置页添加接口地址、密钥与模型 ID，再回来运行。';
  return el('p', className, text, ' ', link);
}
