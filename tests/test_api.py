# -*- coding: utf-8 -*-
"""
REST API 集成测试 —— 在随机端口启动真实 HTTP 服务并逐端点验证。
使用独立临时数据库（TP_DB_PATH），不污染演示数据。
"""
import json
import os
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer

# 必须在 import server 之前设置，确保 Store 使用临时库
_TMP_DB = os.path.join(tempfile.gettempdir(), "testpilot_api_test.db")
for suffix in ("", "-wal", "-shm"):
    try:
        os.remove(_TMP_DB + suffix)
    except OSError:
        pass
os.environ["TP_DB_PATH"] = _TMP_DB

import server as srv  # noqa: E402

HOST, PORT = "127.0.0.1", 8899
BASE = "http://%s:%d" % (HOST, PORT)


def req(method, path, body=None, headers=None):
    data = json.dumps(body).encode("utf-8") if body is not None else None
    r = urllib.request.Request(BASE + path, data=data, method=method)
    r.add_header("Content-Type", "application/json")
    r.add_header("X-Actor", "tester")  # HTTP 头仅支持 latin-1，故用英文标识
    for k, v in (headers or {}).items():
        r.add_header(k, v)
    try:
        with urllib.request.urlopen(r, timeout=10) as resp:
            raw = resp.read().decode("utf-8")
            ctype = resp.headers.get("Content-Type", "")
            return resp.status, (json.loads(raw) if "json" in ctype and raw else raw)
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8")
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, raw


class ApiTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.httpd = ThreadingHTTPServer((HOST, PORT), srv.Handler)
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()
        try:
            srv.store._conn().close()
        except Exception:
            pass
        for suffix in ("", "-wal", "-shm"):
            try:
                os.remove(_TMP_DB + suffix)
            except OSError:
                pass

    # ---------- 系统 ----------
    def test_health(self):
        code, d = req("GET", "/api/health")
        self.assertEqual(code, 200)
        self.assertEqual(d["status"], "ok")
        self.assertEqual(d["version"], "2.0.1")
        self.assertGreaterEqual(d["knowledge_docs"], 29)

    def test_stats(self):
        code, d = req("GET", "/api/stats")
        self.assertEqual(code, 200)
        self.assertGreaterEqual(d["total_documents"], 29)
        self.assertIn("接口测试", d["categories"])

    def test_index_html(self):
        code, html = req("GET", "/")
        self.assertEqual(code, 200)
        self.assertIn("TestPilot Enterprise", html)
        self.assertIn("i18n.js", html)

    # ---------- 列表 / 详情 ----------
    def test_projects_list(self):
        code, d = req("GET", "/api/projects")
        self.assertEqual(code, 200)
        self.assertGreaterEqual(d["total"], 3)

    def test_cases_filter_by_project(self):
        code, d = req("GET", "/api/cases?project_id=P-001")
        self.assertEqual(code, 200)
        self.assertTrue(d["items"])
        self.assertTrue(all(c["project_id"] == "P-001" for c in d["items"]))
        # 关联需求编号已补全
        self.assertTrue(all("requirement_code" in c for c in d["items"]))

    def test_case_detail(self):
        code, c = req("GET", "/api/cases/TC-001")
        self.assertEqual(code, 200)
        self.assertEqual(c["id"], "TC-001")
        self.assertIsInstance(c["steps"], list)

    def test_case_not_found(self):
        code, d = req("GET", "/api/cases/TC-999")
        self.assertEqual(code, 404)

    def test_plan_detail(self):
        code, d = req("GET", "/api/plans/PL-001/detail")
        self.assertEqual(code, 200)
        self.assertIn("progress", d)
        self.assertGreater(d["progress"]["total"], 0)

    def test_dashboard(self):
        code, d = req("GET", "/api/dashboard")
        self.assertEqual(code, 200)
        self.assertEqual(len(d["gates"]), 4)
        self.assertIn("summary", d)

    def test_dashboard_scoped(self):
        code, d = req("GET", "/api/dashboard?project_id=P-002")
        self.assertEqual(code, 200)
        self.assertEqual(d["scope"], "P-002")

    # ---------- 写操作 + 审计 ----------
    def test_create_update_delete_flow(self):
        code, before = req("GET", "/api/audit-logs")
        n_before = before["total"]

        code, created = req("POST", "/api/requirements", {
            "project_id": "P-001", "code": "REQ-API-01", "title": "接口测试需求",
            "description": "由集成测试创建", "priority": "低", "status": "待评审",
            "source": "test", "created_at": "2026-11-18",
        })
        self.assertEqual(code, 201)
        rid = created["id"]

        code, updated = req("PATCH", "/api/requirements/" + rid, {"status": "已评审"})
        self.assertEqual(code, 200)
        self.assertEqual(updated["status"], "已评审")

        code, deleted = req("DELETE", "/api/requirements/" + rid)
        self.assertEqual(code, 200)

        code, after = req("GET", "/api/audit-logs")
        self.assertGreater(after["total"], n_before)
        actions = [a["action"] for a in after["items"]]
        self.assertTrue(any("需求" in a for a in actions))
        # 审计记录的操作者来自请求头
        self.assertTrue(any(a["actor"] == "tester" for a in after["items"]))

    # ---------- 执行用例 ----------
    def test_execute_case_and_autodefect(self):
        code, ex = req("POST", "/api/execute", {
            "case_id": "TC-007", "plan_id": "PL-001", "result": "fail",
            "actual": "支付失败后订单仍显示已支付", "create_defect": True,
            "defect_title": "支付失败订单状态错误", "severity": "严重",
        })
        self.assertEqual(code, 201)
        self.assertEqual(ex["result"], "fail")

        code, c = req("GET", "/api/cases/TC-007")
        self.assertEqual(c["execution_status"], "fail")

        code, defects = req("GET", "/api/defects?project_id=P-001")
        titles = [d["title"] for d in defects["items"]]
        self.assertIn("支付失败订单状态错误", titles)

    # ---------- RAG ----------
    def test_generate(self):
        code, d = req("POST", "/api/generate", {
            "title": "支付下单", "requirement": "创建支付单，金额大于0，幂等键重复提交返回同一订单，签名错误返回401",
        })
        self.assertEqual(code, 200)
        self.assertTrue(d["accepted"])
        self.assertGreaterEqual(len(d["cases"]), 3)
        self.assertEqual(d["meta"]["hallucination_guard"], "passed")

    def test_generate_refuses_garbage(self):
        code, d = req("POST", "/api/generate", {"title": "", "requirement": "asdfghjkl zxcvbnm qwertyuiop"})
        self.assertEqual(code, 200)
        self.assertFalse(d["accepted"])
        self.assertEqual(d["meta"]["hallucination_guard"], "triggered")

    def test_generate_empty_400(self):
        code, d = req("POST", "/api/generate", {"title": "", "requirement": "   "})
        self.assertEqual(code, 400)

    def test_search(self):
        code, d = req("POST", "/api/search", {"query": "边界值分析", "top_k": 3})
        self.assertEqual(code, 200)
        ids = [r["id"] for r in d["results"]]
        self.assertIn("KB-DESIGN-002", ids)

    # ---------- 导出 ----------
    def test_export_csv(self):
        r = urllib.request.Request(BASE + "/api/cases/export.csv")
        with urllib.request.urlopen(r, timeout=10) as resp:
            text = resp.read().decode("utf-8-sig")
        self.assertIn("用例ID", text)
        self.assertGreater(len(text.splitlines()), 10)

    # ---------- 回归用例 ----------
    def test_actor_header_percent_encoded(self):
        """回归：浏览器把中文操作者 encodeURIComponent 放进 X-Actor，
        服务端必须还原成中文写进审计日志。

        背景：HTTP 头只允许 ISO-8859-1，前端若直接塞中文，fetch 会抛
        `Failed to read the 'headers' property ... non ISO-8859-1 code point`，
        导致服务端模式下所有写操作静默失败（生成/新建/修改/执行全部不可用）。
        """
        code, d = req("POST", "/api/requirements", {
            "project_id": "P-001", "title": "回归-编码头部", "description": "x", "priority": "中",
        }, headers={"X-Actor": "%E6%9D%8E%E4%BC%9F"})
        self.assertEqual(code, 201)
        code, logs = req("GET", "/api/audit-logs?limit=50")
        self.assertEqual(code, 200)
        hit = [a for a in logs["items"] if a["entity"] == d["id"]]
        self.assertTrue(hit, "未找到对应审计日志")
        self.assertEqual(hit[0]["actor"], "李伟")

    def test_generate_case_titles_carry_feature_name(self):
        """用例标题必须带功能名，避免多需求混在一起时看不出归属。"""
        code, d = req("POST", "/api/generate", {
            "title": "支付下单接口",
            "requirement": "创建支付单，金额单位为分且大于0，签名错误返回401，幂等键重复提交返回同一单号",
        })
        self.assertEqual(code, 200)
        self.assertTrue(d["accepted"])
        for c in d["cases"]:
            self.assertTrue(c["title"].startswith("支付下单接口｜"), c["title"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
