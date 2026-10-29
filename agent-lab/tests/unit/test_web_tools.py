import httpx
import pytest

from agent_lab.tools.registry import ToolContext
from agent_lab.web import (
    BING_HOME,
    BING_SEARCH,
    CACHE_LIMIT,
    DDG_HOME,
    DDG_HTML,
    PRIMARY_CONTENT_CHARS,
    RESULT_CACHE_S,
    SHENMA_URL,
    SearchHit,
    WebClient,
    WebError,
    _focus_text,
    _query_terms,
    _relevant,
    check_public_url,
)


class FakeResponse:
    def __init__(self, text="", status=200, url="https://example.com/", content_type="text/html; charset=utf-8"):
        self.text = text
        self.status_code = status
        self.url = url
        self.headers = {"content-type": content_type}

    def iter_text(self):
        yield self.text


class FakeStream:
    def __init__(self, item):
        self.item = item

    def __enter__(self):
        if isinstance(self.item, Exception):
            raise self.item
        return self.item

    def __exit__(self, *_exc):
        return False


class FakeHTTP:
    """按 URL 路由的假 HTTP 客户端；每个 URL 的响应按顺序消费。"""

    def __init__(self, routes):
        self.routes = {url: list(items) for url, items in routes.items()}
        self.calls = []

    def _next(self, url, params=None, headers=None):
        self.calls.append((url, dict(params or {}), dict(headers or {})))
        queue = self.routes.get(url)
        if not queue:
            raise AssertionError(f"unexpected request: {url}")
        return queue.pop(0)

    def get(self, url, params=None, headers=None):
        item = self._next(url, params, headers)
        if isinstance(item, Exception):
            raise item
        return item

    def stream(self, method, url, headers=None):
        return FakeStream(self._next(url, None, headers))


class FakePostResponse:
    def __init__(self, data=None, status=200):
        self._data = data
        self.status_code = status

    def json(self):
        if isinstance(self._data, Exception):
            raise self._data
        return self._data


class FakePostHTTP:
    """假主搜索客户端；按顺序消费响应，记录请求。"""

    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []

    def post(self, url, json=None, headers=None):
        self.calls.append((url, dict(json or {}), dict(headers or {})))
        if not self.responses:
            raise AssertionError("unexpected primary search request")
        item = self.responses.pop(0)
        if isinstance(item, Exception):
            raise item
        return item


BING_HOME_HTML = "<html><body><form id='sb'></form></body></html>"

BING_RESULTS = """
<html><body><ol id="b_results">
  <li class="b_algo"><h2><a href="https://www.bing.com/ck/a?!&amp;&amp;p=abc&amp;u=a1aHR0cHM6Ly9leGFtcGxlLmNvbS9wb3N0">示例文章</a></h2>
    <div class="b_caption"><p class="b_lineclamp4">这是摘要。</p></div></li>
  <li class="b_algo"><h2><a href="https://second.example/x">第二篇</a></h2>
    <div class="b_caption"><p>另一个摘要。</p></div></li>
  <li class="b_algo"><h2><a href="https://www.bing.com/images/search?q=x">图片结果</a></h2></li>
</ol></body></html>
"""

BING_UNRELATED = """
<html><body><ol>
  <li class="b_algo"><h2><a href="https://www.bilibili.com/">哔哩哔哩</a></h2>
    <p>视频网站。</p></li>
</ol></body></html>
"""

DDG_HOME_HTML = """<html><body><script>var vqd="4-123456789";</script></body></html>"""

DDG_RESULTS = """
<html><body>
<div class="result">
  <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fpost%3Fa%3D1">示例文章</a>
  <div class="result__snippet">这是摘要。</div>
</div>
<div class="result">
  <a class="result__a" href="https://second.example/x">第二篇</a>
  <div class="result__snippet">另一个摘要。</div>
</div>
</body></html>
"""

SHENMA_RESULTS = """
<html><body>
<div class="sc sc_structure_template_normal" data-sc="{&quot;ads&quot;:0}"
     data-reco="{&quot;article_title&quot;:&quot;示例文章&quot;,&quot;norm_url&quot;:&quot;https://example.com/post&quot;}">
  <div class="qk-card"><div class="qk-title"><a href="https://example.com/post">
    <div class="qk-title-text">示例文章</div></a></div>
    <div class="qk-paragraph-content"><div class="qk-paragraph-text">这是摘要。</div></div>
  </div>
</div>
<div class="sc sc_structure_template_normal" data-sc="{&quot;ads&quot;:1}"
     data-reco="{&quot;article_title&quot;:&quot;广告&quot;,&quot;norm_url&quot;:&quot;https://ad.example/&quot;}"></div>
<div class="sc sc_structure_template_normal" data-sc="{&quot;ads&quot;:0}"
     data-reco="{&quot;article_title&quot;:&quot;第二篇&quot;,&quot;norm_url&quot;:&quot;https://second.example/x&quot;}">
  <div class="qk-paragraph-text">另一个摘要。</div>
</div>
</body></html>
"""

SHENMA_UNRELATED = """
<html><body>
<div class="sc sc_structure_template_normal" data-sc="{&quot;ads&quot;:0}"
     data-reco="{&quot;article_title&quot;:&quot;哔哩哔哩&quot;,&quot;norm_url&quot;:&quot;https://www.bilibili.com/&quot;}">
  <div class="qk-paragraph-text">视频网站。</div>
</div>
</body></html>
"""

BING_SHALLOW = """
<html><body><ol id="b_results">
  <li class="b_algo"><h2><a href="https://openclaw.ai/">OpenClaw — Open-Source AI Assistant</a></h2>
    <p>OpenClaw webhook automation.</p></li>
  <li class="b_algo"><h2><a href="https://docs.openclaw.ai/zh-CN">OpenClaw Docs</a></h2>
    <p>安装与快速开始。</p></li>
</ol></body></html>
"""

SHENMA_GENERIC = """
<html><body>
<div class="sc sc_structure_template_normal" data-sc="{&quot;ads&quot;:0}"
     data-reco="{&quot;article_title&quot;:&quot;Harness 和 Hermes 分不清？&quot;,&quot;norm_url&quot;:&quot;https://xie.infoq.cn/article/abc&quot;}">
  <div class="qk-paragraph-text">docs 触发 agent hooks 的对比。</div>
</div>
<div class="sc sc_structure_template_normal" data-sc="{&quot;ads&quot;:0}"
     data-reco="{&quot;article_title&quot;:&quot;为什么完美的 AI Agent 不存在？&quot;,&quot;norm_url&quot;:&quot;http://hub.baai.ac.cn/view/54569&quot;}">
  <div class="qk-paragraph-text">Agent 的 hooks 与触发条件。</div>
</div>
</body></html>
"""

DDG_OPENCLAW = """
<html><body>
<div class="result">
  <a class="result__a" href="https://docs.openclaw.ai/cli/webhooks">Webhooks - OpenClaw</a>
  <div class="result__snippet">Gateway HTTP hooks: how an external service calls OpenClaw.</div>
</div>
<div class="result">
  <a class="result__a" href="https://docs.openclaw.ai/automation/cron-jobs/webhooks">Inbound webhooks - OpenClaw</a>
  <div class="result__snippet">Gateway webhook automation documentation.</div>
</div>
</body></html>
"""


def public_resolver(_host):
    return ["93.184.216.34"]


def test_search_parses_bing_and_decodes_redirect():
    http = FakeHTTP(
        {
            BING_HOME: [FakeResponse(BING_HOME_HTML)],
            BING_SEARCH: [FakeResponse(BING_RESULTS)],
        }
    )
    client = WebClient(http=http, resolver=public_resolver)
    data = client.search("示例文章", 2)
    assert data["provider"] == "bing"
    assert data["count"] == 2
    assert [item["url"] for item in data["results"]] == ["https://example.com/post", "https://second.example/x"]
    assert data["results"][0]["title"] == "示例文章"
    assert data["results"][0]["snippet"] == "这是摘要。"
    assert http.calls[0][0] == BING_HOME
    assert http.calls[1][0] == BING_SEARCH
    assert http.calls[1][2]["Referer"] == BING_HOME


def test_search_uses_primary_web_search_and_keeps_content():
    primary = FakePostHTTP(
        [
            FakePostResponse(
                {
                    "results": [
                        {
                            "title": "官方文档",
                            "url": "https://example.com/doc",
                            "snippet": "摘要",
                            "content": "正文内容",
                            "fetch_status": "ok",
                            "fetched_by": "http",
                        }
                    ]
                }
            )
        ]
    )
    legacy = FakeHTTP({})
    client = WebClient(
        http=legacy,
        resolver=public_resolver,
        primary_url="http://127.0.0.1:8001",
        primary_http=primary,
    )
    data = client.search("示例文章", 1)
    assert data["provider"] == "primary-web-search"
    assert data["count"] == 1
    assert data["results"][0] == {
        "title": "官方文档",
        "url": "https://example.com/doc",
        "snippet": "摘要",
        "content": "正文内容",
        "fetch_status": "ok",
        "fetched_by": "http",
    }
    assert primary.calls[0][0] == "http://127.0.0.1:8001/api/v1/search"
    # 默认 mode=fast 不回正文，必须显式要 deep；只靠 include_content 别名会被静默降级。
    assert primary.calls[0][1]["mode"] == "deep"
    assert primary.calls[0][1]["include_content"] is True
    assert primary.calls[0][1]["bilingual"] is True
    assert primary.calls[0][1]["max_results"] == 1
    assert legacy.calls == []
    cached = client.search("示例文章", 1)
    assert cached["provider"] == "primary-web-search"
    assert len(primary.calls) == 1


def test_search_falls_back_when_primary_is_unavailable():
    primary = FakePostHTTP([httpx.ConnectError("boom")])
    legacy = FakeHTTP(
        {
            BING_HOME: [FakeResponse(BING_HOME_HTML)],
            BING_SEARCH: [FakeResponse(BING_RESULTS)],
        }
    )
    client = WebClient(
        http=legacy,
        resolver=public_resolver,
        primary_url="http://127.0.0.1:8001",
        primary_http=primary,
    )
    data = client.search("示例文章", 2)
    assert data["provider"] == "bing"
    assert data["fallback"] is True
    assert "主搜索" in data["primary_error"]
    assert "已回退" in data["note"]
    assert len(primary.calls) == 1


@pytest.mark.parametrize(
    "response",
    [
        FakePostResponse({}, status=500),
        FakePostResponse({"results": []}),
        FakePostResponse({}),
        FakePostResponse(ValueError("bad json")),
        FakePostResponse({"results": [{"title": "缺 URL"}]}),
    ],
)
def test_search_falls_back_on_bad_primary_response(response):
    primary = FakePostHTTP([response])
    legacy = FakeHTTP(
        {
            BING_HOME: [FakeResponse(BING_HOME_HTML)],
            BING_SEARCH: [FakeResponse(BING_RESULTS)],
        }
    )
    client = WebClient(
        http=legacy,
        resolver=public_resolver,
        primary_url="http://127.0.0.1:8001",
        primary_http=primary,
    )
    data = client.search("示例文章", 2)
    assert data["provider"] == "bing"
    assert data["fallback"] is True


def test_primary_failure_cools_down_and_retries_later():
    clock = {"now": 0.0}
    primary = FakePostHTTP(
        [
            httpx.ConnectError("boom"),
            FakePostResponse(
                {
                    "results": [
                        {"title": "恢复", "url": "https://example.com/back", "snippet": "ok", "content": "正文"}
                    ]
                }
            ),
        ]
    )
    legacy = FakeHTTP(
        {
            BING_HOME: [FakeResponse(BING_HOME_HTML), FakeResponse(BING_HOME_HTML)],
            BING_SEARCH: [FakeResponse(BING_RESULTS), FakeResponse(BING_RESULTS)],
        }
    )
    client = WebClient(
        http=legacy,
        resolver=public_resolver,
        primary_url="http://127.0.0.1:8001",
        primary_http=primary,
        clock=lambda: clock["now"],
    )
    first = client.search("示例文章", 2)
    assert first["fallback"] is True
    second = client.search("第二篇", 2)
    assert second["fallback"] is True
    assert "暂不重试" in second["primary_error"]
    assert len(primary.calls) == 1
    cached_fallback = client.search("第二篇", 2)
    assert cached_fallback["fallback"] is True
    assert "暂不重试" in cached_fallback["primary_error"]

    clock["now"] = 61.0
    third = client.search("第三篇", 1)
    assert third["provider"] == "primary-web-search"
    assert len(primary.calls) == 2


def test_primary_content_is_capped_and_only_top_three_results():
    rows = [
        {
            "title": f"结果 {index}",
            "url": f"https://example.com/{index}",
            "snippet": "摘要",
            "content": "正" * (PRIMARY_CONTENT_CHARS + 10),
            "fetch_status": "ok",
        }
        for index in range(4)
    ]
    primary = FakePostHTTP([FakePostResponse({"results": rows})])
    client = WebClient(
        http=FakeHTTP({}),
        resolver=public_resolver,
        primary_url="http://127.0.0.1:8001",
        primary_http=primary,
    )
    data = client.search("示例文章", 4)
    assert data["provider"] == "primary-web-search"
    assert len(data["results"]) == 4
    for item in data["results"][:3]:
        assert len(item["content"]) == PRIMARY_CONTENT_CHARS + 1
        assert item["content"].endswith("…")
    assert "content" not in data["results"][3]


def test_primary_disabled_keeps_legacy_behavior():
    legacy = FakeHTTP(
        {
            BING_HOME: [FakeResponse(BING_HOME_HTML)],
            BING_SEARCH: [FakeResponse(BING_RESULTS)],
        }
    )
    client = WebClient(http=legacy, resolver=public_resolver, primary_url="")
    data = client.search("示例文章", 1)
    assert data["provider"] == "bing"
    assert "fallback" not in data


def test_invalid_primary_url_is_ignored():
    with pytest.warns(RuntimeWarning):
        client = WebClient(http=FakeHTTP({}), primary_url="ftp://127.0.0.1:8001")
    assert client._primary_url == ""


def test_search_falls_back_to_shenma():
    http = FakeHTTP(
        {
            BING_HOME: [httpx.ConnectError("boom")],
            SHENMA_URL: [FakeResponse(SHENMA_RESULTS)],
        }
    )
    client = WebClient(http=http, resolver=public_resolver)
    data = client.search("示例文章", 2)
    assert data["provider"] == "shenma"
    assert [item["url"] for item in data["results"]] == ["https://example.com/post", "https://second.example/x"]
    assert data["results"][0]["snippet"] == "这是摘要。"
    assert http.calls[1][0] == SHENMA_URL
    assert http.calls[1][2]["User-Agent"].startswith("Mozilla/5.0 (iPhone")


def test_search_falls_back_to_duckduckgo_and_skips_failed_sources():
    http = FakeHTTP(
        {
            BING_HOME: [httpx.ConnectError("[SSL: UNEXPECTED_EOF_WHILE_READING] EOF")],
            SHENMA_URL: [FakeResponse("", status=503), FakeResponse("", status=503)],
            DDG_HOME: [FakeResponse(DDG_HOME_HTML), FakeResponse(DDG_HOME_HTML)],
            DDG_HTML: [FakeResponse(DDG_RESULTS), FakeResponse(DDG_RESULTS)],
        }
    )
    client = WebClient(http=http, resolver=public_resolver)

    first = client.search("示例文章", 2)
    assert first["provider"] == "duckduckgo"
    assert first["results"][0]["url"] == "https://example.com/post?a=1"
    assert first["results"][0]["snippet"] == "这是摘要。"
    assert http.calls[3][1]["vqd"] == "4-123456789"
    assert http.calls[3][2]["Referer"] == DDG_HOME

    calls_after_first = len(http.calls)
    cached = client.search("示例文章", 2)
    assert cached["results"] == first["results"]
    assert len(http.calls) == calls_after_first

    again = client.search("第二篇内容", 2)
    assert again["provider"] == "duckduckgo"
    assert len([call for call in http.calls if call[0] == BING_HOME]) == 1
    assert len([call for call in http.calls if call[0] == SHENMA_URL]) == 1
    assert len(http.calls) - calls_after_first == 2  # 新查询跳过冷却中的源，只请求 DDG


def test_search_continues_to_duckduckgo_when_bing_only_returns_homepages():
    http = FakeHTTP(
        {
            BING_HOME: [FakeResponse(BING_HOME_HTML)],
            BING_SEARCH: [FakeResponse(BING_SHALLOW)],
            SHENMA_URL: [FakeResponse(SHENMA_GENERIC)],
            DDG_HOME: [FakeResponse(DDG_HOME_HTML)],
            DDG_HTML: [FakeResponse(DDG_OPENCLAW)],
        }
    )
    client = WebClient(http=http, resolver=public_resolver)
    data = client.search("OpenClaw webhook Gateway HTTP hooks documentation", 6)
    assert data["provider"] == "duckduckgo"
    assert data["results"][0]["url"] == "https://docs.openclaw.ai/cli/webhooks"
    assert any("cron-jobs/webhooks" in item["url"] for item in data["results"])
    assert not any(call[0] == SHENMA_URL for call in http.calls)


def test_search_rejects_unrelated_bing_and_shenma_results():
    http = FakeHTTP(
        {
            BING_HOME: [FakeResponse(BING_HOME_HTML), FakeResponse(BING_HOME_HTML)],
            BING_SEARCH: [FakeResponse(BING_UNRELATED), FakeResponse(BING_UNRELATED)],
            SHENMA_URL: [FakeResponse(SHENMA_UNRELATED)],
            DDG_HOME: [httpx.ConnectError("boom")],
        }
    )
    client = WebClient(http=http, resolver=public_resolver)
    with pytest.raises(WebError) as error:
        client.search("Composio agent benchmark")
    message = str(error.value)
    assert "bing: 结果与搜索词无关" in message
    assert "shenma: 结果与搜索词无关" in message
    assert "联网搜索不可用" in message
    assert len([call for call in http.calls if call[0] == BING_SEARCH]) == 2


def test_search_reports_readable_errors_without_ssl_details():
    http = FakeHTTP(
        {
            BING_HOME: [httpx.ConnectError("[SSL: UNEXPECTED_EOF_WHILE_READING] EOF occurred in violation of protocol")],
            SHENMA_URL: [httpx.ConnectError("[SSL: UNEXPECTED_EOF_WHILE_READING] EOF occurred in violation of protocol")],
            DDG_HOME: [httpx.ConnectTimeout("timed out")],
        }
    )
    client = WebClient(http=http, resolver=public_resolver)
    with pytest.raises(WebError) as error:
        client.search("示例文章")
    message = str(error.value)
    assert "TLS 握手失败" in message
    assert "连接超时" in message
    assert "SSL" not in message and "_ssl" not in message

    calls = len(http.calls)
    with pytest.raises(WebError) as again:
        client.search("示例文章")
    assert "暂不重试" in str(again.value)
    assert len(http.calls) == calls  # 冷却期内不再发请求


def test_search_reports_missing_duckduckgo_token():
    http = FakeHTTP(
        {
            BING_HOME: [httpx.ConnectError("boom")],
            SHENMA_URL: [FakeResponse("", status=503)],
            DDG_HOME: [FakeResponse("<html>no token</html>")],
        }
    )
    client = WebClient(http=http, resolver=public_resolver)
    with pytest.raises(WebError) as error:
        client.search("示例文章")
    assert "没有拿到搜索令牌" in str(error.value)


def test_search_validates_input():
    client = WebClient(http=FakeHTTP({}), resolver=public_resolver)
    with pytest.raises(WebError):
        client.search(" ")
    with pytest.raises(WebError):
        client.search("x" * 400)


def test_query_terms_and_relevance():
    assert "缓存" in _query_terms("GitHub Actions 缓存 最佳实践")
    assert "最佳" in _query_terms("最佳实践")
    assert "实践" in _query_terms("最佳实践")
    assert "v4" in _query_terms("DeepSeek v4 发布")
    relevant = [SearchHit("GitHub Actions 缓存策略", "https://example.com/x", "CI 加速")]
    github_home = [SearchHit("GitHub · Change is constant.", "https://github.com/", "")]
    unrelated = [SearchHit("哔哩哔哩", "https://www.bilibili.com/", "视频网站")]
    assert _relevant("GitHub Actions 缓存", relevant)
    assert not _relevant("GitHub Actions 缓存", github_home)
    assert not _relevant("Composio agent benchmark", unrelated)


def test_relevance_requires_anchor_term():
    query = "docs.openclaw.ai webhooks 入站触发 agent hooks"
    generic = [
        SearchHit(
            "Harness 和 Hermes 分不清？",
            "https://xie.infoq.cn/article/abc",
            "docs 触发 agent hooks 的对比。",
        )
    ]
    assert not _relevant(query, generic)
    good = [SearchHit("Webhooks - OpenClaw", "https://docs.openclaw.ai/cli/webhooks", "Gateway HTTP hooks")]
    assert _relevant(query, good)


def test_fetch_extracts_text_and_skips_scripts():
    body = """<html><head><title>标题</title><script>alert(1)</script></head>
    <body><h1>大标题</h1><p>正文 &amp; 内容。</p><style>p{}</style><p>第二段</p></body></html>"""
    url = "https://example.com/page"
    client = WebClient(http=FakeHTTP({url: [FakeResponse(body, url=url)]}), resolver=public_resolver)
    data = client.fetch(url)
    assert data["title"] == "标题"
    assert "大标题" in data["text"]
    assert "正文 & 内容" in data["text"]
    assert "alert" not in data["text"] and "p{}" not in data["text"]
    assert data["url"] == url


def test_fetch_truncates_text():
    body = "<html><body><p>" + "字" * 2000 + "</p></body></html>"
    url = "https://example.com/"
    client = WebClient(http=FakeHTTP({url: [FakeResponse(body, url=url)]}), resolver=public_resolver)
    data = client.fetch(url, max_chars=500)
    assert data["truncated"] is True and len(data["text"]) == 500


def test_fetch_extracts_main_content_and_keeps_structure():
    nav = "".join(f'<a href="/s{index}">导航 {index}</a>' for index in range(30))
    paragraphs = "".join(f"<p>第 {index} 段正文，解释提示缓存的前缀匹配与计费方式，内容足够长。</p>" for index in range(20))
    code = 'cache_control = {"type": "ephemeral"}\nresponse = client.messages.create(model="claude-sonnet-4-6")'
    body = f"""<html><head><title>提示缓存</title></head><body>
    <header><nav>{nav}</nav></header>
    <main><article><h1>提示缓存</h1><h2>启用方式</h2><pre><code>{code}</code></pre>{paragraphs}</article></main>
    <footer>{nav} 版权所有</footer></body></html>"""
    url = "https://example.com/docs/caching"
    client = WebClient(http=FakeHTTP({url: [FakeResponse(body, url=url)]}), resolver=public_resolver)
    data = client.fetch(url, max_chars=4000)
    assert data["extractor"] == "main"
    assert data["title"] == "提示缓存"
    assert "导航 0" not in data["text"] and "版权所有" not in data["text"]
    assert "# 提示缓存" in data["text"] and "## 启用方式" in data["text"]
    assert "```" in data["text"] and "cache_control" in data["text"]
    assert "第 19 段正文" in data["text"]


def test_fetch_falls_back_when_extraction_is_too_short(monkeypatch):
    body = "<html><body>" + "".join(
        f'<a class="card" href="/p{index}"><h3>项目 {index}</h3><p>页面入口 {index}：这里是卡片说明文字。</p></a>'
        for index in range(80)
    ) + "</body></html>"
    url = "https://example.com/overview"
    # 链接卡片页会被 trafilatura 当成 boilerplate 整块删掉；这里固定成“只剩标题”的结果。
    monkeypatch.setattr("trafilatura.extract", lambda *_args, **_kwargs: "页面总览")
    client = WebClient(http=FakeHTTP({url: [FakeResponse(body, url=url)]}), resolver=public_resolver)
    data = client.fetch(url, max_chars=4000)
    assert data["extractor"] == "plain"
    assert "页面入口 42：这里是卡片说明文字。" in data["text"]


def test_fetch_keeps_extraction_when_navigation_dominates(monkeypatch):
    nav = "".join(f'<a href="/nav{index}">导航 {index}</a>' for index in range(4000))
    body = f"<html><body><nav>{nav}</nav><main><article><p>正文占位。</p></article></main></body></html>"
    extracted = "# 正文\n\n" + "这是正文段落，解释 webhook 的端点、鉴权与配置。" * 300
    url = "https://example.com/docs"
    monkeypatch.setattr("trafilatura.extract", lambda *_args, **_kwargs: extracted)
    client = WebClient(http=FakeHTTP({url: [FakeResponse(body, url=url)]}), resolver=public_resolver)
    data = client.fetch(url, max_chars=12000)
    assert data["extractor"] == "main"
    assert "这是正文段落" in data["text"]
    assert "导航 0" not in data["text"]


def test_fetch_reads_page_larger_than_old_limit():
    article = "".join(f"<p>第 {index} 段正文，内容足够长以通过正文阈值。</p>" for index in range(8000))
    padding = "<script>var payload = '" + "x" * 2_000_000 + "';</script>"
    body = f"<html><head><title>长页面</title>{padding}</head><body><article>{article}</article></body></html>"
    assert len(body) > 1_500_000
    url = "https://example.com/long"
    client = WebClient(http=FakeHTTP({url: [FakeResponse(body, url=url)]}), resolver=public_resolver)
    data = client.fetch(url, max_chars=2000)
    assert data["extractor"] == "main"
    assert "第 0 段正文" in data["text"]
    assert data["truncated"] is True


def test_fetch_truncates_oversized_download(monkeypatch):
    monkeypatch.setattr("agent_lab.web.MAX_DOWNLOAD_CHARS", 800)
    body = "<html><body><article><p>" + "正" * 3000 + "</p></article></body></html>"
    url = "https://example.com/huge"
    client = WebClient(http=FakeHTTP({url: [FakeResponse(body, url=url)]}), resolver=public_resolver)
    data = client.fetch(url, max_chars=12_000)
    assert data["truncated"] is True
    assert len(data["text"]) <= 800


def test_fetch_keeps_non_html_content():
    url = "https://example.com/data.json"
    client = WebClient(
        http=FakeHTTP({url: [FakeResponse('{"ok": true, "items": [1, 2]}', url=url, content_type="application/json")]}),
        resolver=public_resolver,
    )
    data = client.fetch(url)
    assert data["extractor"] == "raw"
    assert '"ok": true' in data["text"]
    assert data["title"] == ""


def test_fetch_reports_parser_failure(monkeypatch):
    def boom(_self, _data):
        raise ValueError("bad html")

    monkeypatch.setattr("agent_lab.web._TextParser.feed", boom)
    url = "https://example.com/broken"
    client = WebClient(http=FakeHTTP({url: [FakeResponse("<html><body>坏页面</body></html>", url=url)]}), resolver=public_resolver)
    with pytest.raises(WebError) as error:
        client.fetch(url)
    assert "网页解析失败" in str(error.value)


@pytest.mark.parametrize(
    "url",
    [
        "http://localhost/x",
        "http://127.0.0.1/x",
        "http://127.0.0.1/x",
        "http://10.0.0.1/x",
        "http://foo.local/x",
        "http://198.18.1.243/x",
        "file:///etc/passwd",
        "https://user:pass@example.com/x",
    ],
)
def test_check_public_url_rejects_private_and_unsafe(url):
    with pytest.raises(WebError):
        check_public_url(url, resolver=public_resolver)


def test_check_public_url_rejects_private_dns_resolution():
    with pytest.raises(WebError):
        check_public_url("https://example.com/x", resolver=lambda _host: ["10.1.2.3"])


def test_check_public_url_allows_polluted_extra_address():
    # 本机 DNS 污染会给 google.com 之类的主机额外返回 2001::1
    check_public_url("https://www.google.com/", resolver=lambda _host: ["2001::1", "93.184.216.34"])


def test_check_public_url_allows_proxy_fake_ip():
    check_public_url("https://example.com/x", resolver=lambda _host: ["198.18.1.243"])
    check_public_url("https://example.com/x", resolver=lambda _host: ["fdfe:dcba:9876::2e1"])


def test_fetch_rejects_redirect_to_private():
    url = "https://example.com/page"
    http = FakeHTTP({url: [FakeResponse("<html>ok</html>", url="http://127.0.0.1/admin")]})
    client = WebClient(http=http, resolver=public_resolver)
    with pytest.raises(WebError):
        client.fetch(url)


def test_fetch_rejects_binary_content_type():
    url = "https://example.com/file.bin"
    http = FakeHTTP({url: [FakeResponse("", content_type="application/octet-stream")]})
    client = WebClient(http=http, resolver=public_resolver)
    with pytest.raises(WebError):
        client.fetch(url)


def test_fetch_network_error_is_readable():
    url = "https://example.com/"
    client = WebClient(http=FakeHTTP({url: [httpx.ConnectError("boom")]}), resolver=public_resolver)
    with pytest.raises(WebError) as error:
        client.fetch(url)
    assert "无法连接" in str(error.value)


def _close(client):
    for _, http in client._transports:
        close = getattr(http, "close", None)
        if close:
            close()


def test_system_proxy_is_used_with_direct_fallback(monkeypatch):
    monkeypatch.delenv("LAB_WEB_PROXY", raising=False)
    monkeypatch.setattr("agent_lab.web.getproxies", lambda: {"https": "http://127.0.0.1:7890"})
    client = WebClient()
    try:
        assert [name for name, _ in client._transports] == ["proxy", "direct"]
        assert client.http.trust_env is False
        assert client.http._mounts
    finally:
        _close(client)


def test_off_disables_system_proxy(monkeypatch):
    monkeypatch.setenv("LAB_WEB_PROXY", "off")
    monkeypatch.setattr("agent_lab.web.getproxies", lambda: {"https": "http://127.0.0.1:7890"})
    client = WebClient()
    try:
        assert [name for name, _ in client._transports] == ["direct"]
        assert not client.http._mounts
    finally:
        _close(client)


def test_invalid_proxy_is_ignored_and_uses_direct(monkeypatch):
    monkeypatch.setenv("LAB_WEB_PROXY", "ftp://127.0.0.1:21")
    with pytest.warns(RuntimeWarning):
        client = WebClient()
    try:
        assert [name for name, _ in client._transports] == ["direct"]
    finally:
        _close(client)


def test_transport_falls_back_to_direct_after_proxy_failure():
    proxy = FakeHTTP(
        {
            BING_HOME: [httpx.ConnectError("[SSL: UNEXPECTED_EOF_WHILE_READING] EOF")],
        }
    )
    direct = FakeHTTP(
        {
            BING_HOME: [FakeResponse(BING_HOME_HTML)],
            BING_SEARCH: [FakeResponse(BING_RESULTS), FakeResponse(BING_RESULTS)],
        }
    )
    client = WebClient(http=proxy, fallback=direct, resolver=public_resolver)

    first = client.search("示例文章", 2)
    assert first["provider"] == "bing"
    assert len(proxy.calls) == 1  # 代理只在第一次尝试
    assert len(direct.calls) == 2  # 首页会话和结果页都走直连

    second = client.search("第二篇", 2)
    assert second["provider"] == "bing"
    assert len(proxy.calls) == 1  # 冷却期内不再尝试代理
    assert len(direct.calls) == 3


BING_MIXED = """
<html><body><ol id="b_results">
  <li class="b_algo"><h2><a href="https://example.com/">示例文章首页</a></h2>
    <p>这是一篇示例文章。</p></li>
  <li class="b_algo"><h2><a href="https://example.com/docs/post">示例文章详解</a></h2>
    <p>这是一篇示例文章。</p></li>
  <li class="b_algo"><h2><a href="https://docs.example.com/openclaw-webhook">OpenClaw webhook 说明</a></h2>
    <p>OpenClaw webhook 的配置。</p></li>
</ol></body></html>
"""


def test_search_ranks_document_links_before_homepages():
    http = FakeHTTP(
        {
            BING_HOME: [FakeResponse(BING_HOME_HTML)],
            BING_SEARCH: [FakeResponse(BING_MIXED)],
        }
    )
    client = WebClient(http=http, resolver=public_resolver)
    data = client.search("示例文章", 3)
    assert [item["url"] for item in data["results"]] == [
        "https://example.com/docs/post",
        "https://docs.example.com/openclaw-webhook",
        "https://example.com/",
    ]


def test_search_ranks_anchor_in_url_first():
    http = FakeHTTP(
        {
            BING_HOME: [FakeResponse(BING_HOME_HTML)],
            BING_SEARCH: [FakeResponse(BING_MIXED)],
        }
    )
    client = WebClient(http=http, resolver=public_resolver)
    data = client.search("openclaw", 3)
    assert data["results"][0]["url"] == "https://docs.example.com/openclaw-webhook"
    assert data["results"][-1]["url"] == "https://example.com/"


def test_search_reuses_result_until_cache_expires():
    clock = {"now": 0.0}
    http = FakeHTTP(
        {
            BING_HOME: [FakeResponse(BING_HOME_HTML)],
            BING_SEARCH: [
                FakeResponse(BING_RESULTS),
                FakeResponse(BING_RESULTS),
                FakeResponse(BING_RESULTS),
            ],
        }
    )
    client = WebClient(http=http, resolver=public_resolver, clock=lambda: clock["now"])
    first = client.search("示例文章", 2)
    calls = len(http.calls)
    second = client.search("示例文章", 1)
    assert len(http.calls) == calls
    assert second["count"] == 1
    assert second["provider"] == first["provider"]
    assert second["results"][0]["url"] == first["results"][0]["url"]

    client.search("示例文章", 5)
    assert len(http.calls) == calls + 1

    clock["now"] = RESULT_CACHE_S
    client.search("示例文章", 2)
    assert len(http.calls) == calls + 2


def test_search_cache_drops_oldest_entry(monkeypatch):
    monkeypatch.setattr("agent_lab.web.CACHE_LIMIT", 2)
    http = FakeHTTP(
        {
            BING_HOME: [FakeResponse(BING_HOME_HTML)],
            BING_SEARCH: [FakeResponse(BING_RESULTS) for _ in range(4)],
        }
    )
    client = WebClient(http=http, resolver=public_resolver)
    client.search("示例文章", 2)
    client.search("第二篇", 2)
    client.search("另一个摘要", 2)
    calls = len(http.calls)
    client.search("示例文章", 2)
    assert len(http.calls) == calls + 1
    assert CACHE_LIMIT == 32


def test_focus_text_keeps_matching_paragraphs_in_document_order():
    text = "\n\n".join(
        [
            "A webhook 入门，先看端点。",
            "这里是无关的发行说明。" * 8,
            "B webhook 入门，还包含 hooks.mappings 的完整字段。",
        ]
    )
    focused = _focus_text(text, "webhook hooks.mappings", 120)
    assert focused.index("A webhook") < focused.index("hooks.mappings")
    assert "发行说明" not in focused


def test_focus_text_uses_prefix_when_query_misses():
    text = "甲" * 100 + "乙" * 100
    assert _focus_text(text, "不存在的词", 50) == "甲" * 50
    assert _focus_text(text, "", 50) == "甲" * 50


def test_focus_text_windows_a_long_paragraph():
    text = "前" * 500 + " hooks.mappings 在这里 " + "后" * 500
    focused = _focus_text(text, "hooks.mappings", 80)
    assert "hooks.mappings" in focused
    assert len(focused) <= 80
    assert not focused.startswith("前" * 40)


def test_fetch_uses_query_and_caches_the_page(monkeypatch):
    clock = {"now": 0.0}
    article = "\n\n".join(["开头" * 400, "目标段落 hooks.mappings 在此", "结尾" * 400])
    monkeypatch.setattr("trafilatura.extract", lambda *_args, **_kwargs: article)
    url = "https://example.com/docs"
    http = FakeHTTP(
        {
            url: [
                FakeResponse("<html><body><p>placeholder</p></body></html>", url=url),
                FakeResponse("<html><body><p>placeholder</p></body></html>", url=url),
            ]
        }
    )
    client = WebClient(http=http, resolver=public_resolver, clock=lambda: clock["now"])
    opening = client.fetch(url, max_chars=500)
    assert opening["text"].startswith("开头")
    assert "hooks.mappings" not in opening["text"]
    assert opening["truncated"] is True

    focused = client.fetch(url, max_chars=500, query="hooks.mappings")
    assert "hooks.mappings" in focused["text"]
    assert len(http.calls) == 1

    clock["now"] = RESULT_CACHE_S
    client.fetch(url, max_chars=80, query="hooks.mappings")
    assert len(http.calls) == 2


def test_web_fetch_tool_passes_query(monkeypatch):
    from agent_lab.tools import all_tools
    from agent_lab.tools.registry import ToolRegistry

    article = "\n\n".join(["开头" * 400, "目标段落 hooks.mappings 在此"])
    monkeypatch.setattr("trafilatura.extract", lambda *_args, **_kwargs: article)
    url = "https://example.com/docs"
    client = WebClient(
        http=FakeHTTP({url: [FakeResponse("<html><body><p>x</p></body></html>", url=url)]}),
        resolver=public_resolver,
    )
    registry = ToolRegistry(all_tools())
    outcome = registry.execute(
        "web_fetch",
        '{"url":"https://example.com/docs","query":"hooks.mappings","max_chars":500}',
        ToolContext(web=client),
    )
    assert outcome.error is None
    assert "hooks.mappings" in outcome.content


def test_web_search_tool_returns_primary_content():
    from agent_lab.tools import all_tools
    from agent_lab.tools.registry import ToolRegistry

    primary = FakePostHTTP(
        [
            FakePostResponse(
                {
                    "results": [
                        {
                            "title": "官方文档",
                            "url": "https://example.com/doc",
                            "snippet": "摘要",
                            "content": "正文内容",
                            "fetch_status": "ok",
                        }
                    ]
                }
            )
        ]
    )
    client = WebClient(
        http=FakeHTTP({}),
        resolver=public_resolver,
        primary_url="http://127.0.0.1:8001",
        primary_http=primary,
    )
    outcome = ToolRegistry(all_tools()).execute(
        "web_search", '{"query":"示例文章"}', ToolContext(web=client)
    )
    assert outcome.error is None
    assert "primary-web-search" in outcome.content
    assert "正文内容" in outcome.content


def test_web_tools_via_registry():
    from agent_lab.tools import all_tools
    from agent_lab.tools.registry import ToolRegistry

    registry = ToolRegistry(all_tools())
    client = WebClient(
        http=FakeHTTP(
            {
                BING_HOME: [FakeResponse(BING_HOME_HTML)],
                BING_SEARCH: [FakeResponse(BING_RESULTS)],
            }
        ),
        resolver=public_resolver,
    )
    ctx = ToolContext(web=client)
    outcome = registry.execute("web_search", '{"query":"示例文章"}', ctx)
    assert outcome.error is None and "示例文章" in outcome.content
    outcome = registry.execute("web_fetch", '{"url":"http://localhost/x"}', ctx)
    assert outcome.error and "局域网" in outcome.error
    outcome = registry.execute("web_search", '{"query":"示例文章"}', ToolContext())
    assert outcome.error and "没有接入联网" in outcome.error
