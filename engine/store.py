# -*- coding: utf-8 -*-
"""
Enterprise Store —— 基于 sqlite3 的持久化数据层（Python 标准库，零第三方依赖）。

负责：
  1. 八类实体的结构化存储与 CRUD（项目/需求/用例/计划/执行/缺陷/审计/用户）
  2. 关联查询与级联（删除项目时清理下属数据）
  3. 质量指标聚合（覆盖率、通过率、缺陷分布、趋势）
  4. 审计日志自动记录

数据库默认落在 <项目根>/data/testpilot.db，首次启动自动建表并灌入演示数据。
"""
import json
import os
import sqlite3
import threading
from datetime import datetime

from . import seed

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_DB = os.environ.get("TP_DB_PATH") or os.path.join(ROOT, "data", "testpilot.db")

SCHEMA = """
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY, code TEXT UNIQUE, name TEXT NOT NULL, description TEXT,
  status TEXT DEFAULT 'active', owner TEXT, priority TEXT, created_at TEXT
);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, username TEXT UNIQUE, name TEXT, role TEXT,
  team TEXT, status TEXT
);
CREATE TABLE IF NOT EXISTS requirements (
  id TEXT PRIMARY KEY, project_id TEXT, code TEXT, title TEXT NOT NULL,
  description TEXT, priority TEXT, status TEXT, source TEXT, created_at TEXT
);
CREATE TABLE IF NOT EXISTS cases (
  id TEXT PRIMARY KEY, project_id TEXT, requirement_id TEXT, title TEXT NOT NULL,
  type TEXT, priority TEXT, precondition TEXT, steps TEXT, expected TEXT,
  confidence REAL DEFAULT 0, citations TEXT, needs_review INTEGER DEFAULT 0,
  review_status TEXT DEFAULT 'draft', execution_status TEXT DEFAULT 'untested',
  assignee TEXT, created_at TEXT
);
CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY, project_id TEXT, name TEXT NOT NULL, description TEXT,
  start_date TEXT, end_date TEXT, status TEXT, owner TEXT
);
CREATE TABLE IF NOT EXISTS plan_cases (
  plan_id TEXT, case_id TEXT, PRIMARY KEY (plan_id, case_id)
);
CREATE TABLE IF NOT EXISTS executions (
  id TEXT PRIMARY KEY, plan_id TEXT, case_id TEXT, result TEXT,
  actual TEXT, executor TEXT, executed_at TEXT
);
CREATE TABLE IF NOT EXISTS defects (
  id TEXT PRIMARY KEY, project_id TEXT, case_id TEXT, title TEXT NOT NULL,
  description TEXT, severity TEXT, priority TEXT, status TEXT,
  assignee TEXT, reporter TEXT, created_at TEXT, resolved_at TEXT
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY, actor TEXT, action TEXT, entity TEXT,
  detail TEXT, timestamp TEXT, ip TEXT
);
CREATE INDEX IF NOT EXISTS idx_req_project ON requirements(project_id);
CREATE INDEX IF NOT EXISTS idx_case_project ON cases(project_id);
CREATE INDEX IF NOT EXISTS idx_case_req ON cases(requirement_id);
CREATE INDEX IF NOT EXISTS idx_def_project ON defects(project_id);
CREATE INDEX IF NOT EXISTS idx_exec_plan ON executions(plan_id);
"""

# 实体名 -> (表名, 可写字段)
ENTITIES = {
    "projects": ("projects", ["id", "code", "name", "description", "status", "owner", "priority", "created_at"]),
    "users": ("users", ["id", "username", "name", "role", "team", "status"]),
    "requirements": ("requirements", ["id", "project_id", "code", "title", "description", "priority", "status", "source", "created_at"]),
    "cases": ("cases", ["id", "project_id", "requirement_id", "title", "type", "priority", "precondition", "steps",
                        "expected", "confidence", "citations", "needs_review", "review_status", "execution_status",
                        "assignee", "created_at"]),
    "plans": ("plans", ["id", "project_id", "name", "description", "start_date", "end_date", "status", "owner"]),
    "executions": ("executions", ["id", "plan_id", "case_id", "result", "actual", "executor", "executed_at"]),
    "defects": ("defects", ["id", "project_id", "case_id", "title", "description", "severity", "priority", "status",
                            "assignee", "reporter", "created_at", "resolved_at"]),
    "audit_logs": ("audit_logs", ["id", "actor", "action", "entity", "detail", "timestamp", "ip"]),
}

JSON_FIELDS = {"steps", "citations"}


class Store:
    def __init__(self, db_path=None):
        self.db_path = db_path or DEFAULT_DB
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        self._local = threading.local()
        self._init_db()

    # ---------- 连接管理 ----------
    def _conn(self):
        conn = getattr(self._local, "conn", None)
        if conn is None:
            conn = sqlite3.connect(self.db_path, check_same_thread=False)
            conn.row_factory = sqlite3.Row
            conn.execute("PRAGMA journal_mode=WAL")
            self._local.conn = conn
        return conn

    def _init_db(self):
        conn = self._conn()
        conn.executescript(SCHEMA)
        conn.commit()
        if conn.execute("SELECT COUNT(*) FROM projects").fetchone()[0] == 0:
            self._seed()

    # ---------- 演示数据 ----------
    def _seed(self):
        conn = self._conn()
        for u in seed.USERS:
            self._insert("users", u, audit=False)
        for p in seed.PROJECTS:
            self._insert("projects", p, audit=False)
        for r in seed.REQUIREMENTS:
            self._insert("requirements", r, audit=False)
        for c in seed.CASES:
            self._insert("cases", c, audit=False)
        for p in seed.PLANS:
            self._insert("plans", p, audit=False)
        for plan_id, case_id in seed.PLAN_CASES:
            conn.execute("INSERT OR IGNORE INTO plan_cases VALUES (?,?)", (plan_id, case_id))
        for e in seed.EXECUTIONS:
            self._insert("executions", e, audit=False)
        for d in seed.DEFECTS:
            self._insert("defects", d, audit=False)
        for a in seed.AUDIT_LOGS:
            self._insert("audit_logs", a, audit=False)
        conn.commit()

    # ---------- 通用 CRUD ----------
    def _row_to_dict(self, table, row):
        if row is None:
            return None
        d = dict(row)
        for f in JSON_FIELDS:
            if f in d and isinstance(d[f], str):
                try:
                    d[f] = json.loads(d[f])
                except Exception:
                    pass
        if table == "cases":
            d["needs_review"] = bool(d.get("needs_review"))
        return d

    def _insert(self, entity, data, audit=True):
        table, fields = ENTITIES[entity]
        row = {}
        for f in fields:
            v = data.get(f)
            if f in JSON_FIELDS and v is not None and not isinstance(v, str):
                v = json.dumps(v, ensure_ascii=False)
            if f == "needs_review":
                v = 1 if v else 0
            row[f] = v
        cols = ",".join(row)
        marks = ",".join("?" for _ in row)
        self._conn().execute("INSERT OR REPLACE INTO %s (%s) VALUES (%s)" % (table, cols, marks),
                             tuple(row.values()))
        if audit and entity != "audit_logs":
            self.audit("系统", "创建" + entity[:-1] if entity.endswith("s") else "创建" + entity,
                       str(data.get("id", "")), str(data.get("title") or data.get("name") or ""))
        return data.get("id")

    def list(self, entity, where=None, order=None, limit=None):
        """where: dict of field->value；order: 'field DESC' 等。"""
        table, _ = ENTITIES[entity]
        sql = "SELECT * FROM %s" % table
        params = []
        if where:
            clauses = []
            for k, v in where.items():
                if v is None:
                    clauses.append("%s IS NULL" % k)
                elif isinstance(v, (list, tuple, set)):
                    clauses.append("%s IN (%s)" % (k, ",".join("?" for _ in v)))
                    params.extend(v)
                else:
                    clauses.append("%s = ?" % k)
                    params.append(v)
            sql += " WHERE " + " AND ".join(clauses)
        if order:
            sql += " ORDER BY " + order
        if limit:
            sql += " LIMIT %d" % int(limit)
        rows = self._conn().execute(sql, params).fetchall()
        return [self._row_to_dict(entity, r) for r in rows]

    def get(self, entity, entity_id):
        table, _ = ENTITIES[entity]
        row = self._conn().execute("SELECT * FROM %s WHERE id=?" % table, (entity_id,)).fetchone()
        return self._row_to_dict(entity, row)

    def create(self, entity, data, actor="当前用户"):
        if not data.get("id"):
            data = dict(data)
            prefix = {"projects": "P", "users": "U", "requirements": "R", "cases": "TC",
                      "plans": "PL", "executions": "EX", "defects": "BUG", "audit_logs": "AL"}[entity]
            data["id"] = self.next_id(prefix, entity)
        self._insert(entity, data, audit=False)
        self._conn().commit()
        if entity != "audit_logs":
            label = self._label(entity)
            self.audit(actor, "创建" + label, data["id"],
                       str(data.get("title") or data.get("name") or ""))
        return self.get(entity, data["id"])

    @staticmethod
    def _label(entity):
        return {"cases": "用例", "requirements": "需求", "defects": "缺陷", "plans": "测试计划",
                "projects": "项目", "executions": "执行记录", "users": "用户"}.get(entity, entity)

    def update(self, entity, entity_id, patch, actor="当前用户"):
        table, fields = ENTITIES[entity]
        allowed = {k: v for k, v in patch.items() if k in fields and k != "id"}
        if not allowed:
            return self.get(entity, entity_id)
        for f in JSON_FIELDS:
            if f in allowed and allowed[f] is not None and not isinstance(allowed[f], str):
                allowed[f] = json.dumps(allowed[f], ensure_ascii=False)
        if "needs_review" in allowed:
            allowed["needs_review"] = 1 if allowed["needs_review"] else 0
        sets = ",".join("%s=?" % k for k in allowed)
        self._conn().execute("UPDATE %s SET %s WHERE id=?" % (table, sets),
                             tuple(allowed.values()) + (entity_id,))
        self._conn().commit()
        self.audit(actor, "更新" + self._label(entity), entity_id, ",".join(allowed.keys()))
        return self.get(entity, entity_id)

    def delete(self, entity, entity_id, actor="当前用户"):
        table, _ = ENTITIES[entity]
        conn = self._conn()
        if entity == "projects":
            # 级联清理：需求/用例/计划/缺陷/执行
            reqs = [r["id"] for r in self.list("requirements", {"project_id": entity_id})]
            cases = [c["id"] for c in self.list("cases", {"project_id": entity_id})]
            plans = [p["id"] for p in self.list("plans", {"project_id": entity_id})]
            for pid in plans:
                conn.execute("DELETE FROM plan_cases WHERE plan_id=?", (pid,))
                conn.execute("DELETE FROM executions WHERE plan_id=?", (pid,))
            for cid in cases:
                conn.execute("DELETE FROM plan_cases WHERE case_id=?", (cid,))
                conn.execute("DELETE FROM executions WHERE case_id=?", (cid,))
                conn.execute("DELETE FROM defects WHERE case_id=?", (cid,))
            for rid in reqs:
                conn.execute("DELETE FROM cases WHERE requirement_id=?", (rid,))
            conn.execute("DELETE FROM requirements WHERE project_id=?", (entity_id,))
            conn.execute("DELETE FROM cases WHERE project_id=?", (entity_id,))
            conn.execute("DELETE FROM plans WHERE project_id=?", (entity_id,))
            conn.execute("DELETE FROM defects WHERE project_id=?", (entity_id,))
        conn.execute("DELETE FROM %s WHERE id=?" % table, (entity_id,))
        conn.commit()
        self.audit(actor, "删除" + entity.rstrip("s"), entity_id, "")
        return {"deleted": entity_id}

    def next_id(self, prefix, entity):
        table, _ = ENTITIES[entity]
        rows = self._conn().execute("SELECT id FROM %s WHERE id LIKE ?" % table, (prefix + "-%",)).fetchall()
        nums = []
        for r in rows:
            try:
                nums.append(int(r[0].split("-")[-1]))
            except ValueError:
                pass
        return "%s-%03d" % (prefix, max(nums) + 1 if nums else 1)

    # ---------- 审计 ----------
    def audit(self, actor, action, entity_id, detail="", ip="127.0.0.1"):
        import uuid
        aid = "AL-" + datetime.now().strftime("%Y%m%d%H%M%S%f")[:-3] + uuid.uuid4().hex[:4].upper()
        ts = datetime.now().strftime("%Y-%m-%d %H:%M")
        self._conn().execute("INSERT OR REPLACE INTO audit_logs VALUES (?,?,?,?,?,?,?)",
                             (aid, actor, action, entity_id, detail, ts, ip))
        self._conn().commit()

    # ---------- 关联查询 ----------
    def cases_with_detail(self, where=None):
        cases = self.list("cases", where)
        reqs = {r["id"]: r for r in self.list("requirements")}
        for c in cases:
            r = reqs.get(c.get("requirement_id"))
            c["requirement_code"] = r["code"] if r else "—"
            c["requirement_title"] = r["title"] if r else "—"
        return cases

    def plan_detail(self, plan_id):
        p = self.get("plans", plan_id)
        if not p:
            return None
        rows = self._conn().execute("""
            SELECT c.* FROM cases c JOIN plan_cases pc ON pc.case_id=c.id WHERE pc.plan_id=?
        """, (plan_id,)).fetchall()
        p["cases"] = [self._row_to_dict("cases", r) for r in rows]
        ex = self.list("executions", {"plan_id": plan_id})
        p["executions"] = ex
        p["progress"] = self._progress(p["cases"], ex)
        return p

    @staticmethod
    def _progress(cases, executions):
        total = len(cases)
        done = len(executions)
        passed = sum(1 for e in executions if e["result"] == "pass")
        failed = sum(1 for e in executions if e["result"] == "fail")
        return {
            "total": total, "executed": done,
            "pass": passed, "fail": failed, "not_run": max(0, total - done),
            "pass_rate": round(passed / done * 100, 1) if done else 0.0,
            "progress": round(done / total * 100, 1) if total else 0.0,
        }

    # ---------- 质量指标 ----------
    def dashboard(self, project_id=None):
        """全局/项目级质量仪表盘。"""
        where = {"project_id": project_id} if project_id else None
        cases = self.list("cases", where)
        reqs = self.list("requirements", where)
        defects = self.list("defects", where)
        plans = self.list("plans", where)
        case_ids = {c["id"] for c in cases}
        executions = [e for e in self.list("executions") if e["case_id"] in case_ids]

        by_result = {"pass": 0, "fail": 0, "blocked": 0, "untested": 0}
        for c in cases:
            by_result[c.get("execution_status", "untested")] = by_result.get(c.get("execution_status", "untested"), 0) + 1
        by_severity = {}
        for d in defects:
            by_severity[d["severity"]] = by_severity.get(d["severity"], 0) + 1
        by_status = {}
        for d in defects:
            by_status[d["status"]] = by_status.get(d["status"], 0) + 1

        reviewed = sum(1 for c in cases if c.get("review_status") in ("reviewed", "approved"))
        covered_reqs = len({c["requirement_id"] for c in cases if c.get("requirement_id")})
        executed = by_result["pass"] + by_result["fail"] + by_result["blocked"]
        pass_rate = round(by_result["pass"] / executed * 100, 1) if executed else 0.0
        critical_open = sum(1 for d in defects if d["severity"] in ("致命", "严重")
                            and d["status"] not in ("已关闭",))

        # 质量门禁
        coverage = round(covered_reqs / len(reqs) * 100, 1) if reqs else 0.0
        gates = [
            {"name": "需求覆盖率", "value": coverage, "target": 90, "unit": "%", "passed": coverage >= 90},
            {"name": "用例评审率", "value": round(reviewed / len(cases) * 100, 1) if cases else 0, "target": 80, "unit": "%",
             "passed": reviewed / len(cases) >= 0.8 if cases else False},
            {"name": "执行通过率", "value": pass_rate, "target": 95, "unit": "%", "passed": pass_rate >= 95},
            {"name": "致命/严重未关闭", "value": critical_open, "target": 0, "unit": "个", "passed": critical_open == 0},
        ]
        trend = {}
        for e in executions:
            day = (e.get("executed_at") or "")[:10]
            if day:
                trend.setdefault(day, {"pass": 0, "fail": 0})
                trend[day][e["result"]] = trend[day].get(e["result"], 0) + 1

        return {
            "scope": project_id or "ALL",
            "summary": {
                "projects": len(self.list("projects")), "requirements": len(reqs), "cases": len(cases),
                "plans": len(plans), "executions": len(executions), "defects": len(defects),
                "pass_rate": pass_rate, "coverage": coverage,
                "avg_confidence": round(sum(c.get("confidence", 0) for c in cases) / len(cases), 3) if cases else 0,
                "needs_review": sum(1 for c in cases if c.get("needs_review")),
            },
            "case_results": by_result,
            "defect_severity": by_severity,
            "defect_status": by_status,
            "gates": gates,
            "gate_passed": sum(1 for g in gates if g["passed"]),
            "trend": [{"date": k, **v} for k, v in sorted(trend.items())],
            "recent_audit": self.list("audit_logs", order="timestamp DESC", limit=8),
        }

    def export_cases_csv(self, project_id=None):
        import csv
        import io
        cases = self.cases_with_detail({"project_id": project_id} if project_id else None)
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(["用例ID", "所属项目", "需求编号", "标题", "类型", "优先级", "置信度", "需复核",
                    "评审状态", "执行状态", "负责人", "前置条件", "测试步骤", "预期结果"])
        for c in cases:
            proj = self.get("projects", c["project_id"])
            w.writerow([c["id"], proj["name"] if proj else "", c.get("requirement_code", ""), c["title"],
                        c["type"], c["priority"], c.get("confidence", ""), "是" if c.get("needs_review") else "否",
                        c.get("review_status", ""), c.get("execution_status", ""), c.get("assignee", ""),
                        c.get("precondition", ""), " | ".join(c.get("steps", [])), c.get("expected", "")])
        return buf.getvalue()
