# -*- coding: utf-8 -*-
"""
TestPilot Enterprise —— 企业级测试管理平台后端（Python 标准库，零第三方依赖）。

启动：python server.py   （默认 http://127.0.0.1:8765）

REST API（全部返回 JSON）：
  GET    /api/health                    健康检查
  GET    /api/stats                     知识库统计
  GET    /api/documents                 知识库文档
  POST   /api/search                    BM25 检索
  POST   /api/generate                  证据驱动的用例生成

  GET    /api/{entity}                  列表（支持 ?project_id=xx 过滤）
  POST   /api/{entity}                  新建
  GET    /api/{entity}/{id}             详情
  PATCH  /api/{entity}/{id}             更新
  DELETE /api/{entity}/{id}             删除
    entity ∈ projects | users | requirements | cases | plans | executions | defects | audit-logs

  GET    /api/plans/{id}/detail         计划详情（含用例、执行、进度）
  GET    /api/dashboard                 质量仪表盘（?project_id=）
  GET    /api/cases/export.csv          用例 CSV 导出

鉴权：请求头 X-Actor 携带操作者姓名（演示用轻量身份，默认"当前用户"），所有写操作自动记审计日志。
静态文件由 web/ 提供，SPA 入口 index.html。
"""
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs, unquote

from engine import RAGEngine, CaseGenerator, Store

ROOT = os.path.dirname(os.path.abspath(__file__))
WEB_DIR = os.path.join(ROOT, "web")
PORT = int(os.environ.get("PORT", "8765"))

engine = RAGEngine()
generator = CaseGenerator(engine)
store = Store()

# URL 路径 -> store 实体名
ENTITY_MAP = {
    "projects": "projects",
    "users": "users",
    "requirements": "requirements",
    "cases": "cases",
    "plans": "plans",
    "executions": "executions",
    "defects": "defects",
    "audit-logs": "audit_logs",
}

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Actor, Authorization",
}


class Handler(BaseHTTPRequestHandler):
    server_version = "TestPilotEnterprise/2.0"

    # ---------- 基础响应 ----------
    def _send(self, code, payload, ctype="application/json; charset=utf-8", extra=None):
        if isinstance(payload, (dict, list)):
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        elif isinstance(payload, str):
            body = payload.encode("utf-8")
        elif payload is None:
            body = b""
        else:
            body = payload
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        for k, v in CORS_HEADERS.items():
            self.send_header(k, v)
        if extra:
            for k, v in extra.items():
                self.send_header(k, v)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if body:
            self.wfile.write(body)

    def _json(self, code, payload):
        self._send(code, payload)

    def _read_json(self):
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length) if length else b"{}"
        try:
            return json.loads(raw.decode("utf-8"))
        except Exception:
            return {}

    @property
    def actor(self):
        """操作者。浏览器端把中文姓名 encodeURIComponent 后放进头部
        （HTTP 头只允许 ISO-8859-1），这里还原；兼容明文 ASCII 客户端。"""
        raw = self.headers.get("X-Actor", "")
        if not raw:
            return "当前用户"
        try:
            return unquote(raw) or "当前用户"
        except Exception:
            return raw

    def do_OPTIONS(self):
        self._send(204, None)

    # ---------- GET ----------
    def do_GET(self):
        u = urlparse(self.path)
        path, qs = u.path, parse_qs(u.query)

        # 系统 / 知识库
        if path == "/api/health":
            return self._json(200, {"status": "ok", "service": "TestPilot Enterprise",
                                    "engine": "BM25-RAG v2", "version": "2.0.1",
                                    "store": "SQLite", "knowledge_docs": engine.stats["total_documents"]})
        if path == "/api/stats":
            return self._json(200, engine.stats)
        if path == "/api/documents":
            return self._json(200, {"documents": engine.documents})
        if path == "/api/dashboard":
            pid = qs.get("project_id", [None])[0]
            return self._json(200, store.dashboard(pid))
        if path == "/api/cases/export.csv":
            pid = qs.get("project_id", [None])[0]
            csv_text = store.export_cases_csv(pid)
            return self._send(200, "\ufeff" + csv_text, "text/csv; charset=utf-8",
                              {"Content-Disposition": 'attachment; filename="testcases.csv"'})

        seg = [s for s in path.split("/") if s]

        # /api/plans/{id}/detail
        if len(seg) == 4 and seg[0] == "api" and seg[1] == "plans" and seg[3] == "detail":
            detail = store.plan_detail(seg[2])
            return self._json(200, detail) if detail else self._json(404, {"error": "plan not found"})

        # /api/{entity}/{id}  或  /api/{entity}
        if len(seg) in (2, 3) and seg[0] == "api" and seg[1] in ENTITY_MAP:
            entity = ENTITY_MAP[seg[1]]
            if len(seg) == 3:
                obj = store.get(entity, seg[2])
                return self._json(200, obj) if obj else self._json(404, {"error": "not found"})
            where = {}
            for key in ("project_id", "plan_id", "requirement_id", "case_id", "status", "severity"):
                if key in qs:
                    where[key] = qs[key][0]
            order = qs.get("order", [None])[0]
            limit = qs.get("limit", [None])[0]
            items = store.list(entity, where or None, order, int(limit) if limit else None)
            if entity == "cases":
                for c in items:
                    c["requirement_code"] = (store.get("requirements", c.get("requirement_id")) or {}).get("code", "—")
            return self._json(200, {"items": items, "total": len(items)})

        # 静态文件（SPA）
        if path == "/" or path == "":
            path = "/index.html"
        rel = path.lstrip("/")
        file_path = os.path.normpath(os.path.join(WEB_DIR, rel))
        if not file_path.startswith(WEB_DIR):
            return self._send(403, {"error": "forbidden"})
        if os.path.isfile(file_path):
            ext = os.path.splitext(file_path)[1].lower()
            ctype = {".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
                     ".js": "application/javascript; charset=utf-8", ".svg": "image/svg+xml",
                     ".png": "image/png", ".ico": "image/x-icon"}.get(ext, "application/octet-stream")
            with open(file_path, "rb") as f:
                return self._send(200, f.read(), ctype, {"Cache-Control": "no-store, must-revalidate"})
        # SPA 兜底：未知前端路由回 index.html
        index = os.path.join(WEB_DIR, "index.html")
        if os.path.isfile(index) and "." not in rel:
            with open(index, "rb") as f:
                return self._send(200, f.read(), "text/html; charset=utf-8")
        return self._json(404, {"error": "not found"})

    # ---------- POST ----------
    def do_POST(self):
        path = urlparse(self.path).path
        data = self._read_json()
        if path == "/api/search":
            q = data.get("query", "")
            k = int(data.get("top_k", 5))
            return self._json(200, {"results": engine.search(q, top_k=k), "query": q})
        if path == "/api/generate":
            req, title = data.get("requirement", ""), data.get("title", "")
            if not req.strip():
                return self._json(400, {"accepted": False, "refusal": "需求描述不能为空。"})
            result = generator.generate(req, title, top_k=int(data.get("top_k", 5)))
            store.audit(self.actor, "RAG 生成用例", "GENERATE",
                        ("%s · %d 条 · 置信度%s" % (title or "未命名需求", result["meta"].get("case_count", 0),
                                                  result["meta"].get("avg_confidence", 0))))
            return self._json(200, result)
        if path == "/api/audit":
            store.audit(data.get("actor", self.actor), data.get("action", "自定义操作"),
                        data.get("entity", ""), data.get("detail", ""))
            return self._json(200, {"ok": True})

        seg = [s for s in path.split("/") if s]
        if len(seg) == 2 and seg[0] == "api" and seg[1] in ENTITY_MAP:
            entity = ENTITY_MAP[seg[1]]
            obj = store.create(entity, data, actor=self.actor)
            return self._json(201, obj)

        # 执行用例：写入执行记录并回写用例状态
        if path == "/api/execute":
            case_id, plan_id = data.get("case_id"), data.get("plan_id")
            result = data.get("result", "pass")
            ex = store.create("executions", {
                "id": store.next_id("EX", "executions"), "plan_id": plan_id, "case_id": case_id,
                "result": result, "actual": data.get("actual", ""),
                "executor": self.actor,
                "executed_at": data.get("executed_at") or __import__("datetime").datetime.now().strftime("%Y-%m-%d %H:%M"),
            }, actor=self.actor)
            store.update("cases", case_id, {"execution_status": result}, actor=self.actor)
            if result == "fail" and data.get("create_defect"):
                src = store.get("cases", case_id) or {}
                store.create("defects", {
                    "project_id": src.get("project_id"), "case_id": case_id,
                    "title": data.get("defect_title", "执行失败：" + src.get("title", case_id)),
                    "description": data.get("actual", ""), "severity": data.get("severity", "一般"),
                    "priority": "高", "status": "新建", "assignee": "待分配",
                    "reporter": self.actor, "created_at": ex["executed_at"][:10], "resolved_at": "",
                }, actor=self.actor)
            return self._json(201, ex)

        return self._json(404, {"error": "not found"})

    # ---------- PATCH / PUT ----------
    def do_PATCH(self):
        return self._write_patch()

    def do_PUT(self):
        return self._write_patch()

    def _write_patch(self):
        seg = [s for s in urlparse(self.path).path.split("/") if s]
        if len(seg) == 3 and seg[0] == "api" and seg[1] in ENTITY_MAP:
            entity = ENTITY_MAP[seg[1]]
            patch = self._read_json()
            obj = store.update(entity, seg[2], patch, actor=self.actor)
            return self._json(200, obj) if obj else self._json(404, {"error": "not found"})
        return self._json(404, {"error": "not found"})

    # ---------- DELETE ----------
    def do_DELETE(self):
        seg = [s for s in urlparse(self.path).path.split("/") if s]
        if len(seg) == 3 and seg[0] == "api" and seg[1] in ENTITY_MAP:
            entity = ENTITY_MAP[seg[1]]
            return self._json(200, store.delete(entity, seg[2], actor=self.actor))
        return self._json(404, {"error": "not found"})

    def log_message(self, fmt, *args):
        print("[%s] %s" % (self.log_date_time_string(), fmt % args))


def main():
    print("=" * 62)
    print("  TestPilot Enterprise  ·  企业级测试管理平台")
    print("=" * 62)
    print("  版本:  v2.0.1")
    print("  引擎:  BM25-RAG v2（纯 Python 标准库，离线可用）")
    print("  存储:  SQLite 持久化  |  知识库: %d 篇" % engine.stats["total_documents"])
    print("  演示:  %d 项目 / %d 需求 / %d 用例" % (
        len(store.list("projects")), len(store.list("requirements")), len(store.list("cases"))))
    print("  服务:  http://127.0.0.1:%d" % PORT)
    print("  按 Ctrl+C 停止")
    print("=" * 62)
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()


if __name__ == "__main__":
    main()
