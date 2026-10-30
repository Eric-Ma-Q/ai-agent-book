import time

from agent_lab.interview_dedupe import ReportCalls, report_key


def test_same_request_joins_the_running_call():
    calls = ReportCalls()
    first, leader = calls.claim("k")
    assert leader is True
    second, leader = calls.claim("k")
    assert leader is False
    assert second is first
    calls.finish("k", {"report": {"overall": 60}})
    assert first.event.is_set()
    assert second.data == {"report": {"overall": 60}}


def test_finished_call_is_reused_only_inside_the_window():
    calls = ReportCalls(done_window_s=0.05)
    slot, _ = calls.claim("k")
    calls.finish("k", {"ok": True})
    again, leader = calls.claim("k")
    assert leader is False and again is slot
    time.sleep(0.08)
    _, leader = calls.claim("k")
    assert leader is True


def test_a_failure_is_not_reused():
    calls = ReportCalls()
    slot, leader = calls.claim("k")
    assert leader
    waiter, _ = calls.claim("k")
    calls.fail("k", 502, "模型调用失败")
    assert slot.event.is_set() and waiter.error == (502, "模型调用失败")
    _, leader = calls.claim("k")
    assert leader is True


def test_running_calls_are_never_trimmed():
    calls = ReportCalls(max_slots=1)
    first, leader = calls.claim("a")
    assert leader
    second, leader = calls.claim("b")
    assert leader
    # 两个都在跑：宁可超一点上限，也不能把进行中的调用踢掉造成重复调用。
    assert second is not first


def test_report_key_is_stable_for_the_same_input():
    one = {"sessionId": "iv-1", "transcript": [{"role": "candidate", "text": "答"}]}
    two = {"transcript": [{"role": "candidate", "text": "答"}], "sessionId": "iv-1"}
    assert report_key(one) == report_key(two)
    assert report_key(one) != report_key({**one, "sessionId": "iv-2"})
    assert len(report_key(one)) == 32
