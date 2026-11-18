# -*- coding: utf-8 -*-
"""数据层（Store）单元测试：CRUD、审计、级联、聚合、导出。"""
import os
import tempfile
import unittest

from engine import Store


class StoreTestBase(unittest.TestCase):
    def setUp(self):
        fd, self.db_path = tempfile.mkstemp(suffix=".db")
        os.close(fd)
        os.remove(self.db_path)  # 让 Store 自己建库
        self.store = Store(self.db_path)

    def tearDown(self):
        try:
            self.store._conn().close()
        except Exception:
            pass
        for suffix in ("", "-wal", "-shm"):
            try:
                os.remove(self.db_path + suffix)
            except OSError:
                pass


class TestSeedAndQuery(StoreTestBase):
    def test_demo_data_seeded(self):
        self.assertGreaterEqual(len(self.store.list("projects")), 3)
        self.assertGreaterEqual(len(self.store.list("requirements")), 7)
        self.assertGreaterEqual(len(self.store.list("cases")), 15)
        self.assertGreaterEqual(len(self.store.list("defects")), 5)
        self.assertGreaterEqual(len(self.store.list("users")), 5)

    def test_filter_by_project(self):
        cases = self.store.list("cases", {"project_id": "P-001"})
        self.assertTrue(cases)
        self.assertTrue(all(c["project_id"] == "P-001" for c in cases))

    def test_json_field_roundtrip(self):
        c = self.store.get("cases", "TC-001")
        self.assertIsInstance(c["steps"], list)
        self.assertGreater(len(c["steps"]), 0)
        self.assertIsInstance(c["needs_review"], bool)

    def test_cases_with_requirement_code(self):
        cases = self.store.cases_with_detail({"project_id": "P-001"})
        self.assertTrue(all(c["requirement_code"].startswith("REQ-") for c in cases))

    def test_plan_detail_progress(self):
        p = self.store.plan_detail("PL-001")
        self.assertIsNotNone(p)
        self.assertIn("progress", p)
        pr = p["progress"]
        self.assertEqual(pr["total"], len(p["cases"]))
        self.assertLessEqual(pr["pass"] + pr["fail"], pr["executed"])
        self.assertGreaterEqual(pr["progress"], 0)


class TestCrudAndAudit(StoreTestBase):
    def test_create_generates_id_and_audit(self):
        before = len(self.store.list("audit_logs"))
        r = self.store.create("requirements", {
            "project_id": "P-001", "code": "REQ-NEW-99", "title": "订单导出",
            "description": "导出订单 CSV", "priority": "低", "status": "待评审",
            "source": "测试", "created_at": "2026-11-18",
        }, actor="李伟")
        self.assertTrue(r["id"].startswith("R-"))
        self.assertEqual(r["title"], "订单导出")
        after = len(self.store.list("audit_logs"))
        self.assertEqual(after, before + 1)
        # 审计记录应指向刚创建的实体
        logs = self.store.list("audit_logs", order="timestamp DESC")
        self.assertTrue(any(a["entity"] == r["id"] and "需求" in a["action"] for a in logs))

    def test_id_increments(self):
        r1 = self.store.create("requirements", {"project_id": "P-001", "code": "X1", "title": "A"})
        r2 = self.store.create("requirements", {"project_id": "P-001", "code": "X2", "title": "B"})
        n1 = int(r1["id"].split("-")[-1])
        n2 = int(r2["id"].split("-")[-1])
        self.assertEqual(n2, n1 + 1)

    def test_update_partial(self):
        u = self.store.update("cases", "TC-001", {"execution_status": "fail", "needs_review": True})
        self.assertEqual(u["execution_status"], "fail")
        self.assertTrue(u["needs_review"])
        # 未传字段保持不变
        self.assertEqual(u["title"], self.store.get("cases", "TC-001")["title"])

    def test_update_ignores_unknown_fields(self):
        u = self.store.update("cases", "TC-001", {"nonexistent": "x"})
        self.assertIsNotNone(u)
        self.assertNotIn("nonexistent", u)

    def test_delete(self):
        before = len(self.store.list("requirements"))
        self.store.delete("requirements", "R-001")
        self.assertEqual(len(self.store.list("requirements")), before - 1)
        self.assertIsNone(self.store.get("requirements", "R-001"))


class TestCascade(StoreTestBase):
    def test_delete_project_cascades(self):
        # P-003 下有需求、用例、计划、执行
        self.assertTrue(self.store.list("cases", {"project_id": "P-003"}))
        self.store.delete("projects", "P-003")
        self.assertIsNone(self.store.get("projects", "P-003"))
        self.assertEqual(self.store.list("requirements", {"project_id": "P-003"}), [])
        self.assertEqual(self.store.list("cases", {"project_id": "P-003"}), [])
        self.assertEqual(self.store.list("plans", {"project_id": "P-003"}), [])
        # 其他项目数据不受影响
        self.assertTrue(self.store.list("cases", {"project_id": "P-001"}))


class TestDashboard(StoreTestBase):
    def test_summary_shape(self):
        d = self.store.dashboard()
        s = d["summary"]
        for key in ("projects", "requirements", "cases", "plans", "executions", "defects",
                    "pass_rate", "coverage", "avg_confidence", "needs_review"):
            self.assertIn(key, s)
        self.assertGreater(s["cases"], 0)
        self.assertAlmostEqual(s["coverage"], 100.0, places=1)

    def test_case_results_consistent(self):
        d = self.store.dashboard()
        self.assertEqual(sum(d["case_results"].values()), d["summary"]["cases"])

    def test_gates_four_items(self):
        d = self.store.dashboard()
        self.assertEqual(len(d["gates"]), 4)
        for g in d["gates"]:
            self.assertIn("name", g)
            self.assertIn("passed", g)
            self.assertIsInstance(g["passed"], bool)

    def test_project_scope(self):
        d = self.store.dashboard("P-001")
        self.assertEqual(d["scope"], "P-001")
        self.assertEqual(d["summary"]["cases"], len(self.store.list("cases", {"project_id": "P-001"})))

    def test_trend_well_formed(self):
        d = self.store.dashboard()
        for point in d["trend"]:
            self.assertIn("date", point)


class TestExport(StoreTestBase):
    def test_csv_has_header_and_rows(self):
        csv_text = self.store.export_cases_csv()
        lines = [l for l in csv_text.splitlines() if l.strip()]
        self.assertGreater(len(lines), 10)
        self.assertIn("用例ID", lines[0])
        self.assertIn("测试步骤", lines[0])

    def test_csv_scoped(self):
        full = len([l for l in self.store.export_cases_csv().splitlines() if l.strip()])
        scoped = len([l for l in self.store.export_cases_csv("P-001").splitlines() if l.strip()])
        self.assertLess(scoped, full)


if __name__ == "__main__":
    unittest.main()
