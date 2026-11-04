"""模型层 HTTP 链路测试：用标准库 http.server 起一个本地 mock 服务，
验证 OpenAICompatModel 的请求格式与响应解析（不依赖任何外部服务与密钥）。
"""
import pathlib
import sys
import threading

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

import json
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer

from harness.models import OpenAICompatModel


class MockHandler(BaseHTTPRequestHandler):
    last_body = {}

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        MockHandler.last_body = {
            "path": self.path,
            "auth": self.headers.get("Authorization"),
            "payload": json.loads(self.rfile.read(length).decode("utf-8")),
        }
        if self.headers.get("Authorization") == "Bearer good-key":
            body = {
                "choices": [{
                    "message": {
                        "content": None,
                        "tool_calls": [{"id": "call-1", "type": "function",
                                        "function": {"name": "read_file",
                                                     "arguments": '{"path": "a.txt"}'}}],
                    }
                }],
                "usage": {"prompt_tokens": 120, "completion_tokens": 30},
            }
            status = 200
        else:
            body = {"error": {"message": "invalid local API key"}}
            status = 401
        data = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *args):  # 测试输出保持安静
        pass


class TestOpenAICompatModel(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = HTTPServer(("127.0.0.1", 0), MockHandler)
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()
        cls.base_url = f"http://127.0.0.1:{cls.server.server_port}"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()

    def _model(self, key):
        return OpenAICompatModel(base_url=self.base_url, model="mock-model", api_key=key)

    def test_request_format_and_response_parsing(self):
        resp = self._model("good-key").chat(
            [{"role": "user", "content": "hi"}],
            [{"name": "read_file", "description": "d", "parameters": {"type": "object"}}],
        )
        sent = MockHandler.last_body
        self.assertEqual(sent["path"], "/chat/completions")
        self.assertEqual(sent["payload"]["model"], "mock-model")
        self.assertEqual(sent["payload"]["tools"][0],
                         {"type": "function",
                          "function": {"name": "read_file", "description": "d",
                                       "parameters": {"type": "object"}}})
        self.assertEqual(resp.tool_calls[0].name, "read_file")
        self.assertEqual(resp.tool_calls[0].arguments, {"path": "a.txt"})
        self.assertEqual(resp.usage, {"prompt_tokens": 120, "completion_tokens": 30})
        self.assertIsNone(resp.content)

    def test_empty_key_omits_auth_header_and_error_is_readable(self):
        with self.assertRaises(RuntimeError) as cm:
            self._model("").chat([{"role": "user", "content": "hi"}])
        self.assertIn("401", str(cm.exception))
        self.assertIn("invalid local API key", str(cm.exception))
        self.assertIsNone(MockHandler.last_body["auth"])  # 可空密钥=不带 Authorization 头


if __name__ == "__main__":
    unittest.main()
