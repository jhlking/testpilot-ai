# -*- coding: utf-8 -*-
"""
TestPilot AI —— 本地服务（Python 标准库，零第三方依赖）。

启动：python server.py  (默认 http://127.0.0.1:8765)

API:
  GET  /api/health          健康检查
  GET  /api/stats           知识库统计
  GET  /api/documents       全部知识文档（知识库浏览）
  POST /api/search          BM25 检索（body: {query, top_k}）
  POST /api/generate        生成测试用例（body: {requirement, title, top_k}）

静态文件由 web/ 目录提供，index.html 为单页应用入口。
"""
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

from engine import RAGEngine, CaseGenerator

ROOT = os.path.dirname(os.path.abspath(__file__))
WEB_DIR = os.path.join(ROOT, "web")
PORT = int(os.environ.get("PORT", "8765"))

engine = RAGEngine()
generator = CaseGenerator(engine)


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, payload, ctype="application/json; charset=utf-8"):
        if isinstance(payload, (dict, list)):
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        else:
            body = payload.encode("utf-8") if isinstance(payload, str) else payload
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self._send(204, "")

    def _read_json(self):
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length) if length else b"{}"
        try:
            return json.loads(raw.decode("utf-8"))
        except Exception:
            return {}

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/api/health":
            return self._send(200, {"status": "ok", "service": "TestPilot AI", "engine": "BM25-RAG"})
        if path == "/api/stats":
            return self._send(200, engine.stats)
        if path == "/api/documents":
            return self._send(200, {"documents": engine.documents})
        # 静态文件
        if path == "/":
            path = "/index.html"
        rel = path.lstrip("/")
        file_path = os.path.join(WEB_DIR, rel)
        if not os.path.abspath(file_path).startswith(WEB_DIR):
            return self._send(403, {"error": "forbidden"})
        if os.path.isfile(file_path):
            ext = os.path.splitext(file_path)[1].lower()
            ctype = {".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
                     ".js": "application/javascript; charset=utf-8", ".svg": "image/svg+xml"}.get(ext, "application/octet-stream")
            with open(file_path, "rb") as f:
                return self._send(200, f.read(), ctype)
        return self._send(404, {"error": "not found"})

    def do_POST(self):
        path = urlparse(self.path).path
        data = self._read_json()
        if path == "/api/search":
            q = data.get("query", "")
            top_k = int(data.get("top_k", 5))
            return self._send(200, {"results": engine.search(q, top_k=top_k), "query": q})
        if path == "/api/generate":
            req = data.get("requirement", "")
            title = data.get("title", "")
            top_k = int(data.get("top_k", 5))
            if not req.strip():
                return self._send(400, {"accepted": False, "refusal": "需求描述不能为空。"})
            result = generator.generate(req, title, top_k=top_k)
            return self._send(200, result)
        return self._send(404, {"error": "not found"})

    def log_message(self, fmt, *args):
        # 精简日志
        print("[%s] %s" % (self.log_date_time_string(), fmt % args))


def main():
    print("=" * 56)
    print("  TestPilot AI  ·  基于 RAG 的测试用例智能生成平台")
    print("=" * 56)
    print("  引擎: BM25-RAG (纯 Python 标准库, 离线可用)")
    print("  知识库: %d 篇文档" % engine.stats["total_documents"])
    print("  服务地址: http://127.0.0.1:%d" % PORT)
    print("  按 Ctrl+C 停止")
    print("=" * 56)
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()


if __name__ == "__main__":
    main()
