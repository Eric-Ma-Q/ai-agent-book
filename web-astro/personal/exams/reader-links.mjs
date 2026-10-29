// 试卷是可直接双击打开的单文件，题目出处写的是作者线上书的绝对地址。
// 阅读器 `/book-exam/<paper>/` 提供同一份 HTML 时，把这类地址换成本站章节路由，
// 出处点开就落在自己的阅读器（含划线、笔记），而不是外站。
export const AUTHOR_BOOK_BASE = 'https://bojieli.github.io/ai-agent-book';

const basePath = (base) => String(base ?? '/').replace(/\/+$/, '');

/** 作者线上书的 URL → 本站路由；其他 URL 原样返回。 */
export function readerBookHref(href, base = import.meta.env?.BASE_URL ?? '/') {
  if (typeof href !== 'string') return href;
  if (href !== AUTHOR_BOOK_BASE && !href.startsWith(`${AUTHOR_BOOK_BASE}/`)) return href;
  return `${basePath(base)}${href.slice(AUTHOR_BOOK_BASE.length)}`;
}

/** 把整份 HTML 里作者线上书的地址批量换成本站路由（含内联的 CHAPTER_URL）。 */
export function rewriteAuthorBookLinks(html, base = import.meta.env?.BASE_URL ?? '/') {
  return String(html).replaceAll(AUTHOR_BOOK_BASE, basePath(base));
}
