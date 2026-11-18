# -*- coding: utf-8 -*-
"""
基于证据的测试用例生成器（Extractive, evidence-grounded generation）。

关键设计：不"自由创作"，而是把需求与检索到的知识库证据做结构化映射，
从证据文本中抽取可落地的测试点，生成多类型用例。每条用例都带：
  - citations: [{id, title, content}] —— 生成该用例所依据的知识库原文
  - confidence: 依据证据置信度聚合
  - needs_review: 低置信度或证据不足时标记人工复核

当检索不到足够相关的证据（低于阈值）时，拒绝生成并返回 refusal 说明，
这是防止 AI 幻觉的第一道闸门：宁可不生成，也不编造。
"""
import re
from .rag import RAGEngine, RELEVANCE_THRESHOLD, REVIEW_THRESHOLD, MIN_ABS_SCORE

# 从需求文本中识别关键信号词，决定生成哪些类型的用例
SIGNALS = {
    "boundary": ["边界", "范围", "限制", "最大", "最小", "不超过", "最多", "最少", "位", "长度", "之间", "以内", "以上", "不超过", "超限"],
    "validation": ["校验", "验证", "必填", "不能为空", "提示", "错误", "格式", "合法", "仅支持", "只允许", "非法"],
    "auth": ["登录", "密码", "账号", "认证", "鉴权", "权限", "token", "授权", "签名", "令牌"],
    "business": ["结算", "支付", "加入购物车", "下单", "订单", "优惠", "库存", "金额", "提交", "生成", "退款", "对账", "满减"],
    "security": ["安全", "上传", "注入", "越权", "加密", "密文", "SQL", "XSS", "敏感", "重放"],
    "idempotency": ["幂等", "重复提交", "重复请求", "重试", "幂等键", "单次"],
    "performance": ["性能", "并发", "响应", "延迟", "TPS", "吞吐", "秒", "负载"],
    "consistency": ["一致", "扣减", "对账", "流水", "重跑", "同步", "累计"],
}

TYPE_LABELS = {
    "positive": "正向功能",
    "negative": "异常/反向",
    "boundary": "边界值",
    "validation": "格式校验",
    "security": "安全性",
    "business": "业务流程",
    "idempotency": "幂等性",
    "performance": "性能时效",
    "consistency": "数据一致性",
}


def _detect_signals(query):
    found = set()
    for typ, words in SIGNALS.items():
        for w in words:
            if w in query:
                found.add(typ)
                break
    return found


def _numbers_in(text):
    """抽取需求中出现的数字及上下文，用于边界用例。"""
    return [m.group() for m in re.finditer(r"\d+", text)]


class CaseGenerator:
    def __init__(self, engine=None, knowledge_context=None):
        self.engine = engine or RAGEngine()
        self.knowledge_context = knowledge_context or {}

    def _citation(self, ev):
        return {
            "id": ev["id"],
            "title": ev["title"],
            "category": ev["category"],
            "content": ev["content"],
        }

    def generate(self, requirement, requirement_title="", top_k=5):
        """
        主入口。返回 dict：
          {accepted, refusal, cases, evidence, meta}
        """
        query = (requirement_title + " " + requirement).strip()
        evidence = self.engine.retrieve(query, top_k=top_k)

        # 闸门 1：无证据，或最佳证据的绝对 BM25 分低于阈值 -> 拒绝生成（抗幻觉核心）
        # 采用绝对分数而非相对分，避免"矬子里拔将军"导致乱码也被判为证据。
        if not evidence or not evidence[0]["has_evidence"]:
            return {
                "accepted": False,
                "refusal": "未检索到足够相关的测试知识证据（相关性低于可信阈值）。为避免编造（幻觉），已拒绝生成用例。请补充更具体的需求描述或更换措辞后重试。",
                "cases": [],
                "evidence": evidence,
                "meta": {"query": query, "evidence_count": len(evidence), "hallucination_guard": "triggered",
                         "best_abs_score": evidence[0]["score"] if evidence else 0, "min_required": MIN_ABS_SCORE},
            }

        top_conf = evidence[0]["confidence"]
        # 只把达到绝对分数阈值的证据作为可用依据
        usable = [e for e in evidence if e["has_evidence"]]
        primary = usable[0]
        citations_all = [self._citation(e) for e in usable]

        signals = _detect_signals(query)
        numbers = _numbers_in(query)
        cases = []
        cid = 1
        feat = (requirement_title or "").strip()

        def add(case_type, title, precond, steps, expected, basis_idx=0, confidence_adj=0.0, priority=None):
            nonlocal cid
            basis = usable[min(basis_idx, len(usable) - 1)]
            conf = max(0.0, min(1.0, basis["confidence"] + confidence_adj))
            if priority is None:
                priority = "高" if case_type in ("positive", "business", "security", "idempotency", "consistency") else "中"
            cases.append({
                "id": "TC-%03d" % cid,
                "type": case_type,
                "type_label": TYPE_LABELS.get(case_type, case_type),
                "title": (feat + "｜" + title) if feat else title,
                "priority": priority,
                "precondition": precond,
                "steps": steps,
                "expected": expected,
                "citations": [self._citation(basis)],
                "confidence": round(conf, 3),
                "needs_review": conf < REVIEW_THRESHOLD,
                "review_status": "draft",
                "execution_status": "untested",
                "assignee": "—",
            })
            cid += 1

        # 1) 正向功能用例（始终生成，依据最主要证据）
        add("positive",
            "验证核心功能在合法输入下正确执行",
            "系统正常运行，用户已进入功能页面",
            ["按需求输入一组合法数据", "提交/确认操作", "观察系统响应"],
            "操作成功，系统按需求返回预期结果，无异常提示")

        # 2) 边界值用例（需求含范围/数量/长度信号，或命中边界知识）
        boundary_ev_idx = next((i for i, e in enumerate(usable) if "边界" in e["title"] or "边界" in e["id"]), None)
        if "boundary" in signals or boundary_ev_idx is not None:
            rng = " / ".join(numbers[:4]) if numbers else "需求规定边界"
            add("boundary",
                "验证输入边界值与临界值",
                "系统正常运行，了解需求规定的取值边界",
                ["输入边界下限值（如最小允许值）并提交", "输入边界上限值并提交", "分别输入略低于下限、略高于上限的值并提交"],
                "边界内取值被接受并正确处理；超出边界的值被拒绝并给出明确提示（依据：" + (rng or "需求边界") + "）",
                basis_idx=boundary_ev_idx or 0)

        # 3) 格式/必填校验用例
        validation_ev_idx = next((i for i, e in enumerate(usable) if "校验" in e["content"] or "必填" in e["content"] or "格式" in e["title"]), None)
        if "validation" in signals or validation_ev_idx is not None:
            add("validation",
                "验证必填项与格式校验",
                "系统正常运行，进入输入页面",
                ["必填项留空直接提交", "输入不符合格式要求的数据提交", "输入合法格式数据提交"],
                "空值与非法格式被拦截并提示具体错误原因；合法输入通过校验",
                basis_idx=validation_ev_idx or 0)

        # 4) 异常/反向用例
        add("negative",
            "验证异常与无效输入的处理",
            "系统正常运行",
            ["输入无效或非法的数据组合", "提交并检查系统反馈"],
            "系统不崩溃、不产生脏数据，给出清晰的错误提示，保持数据一致性",
            basis_idx=min(1, len(usable) - 1), confidence_adj=-0.05)

        # 5) 鉴权/安全用例（命中登录/上传/安全信号）
        if "auth" in signals or "security" in signals:
            sec_idx = next((i for i, e in enumerate(usable) if "安全" in e["category"] or "接口" in e["category"] or "鉴权" in str(e["tags"])), 0)
            add("security",
                "验证身份鉴权与安全性约束",
                "系统具备鉴权机制",
                ["未登录/无权限尝试访问受限功能", "尝试非法或越权参数提交"],
                "未授权访问被拒绝并提示；敏感信息不明文展示；系统无安全漏洞暴露",
                basis_idx=sec_idx)

        # 6) 业务流程用例（命中结算/支付/订单等信号）
        if "business" in signals:
            biz_idx = next((i for i, e in enumerate(usable) if "场景" in e["title"] or "流程" in e["content"]), 0)
            add("business",
                "验证完整业务流程与异常分支",
                "具备完成业务所需的前置数据",
                ["按基本流完成一次完整业务操作", "在关键节点制造异常分支（如支付失败/库存不足）后重试"],
                "基本流成功产出预期结果；异常分支被正确处理，状态与数据保持一致",
                basis_idx=biz_idx)

        # 7) 幂等性用例（重复提交 / 支付 / 下单 / 退款）
        if "idempotency" in signals:
            idem_idx = next((i for i, e in enumerate(usable) if "幂等" in e["title"] or "幂等" in e["content"]), 0)
            add("idempotency",
                "验证重复提交与幂等键约束",
                "系统具备幂等机制，已生成唯一幂等键",
                ["使用同一幂等键连续提交两次相同请求", "校验业务记录数量与返回单号", "使用不同幂等键再提交一次"],
                "重复请求只产生一条记录且返回同一单号；不同幂等键正常创建新记录，无重复扣款/库存扣减",
                basis_idx=idem_idx, priority="高")

        # 8) 性能/时效性用例（延迟 / 秒 / 并发）
        if "performance" in signals:
            perf_idx = next((i for i, e in enumerate(usable) if "性能" in e["title"] or "延迟" in e["content"]), 0)
            add("performance",
                "验证关键操作的时效性与并发响应",
                "系统部署完成，可模拟多用户并发",
                ["在预期并发下执行目标操作", "记录 P95 响应时间与吞吐量", "持续运行观察稳定性"],
                "关键操作响应时间满足需求阈值，吞吐达标，长时间运行无内存泄漏或性能衰减",
                basis_idx=perf_idx, priority="中")

        # 9) 数据一致性用例（扣减 / 对账 / 重跑）
        if "consistency" in signals:
            cons_idx = next((i for i, e in enumerate(usable) if "一致" in e["title"] or "重跑" in e["content"]), 0)
            add("consistency",
                "验证跨模块数据一致性与重跑幂等",
                "具备可对照的源数据与业务流水",
                ["完成一次业务操作后核对关联表数据", "对同一批次执行两次重跑", "比对两次结果与明细汇总"],
                "各关联数据能对平，重跑结果完全一致、无重复计数或脏数据",
                basis_idx=cons_idx, priority="高")

        avg_conf = sum(c["confidence"] for c in cases) / len(cases) if cases else 0.0
        review_count = sum(1 for c in cases if c["needs_review"])
        priority_mix = {}
        for c in cases:
            priority_mix[c["priority"]] = priority_mix.get(c["priority"], 0) + 1
        return {
            "accepted": True,
            "refusal": "",
            "cases": cases,
            "evidence": usable,
            "meta": {
                "query": query,
                "evidence_count": len(usable),
                "case_count": len(cases),
                "avg_confidence": round(avg_conf, 3),
                "needs_review_count": review_count,
                "hallucination_guard": "passed",
                "signals_detected": sorted(signals),
                "priority_mix": priority_mix,
                "engine_version": "2.0.2",
            },
        }
