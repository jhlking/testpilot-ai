# -*- coding: utf-8 -*-
"""
TestPilot AI 引擎单元测试套件。

覆盖：检索准确性、证据约束、置信度计算、无幻觉闸门、用例结构完整性。
运行：python -m unittest discover -s tests -v
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from engine.rag import RAGEngine, tokenize, MIN_ABS_SCORE
from engine.generator import CaseGenerator


class TestTokenizer(unittest.TestCase):
    def test_chinese_bigram(self):
        toks = tokenize("边界值分析")
        self.assertIn("边", toks)
        self.assertIn("边界", toks)
        self.assertIn("界值", toks)

    def test_english_lowercase(self):
        toks = tokenize("API Testing HTTP")
        self.assertIn("api", toks)
        self.assertIn("http", toks)

    def test_empty(self):
        self.assertEqual(tokenize(""), [])


class TestRetrieval(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine = RAGEngine()

    def test_corpus_loaded(self):
        self.assertEqual(self.engine.stats["total_documents"], 15)

    def test_login_retrieval_top_hit(self):
        results = self.engine.retrieve("用户登录 密码 5次错误 锁定", top_k=3)
        self.assertTrue(results)
        self.assertEqual(results[0]["id"], "KB-REQ-001")
        self.assertEqual(results[0]["confidence"], 1.0)

    def test_boundary_retrieval(self):
        results = self.engine.retrieve("边界值分析 上点 离点 临界值", top_k=3)
        ids = [r["id"] for r in results]
        self.assertIn("KB-DESIGN-002", ids)

    def test_confidence_bounded(self):
        results = self.engine.retrieve("缺陷严重程度 优先级", top_k=5)
        for r in results:
            self.assertGreaterEqual(r["confidence"], 0.0)
            self.assertLessEqual(r["confidence"], 1.0)

    def test_irrelevant_query_no_evidence(self):
        # 完全无意义的乱码：要么检索为空，要么所有结果都无有效证据
        results = self.engine.retrieve("asdfghjkl zxcvbnm qwertyuiop zxcvasdf", top_k=3)
        self.assertTrue(all(not r["has_evidence"] for r in results))
        if results:
            self.assertLess(results[0]["score"], MIN_ABS_SCORE)


class TestGeneration(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine = RAGEngine()
        cls.generator = CaseGenerator(cls.engine)

    def test_positive_generation(self):
        r = self.generator.generate(
            "用户登录，用户名6-20位，密码8-20位，连续5次错误锁定30分钟", "登录功能")
        self.assertTrue(r["accepted"])
        self.assertGreaterEqual(len(r["cases"]), 3)

    def test_every_case_has_citation(self):
        r = self.generator.generate("购物车结算 满100减10 库存不足 支付失败", "购物车")
        for c in r["cases"]:
            self.assertTrue(c["citations"])
            self.assertTrue(c["citations"][0]["id"].startswith("KB-"))
            self.assertTrue(c["citations"][0]["content"])

    def test_every_case_has_confidence(self):
        r = self.generator.generate("文件上传 JPG PNG 不超过10MB 最多5个", "上传")
        for c in r["cases"]:
            self.assertGreaterEqual(c["confidence"], 0.0)
            self.assertLessEqual(c["confidence"], 1.0)
            self.assertIsInstance(c["needs_review"], bool)

    def test_type_coverage(self):
        r = self.generator.generate(
            "登录密码校验，长度边界，连续5次错误锁定，密码密文显示", "登录安全")
        types = {c["type"] for c in r["cases"]}
        self.assertIn("positive", types)
        self.assertIn("negative", types)
        self.assertIn("boundary", types)

    def test_hallucination_guard_refuses(self):
        r = self.generator.generate("asdfghjkl zxcvbnm qwertyuiop zxcvasdf", "")
        self.assertFalse(r["accepted"])
        self.assertEqual(len(r["cases"]), 0)
        self.assertEqual(r["meta"]["hallucination_guard"], "triggered")
        self.assertTrue(r["refusal"])

    def test_valid_query_has_evidence(self):
        r = self.generator.generate("用户登录密码校验，5次错误锁定账号", "登录")
        self.assertTrue(r["accepted"])
        self.assertGreaterEqual(r["evidence"][0]["score"], MIN_ABS_SCORE)

    def test_case_structure_complete(self):
        r = self.generator.generate("接口鉴权 token 权限校验", "鉴权")
        for c in r["cases"]:
            for key in ("id", "type", "title", "precondition", "steps", "expected", "citations", "confidence"):
                self.assertIn(key, c)
            self.assertGreater(len(c["steps"]), 0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
