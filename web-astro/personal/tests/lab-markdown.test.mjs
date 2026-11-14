import { test } from 'node:test';
import assert from 'node:assert/strict';
import { citationHref, escapeHtml, mermaidSource, renderMarkdown } from '../client/lab/markdown.ts';
import { mermaidInput } from '../client/page-assistant/diagram.ts';
import { locateInSegments, locateQuote, normalizeChars } from '../client/lab/quote.ts';

test('escapes HTML everywhere', () => {
  assert.equal(escapeHtml(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  const html = renderMarkdown('<script>alert(1)</script> **粗<b>体</b>**');
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('<strong>粗&lt;b&gt;体&lt;/b&gt;</strong>'));
});

test('renders block structure', () => {
  const html = renderMarkdown(
    ['# 标题', '', '第一行', '第二行', '', '- 甲', '- 乙', '', '1. 一', '2. 二', '', '> 引用', '', '---', '', '```python', 'x = "<1>"', '```'].join('\n'),
  );
  assert.ok(html.includes('<h3>标题</h3>'));
  assert.ok(html.includes('<p>第一行<br>第二行</p>'));
  assert.ok(html.includes('<ul><li>甲</li><li>乙</li></ul>'));
  assert.ok(html.includes('<ol><li>一</li><li>二</li></ol>'));
  assert.ok(html.includes('<blockquote><p>引用</p></blockquote>'));
  assert.ok(html.includes('<hr>'));
  assert.ok(html.includes('<pre><code class="lang-python">x = &quot;&lt;1&gt;&quot;</code></pre>'));
});

test('renders tables and inline code', () => {
  const html = renderMarkdown('| 项 | 值 |\n|---|---|\n| `a<b` | 2 |');
  assert.ok(html.includes('<th>项</th>'));
  assert.ok(html.includes('<td><code>a&lt;b</code></td>'));
});

test('only http(s) and site-relative links become anchors', () => {
  assert.ok(renderMarkdown('[书](https://x.org/a)').includes('<a href="https://x.org/a"'));
  assert.ok(renderMarkdown('[章](/book/chapter1/)').includes('href="/book/chapter1/"'));
  const evil = renderMarkdown('[点我](javascript:alert(1))');
  assert.ok(!evil.includes('<a'));
});

test('autolink is opt-in and only touches bare http(s) URLs', () => {
  const notes = renderMarkdown(
    [
      '## 内容',
      '',
      '「AI 产品全景 2026」（`/harness/site/ai-products-pm-analysis.html`）产品卡从 97 张扩到 111 张，大类从 13 扩到 15。',
      '',
      '完整对比：https://github.com/o/r/compare/v0.1.7...v0.1.8',
    ].join('\n'),
    { autolink: true },
  );
  assert.ok(notes.includes('<h4>内容</h4>'));
  assert.ok(notes.includes('<code>/harness/site/ai-products-pm-analysis.html</code>'));
  assert.ok(notes.includes('产品卡从 97 张扩到 111 张'));
  assert.ok(notes.includes('<a href="https://github.com/o/r/compare/v0.1.7...v0.1.8"'));
  assert.ok(notes.includes('rel="noopener noreferrer"'));
  // Trailing punctuation stays outside the anchor.
  const ended = renderMarkdown('见 https://x.org/a。', { autolink: true });
  assert.ok(ended.includes('href="https://x.org/a"'));
  assert.ok(ended.includes('</a>。'));

  // Off by default, inside code spans, and never a script or javascript: link.
  assert.ok(!renderMarkdown('https://x.org/a').includes('<a '));
  assert.ok(!renderMarkdown('`https://x.org/a`', { autolink: true }).includes('<a '));
  const evil = renderMarkdown('<https://x.org/<script>> https://x.org/"onmouseover="alert(1)', { autolink: true });
  assert.ok(!evil.includes('<script>'));
  assert.ok(!/href="[^"]*"onmouseover/.test(evil));
});

test('citations become reader links with a verification badge', () => {
  const citations = [
    { chapter: 2, section_id: 'kv', quote: '前缀稳定时缓存命中', status: 'verified', found_section_id: 'kv' },
    { chapter: 2, section_id: 'x', quote: '原文在别处出现的话', status: 'wrong_section', found_section_id: 'real' },
  ];
  const html = renderMarkdown('见 [[ch2#kv|前缀稳定时缓存命中]] 和 [[ch2#x|原文在别处出现的话]] 和 [[ch3|没核对过的引用]]', { citations });
  assert.ok(html.includes('lab-cite--verified'));
  assert.ok(html.includes(`href="/book/chapter2/?quote=${encodeURIComponent('前缀稳定时缓存命中')}#kv"`));
  assert.ok(html.includes('#real"'), 'wrong-section citations link to where the quote really is');
  assert.ok(html.includes('lab-cite--unchecked'));
  assert.ok(html.includes('>✓</sup>'));
});

test('page block citations are checked against the block text', () => {
  const block = '原文：模型表达的置信度不作为金额审批阈值；识别质量、证据完整性、规则结果要分别呈现。没有可定位的证据时，不能显示“已证实违规”。';
  const html = renderMarkdown(
    '见 [[#118|识别质量、证据完整性、规则结果要分别呈现]]、[[#118|没有可定位的证据时，不能显示"已证实违规"]] 和 [[#999999|找不到的块]]、[[#0|零块]]、[[#118|这一块里没有的句子]]',
    { blockText: (index) => (index === 118 ? block : null) },
  );
  assert.equal(html.match(/class="pa-cite pa-cite--verified"/g)?.length, 2, 'curly and ASCII quotes both match');
  assert.ok(html.includes('data-block="118"'));
  assert.ok(html.includes('第 118 块'));
  assert.equal(html.match(/class="pa-cite pa-cite--missing"/g)?.length, 2);
  assert.ok(html.includes('pa-cite--not_found'));
  assert.ok(!html.includes('[['), 'no raw marker survives');
  // Without a block resolver the citation stays a neutral, unverified pill.
  const plain = renderMarkdown('见 [[#118|识别质量、证据完整性、规则结果要分别呈现]]');
  assert.ok(plain.includes('lab-cite--unchecked'));
  assert.ok(!plain.includes('<button'));
});

test('a page citation range checks every block and jumps to the last', () => {
  const blocks = { 42: '工具描述', 43: '描述决定模型何时选哪个工具，也决定调用准确率。' };
  const html = renderMarkdown('见 [[#42-43|描述决定模型何时选哪个工具]]', { blockText: (index) => blocks[index] ?? null });
  assert.ok(html.includes('pa-cite--verified'));
  assert.ok(html.includes('data-block="43"'));
  assert.ok(html.includes('data-block-first="42"'));
  assert.ok(html.includes('第 42–43 块'));
});

test('a block citation without a quote becomes a plain block reference', () => {
  const html = renderMarkdown('见 [[#118]]。');
  assert.ok(html.includes('第 118 块'));
  assert.ok(!html.includes('[['));
});

test('closed mermaid fences become diagram sources and stay escaped', () => {
  const html = renderMarkdown('说明\n\n```mermaid\nflowchart TD\n  A["<img src=x onerror=alert(1)>"] --> B["下一步"]\n```\n\n完');
  assert.ok(html.includes('<pre class="lab-mermaid"><code>flowchart TD\n'));
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(html.includes('&quot;下一步&quot;'));
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('<p>说明</p>'));
  assert.ok(html.includes('<p>完</p>'));
});

test('flowchart info string is folded into the mermaid source', () => {
  const html = renderMarkdown('```flowchart TD\n  A["开始<br/>起草"] --> B{"判断"}\n  B -- "是" --> C["下一步"]\n  N -. "风险" .-> S["兜底"]\n```');
  assert.ok(html.includes('class="lab-mermaid"'));
  assert.ok(html.startsWith('<pre class="lab-mermaid"><code>flowchart TD\n'));
  assert.ok(html.includes('开始&lt;br/&gt;起草'));
  assert.ok(html.includes('.-&gt;'));
  assert.equal(mermaidSource('flowchart', 'TD', '  A --> B'), 'flowchart TD\n  A --> B');
  assert.equal(mermaidSource('mermaid', '', 'flowchart TD\n  A --> B'), 'flowchart TD\n  A --> B');
  assert.equal(mermaidSource('', '', 'sequenceDiagram\n  Alice->>Bob: hi'), 'sequenceDiagram\n  Alice->>Bob: hi');
  assert.equal(mermaidSource('python', '', 'print(1)'), null);
  assert.equal(mermaidSource('mermaid', '', '   \n'), null);
});

test('an unclosed diagram fence stays as code until the closer arrives', () => {
  const open = renderMarkdown('```flowchart TD\n  A --> B');
  assert.ok(!open.includes('lab-mermaid'));
  assert.ok(open.includes('class="lang-flowchart"'));
  const closed = renderMarkdown('```flowchart TD\n  A --> B\n```');
  assert.ok(closed.includes('lab-mermaid'));
});

test('br tags in diagram labels become newlines for the renderer', () => {
  assert.equal(mermaidInput('A["开始<br/>起草<br />邮件"]'), 'A["开始\n起草\n邮件"]');
  assert.equal(mermaidInput('A["无换行"]'), 'A["无换行"]');
});

test('citation quotes are escaped', () => {
  const html = renderMarkdown('[[ch1#a|<img src=x onerror=alert(1)>]]');
  assert.ok(!html.includes('<img'));
});

test('citationHref', () => {
  assert.equal(citationHref(3, null, 'a b'), '/book/chapter3/?quote=a%20b');
  assert.equal(citationHref(3, '节', 'q', '/base'), `/base/book/chapter3/?quote=q#${encodeURIComponent('节')}`);
});

test('normalisation ignores whitespace, width and quote style', () => {
  assert.equal(normalizeChars('Ａ B\n“c”').norm, 'AB"c"');
  assert.deepEqual(locateQuote('前面。KV  Cache 让\n前缀稳定！后面', 'KV Cache让前缀稳定'), [3, 19]);
  assert.equal(locateQuote('完全不同的内容', '找不到'), null);
  assert.equal(locateQuote('任何内容', '   '), null);
});

test('locates a quote that spans several text nodes', () => {
  const segments = ['缓存', '命中率', '更高，成本更低。'];
  const found = locateInSegments(segments, '命中率更高');
  assert.deepEqual(found, { start: { segment: 1, offset: 0 }, end: { segment: 2, offset: 2 } });
  const atEdge = locateInSegments(['abc', 'def'], 'abc');
  assert.deepEqual(atEdge, { start: { segment: 0, offset: 0 }, end: { segment: 0, offset: 3 } });
  assert.equal(locateInSegments(['abc'], 'xyz'), null);
});
