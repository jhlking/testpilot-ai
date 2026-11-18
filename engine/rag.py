# -*- coding: utf-8 -*-
"""
TestPilot RAG 引擎 —— 纯 Python 标准库实现。

设计目标：可验证、可溯源、抗幻觉。
1. 检索层：中文 bigram + 英文单词混合分词，BM25 打分，从知识库召回证据块。
2. 生成层：基于检索到的证据进行"模板化抽取式生成"，而非自由发挥——
   每条测试用例的字段都必须能在证据文本中找到依据（来源 ID + 原文片段）。
3. 抗幻觉：
   - 无证据（相似度低于阈值）时拒绝生成，返回空用例并给出提示；
   - 每条用例携带 citations（引用的 KB-ID + 原文）和 confidence（归一化 BM25 分）；
   - 低置信度用例自动标记 needs_review=true。

不依赖任何第三方库、不需要网络，保证离线可运行、结果可复现。
"""
import json
import math
import os
import re
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
CORPUS_PATH = os.path.join(HERE, "..", "knowledge", "corpus.json")

# ---- BM25 超参数 ----
K1 = 1.5
B = 0.75
# 绝对 BM25 分数低于此值视为"无可靠证据"，拒绝生成（抗幻觉核心闸门）。
# 注意：不能用相对分 score/max_score 做闸门——top-1 恒为 1.0，形同虚设。
MIN_ABS_SCORE = 6.0
# 相对置信度仅用于展示与"需复核"标记，不作为拒绝依据。
RELEVANCE_THRESHOLD = 0.12
# 低于此置信度的用例标记为需人工复核
REVIEW_THRESHOLD = 0.35

STOPWORDS = set("的 了 和 与 及 在 是 有 对 为 以 把 被 从 到 这 那 一个 一些 进行 可以 需要 应该 我们 你们 他们 如果 然后 或者 并且 请 要 时 后 前 中 上 下".split())


def tokenize(text):
    """中英文混合分词：英文/数字按词，中文按字 + 相邻 bigram。无需第三方分词库。"""
    if not text:
        return []
    text = str(text).lower()
    tokens = []
    # 英文单词与数字
    for m in re.finditer(r"[a-z0-9]+", text):
        token = m.group()
        if token not in STOPWORDS and len(token) > 0:
            tokens.append(token)
    # 中文字符序列 -> 单字 + bigram
    for seg in re.findall(r"[\u4e00-\u9fff]+", text):
        chars = list(seg)
        tokens.extend(c for c in chars if c not in STOPWORDS)
        for i in range(len(chars) - 1):
            bigram = chars[i] + chars[i + 1]
            if bigram not in STOPWORDS:
                tokens.append(bigram)
    return tokens


class RAGEngine:
    def __init__(self, corpus_path=None):
        path = corpus_path or CORPUS_PATH
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        self.documents = data["documents"]
        self._build_index()

    def _build_index(self):
        self.docs = []
        self.doc_tokens = []
        self.doc_terms = []
        all_len = 0
        df = Counter()
        for d in self.documents:
            # 把标题、标签、正文拼成可检索文本（标题与标签加权：重复若干次）
            text = " ".join([d["title"]] * 2 + d.get("tags", []) + [d["content"]])
            toks = tokenize(text)
            self.docs.append(d)
            self.doc_tokens.append(toks)
            term_freq = Counter(toks)
            self.doc_terms.append(term_freq)
            df.update(term_freq.keys())
            all_len += len(toks)
        self.N = len(self.docs)
        self.avgdl = all_len / self.N if self.N else 0.0
        self.df = df
        # 预计算 IDF（BM25 形式，保证非负）
        self.idf = {}
        for term, n in df.items():
            self.idf[term] = math.log(1 + (self.N - n + 0.5) / (n + 0.5))

    def _bm25_score(self, query_terms, idx):
        tf = self.doc_terms[idx]
        dl = len(self.doc_tokens[idx])
        score = 0.0
        for term, qtf in query_terms.items():
            if term not in tf:
                continue
            idf = self.idf.get(term, 0.0)
            f = tf[term]
            denom = f + K1 * (1 - B + B * dl / self.avgdl)
            score += idf * (f * (K1 + 1) / denom) * qtf
        return score

    def retrieve(self, query, top_k=4):
        """检索返回证据块列表，每项含 doc、score、normalized confidence、原文引用。"""
        q_terms = Counter(tokenize(query))
        if not q_terms:
            return []
        scored = []
        for i in range(self.N):
            s = self._bm25_score(q_terms, i)
            if s > 0:
                scored.append((s, i))
        scored.sort(reverse=True)
        if not scored:
            return []
        max_score = scored[0][0] or 1.0
        results = []
        for s, i in scored[:top_k]:
            conf = s / max_score  # 相对分：用于展示与排序，最高证据=1.0
            d = self.docs[i]
            results.append({
                "id": d["id"],
                "category": d["category"],
                "title": d["title"],
                "tags": d.get("tags", []),
                "content": d["content"],
                "score": round(s, 4),
                "confidence": round(conf, 4),
                # 绝对分闸门：真实相关才为 True，乱码/无关查询为 False
                "has_evidence": s >= MIN_ABS_SCORE,
            })
        return results

    def search(self, query, top_k=4):
        """对外暴露的纯检索接口。"""
        return self.retrieve(query, top_k=top_k)

    @property
    def stats(self):
        by_cat = Counter(d["category"] for d in self.documents)
        return {
            "total_documents": len(self.documents),
            "categories": dict(by_cat),
            "avg_tokens_per_doc": round(self.avgdl, 1),
        }
