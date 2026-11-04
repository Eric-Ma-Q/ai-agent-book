"""全局测试夹具：任何测试都不能写入仓库里真实的回归目录。"""

import pytest


@pytest.fixture(autouse=True)
def isolated_regressions(tmp_path_factory, monkeypatch):
    target = tmp_path_factory.mktemp("regressions")
    monkeypatch.setattr("evals.tasks.REGRESSIONS_DIR", target)
    return target
