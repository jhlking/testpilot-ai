# -*- coding: utf-8 -*-
"""
纯前端引擎（web/standalone.js）回归测试。

GitHub Pages 演示用的是浏览器内的 JS 版引擎，它和服务端 Python 引擎是两份
实现，靠 tools/gen_standalone.py 从同一份 corpus.json + seed.py 生成。
这里用 node 直接跑 JS 引擎，锁住三件事：
  1. 生成结构健康（置信度必须是 [0,1] 内的有限数，优先级必须是合法枚举）；
     曾经因为 add() 调用把 priority 传进了 confidence 增量位置，产出 NaN，
     页面显示 "NaN%" 且平均置信度为 null，而 Python 侧测试全绿。
  2. 与服务端引擎的用例条数一致（防止两份实现漂移）。
  3. 幻觉闸门在无证据时同样触发。
"""
import json
import os
import shutil
import subprocess
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STANDALONE = os.path.join(ROOT, "web", "standalone.js")
NODE = shutil.which("node")

REQ = "创建支付单，金额单位为分且大于0，签名错误返回401，幂等键重复提交返回同一单号"
TITLE = "支付下单接口"

HARNESS = r"""
global.window = {};
global.localStorage = {
  store: {},
  getItem(k) { return this.store[k] || null; },
  setItem(k, v) { this.store[k] = v; },
  removeItem(k) { delete this.store[k]; }
};
const fs = require('fs');
eval(fs.readFileSync(process.argv[2], 'utf8'));
const out = {};
const ok = generate(process.argv[3], process.argv[4]);
out.ok = { accepted: ok.accepted, n: ok.cases.length,
           confs: ok.cases.map(c => c.confidence),
           prios: ok.cases.map(c => c.priority),
           titles: ok.cases.map(c => c.title),
           avg: ok.meta.avg_confidence,
           guard: ok.meta.hallucination_guard };
const bad = generate('', 'asdfghjkl zxcvbnm qwertyuiop');
out.bad = { accepted: bad.accepted, guard: bad.meta.hallucination_guard };
console.log(JSON.stringify(out));
"""


@unittest.skipIf(not NODE, "node 未安装，跳过前端引擎测试")
@unittest.skipIf(not os.path.exists(STANDALONE), "standalone.js 未生成")
class StandaloneEngineTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        r = subprocess.run(
            [NODE, "-e", HARNESS, "node", STANDALONE, REQ, TITLE],
            capture_output=True, text=True, timeout=120, cwd=ROOT,
        )
        if r.returncode != 0:
            raise AssertionError("node 执行失败: " + r.stderr[:800])
        cls.data = json.loads(r.stdout.strip().splitlines()[-1])

    def test_accepts_valid_requirement(self):
        self.assertTrue(self.data["ok"]["accepted"])
        self.assertGreaterEqual(self.data["ok"]["n"], 3)

    def test_confidence_is_finite_and_bounded(self):
        for c in self.data["ok"]["confs"]:
            self.assertIsInstance(c, (int, float), "置信度必须是数字，实际 %r" % (c,))
            self.assertGreaterEqual(c, 0.0)
            self.assertLessEqual(c, 1.0)
        self.assertIsNotNone(self.data["ok"]["avg"], "平均置信度为 null（NaN 序列化）")
        self.assertGreater(self.data["ok"]["avg"], 0.0)

    def test_priority_is_valid_enum(self):
        for p in self.data["ok"]["prios"]:
            self.assertIn(p, ("高", "中", "低"))

    def test_titles_carry_feature_name(self):
        for t in self.data["ok"]["titles"]:
            self.assertTrue(t.startswith(TITLE + "｜"), t)

    def test_case_count_matches_server_engine(self):
        import sys
        sys.path.insert(0, ROOT)
        from engine.rag import RAGEngine
        from engine.generator import CaseGenerator
        py = CaseGenerator(RAGEngine(os.path.join(ROOT, "knowledge", "corpus.json")))
        res = py.generate(REQ, TITLE)
        self.assertEqual(len(res["cases"]), self.data["ok"]["n"],
                         "服务端与前端引擎用例条数不一致（两份实现漂移）")

    def test_hallucination_guard_triggers_on_garbage(self):
        self.assertFalse(self.data["bad"]["accepted"])
        self.assertEqual(self.data["bad"]["guard"], "triggered")


if __name__ == "__main__":
    unittest.main(verbosity=2)
