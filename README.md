<div align="center">

# TestPilot AI · 智测方舟

### 基于 RAG 的测试用例智能生成与溯源平台
### RAG-Powered Test Case Generation & Traceability Platform

> 让每一条测试用例都有据可查 —— 从机制上抑制 AI 幻觉
> *Every test case is evidence-grounded — suppressing AI hallucinations by design*

**[🌐 在线演示 Live Demo](https://jhlking.github.io/testpilot-ai/)** — 纯前端版本，打开即可体验完整 RAG 生成流程（无需安装）

[![Python](https://img.shields.io/badge/后端-Python%20标准库-3776ab?style=flat-square)](#技术栈--tech-stack)
[![Zero Dep](https://img.shields.io/badge/依赖-零第三方库-3fb950?style=flat-square)](#技术栈--tech-stack)
[![BM25](https://img.shields.io/badge/检索-BM25-7c3aed?style=flat-square)](#rag-防幻觉设计--anti-hallucination)
[![Tests](https://img.shields.io/badge/测试-15%20passed-success?style=flat-square)](#测试报告--test-report)
[![License](https://img.shields.io/badge/许可-MIT-green?style=flat-square)](#许可--license)

</div>

---

## 项目简介 · Overview

**中文**

TestPilot AI 是一个面向软件测试场景的智能用例生成平台。它将 **RAG（检索增强生成）** 技术引入测试领域：当用户输入需求描述时，系统先从内置的测试知识库中检索相关证据，再**仅基于这些证据**生成测试用例。每条用例都携带引用的知识库原文（KB-ID + 内容）与量化置信度，点击即可展开核对依据。

与直接调用大模型"凭空生成"不同，TestPilot 把「幻觉抑制」做成了一条可验证的工程链路：**无证据不生成，低置信度自动标记人工复核**。整个系统用纯 Python 标准库实现，无需 GPU、无需 API Key、无需安装依赖，离线即可运行，结果可复现。

**English**

TestPilot AI is an intelligent test-case generation platform for software testing. It brings **RAG (Retrieval-Augmented Generation)** into the testing domain: given a requirement, the system first retrieves relevant evidence from a built-in testing knowledge base, then generates test cases **strictly grounded in that evidence**. Every case carries its source citation (KB-ID + full text) and a quantified confidence score — click to expand and verify the basis.

Unlike free-form LLM generation, TestPilot turns "hallucination suppression" into a verifiable engineering pipeline: **no evidence, no generation; low confidence, automatic flag for review**. Built entirely with the Python standard library — no GPU, no API key, no third-party packages, fully offline and reproducible.

---

## 核心特性 · Features

- **需求 → 用例生成**：输入功能需求，自动生成正向、边界值、格式校验、异常、安全、业务流程等多类型用例
- **证据溯源**：每条用例绑定知识库原文，引用可展开核对，杜绝"无中生有"
- **置信度量化**：基于 BM25 绝对分数与相对分数双指标，置信度可视化
- **幻觉闸门**：无关输入或证据不足时直接拒绝生成（而非编造），并给出明确原因
- **人工复核标记**：弱证据用例自动标记 `needs_review`，融入测试评审流程
- **知识库浏览与检索**：15 篇权威测试知识文档，支持 BM25 语义检索与关键词过滤
- **用例导出**：支持 Markdown / JSON 导出，可直接进入测试管理与缺陷跟踪流程
- **高级可视化界面**：科技感深色主题单页应用，含仪表盘、图表、实时统计

---

## 技术栈 · Tech Stack

| 层次 Layer | 技术 Technology | 说明 Detail |
| --- | --- | --- |
| 编程语言 Language | Python 3 | 仅用标准库，零第三方依赖 |
| 检索引擎 Retrieval | 自研 BM25 | 中文 bigram + 英文分词，OKAPI BM25 打分 |
| 生成方式 Generation | 抽取式 / 证据驱动 | 模板化映射，非自由生成，字段可溯源 |
| 知识存储 Knowledge | JSON 语料库 | 15 篇带稳定 ID 的测试知识文档 |
| 后端服务 Backend | `http.server` | ThreadingHTTPServer，RESTful API |
| 前端 Frontend | 原生 HTML/CSS/JS | 单页应用，零构建，无任何 CDN 依赖 |
| 测试 Testing | `unittest` | 15 个单元测试，覆盖检索与防幻觉 |
| 部署 Deployment | Python 直接运行 / GitHub Pages | 本地零配置启动 |

**为什么这样选**：整个技术栈刻意保持"零依赖 + 可离线"，目的是让评审者 `git clone` 后一条命令即可运行并看到完整效果，不被环境配置、API Key 或网络问题干扰——这对于课程考核与评奖演示至关重要。

---

## RAG 防幻觉设计 · Anti-Hallucination

系统的核心不是"让 AI 更聪明"，而是**让 AI 的每一步输出都可被证据约束和检验**：

```
需求输入
   ↓
① 文本分词（中文 bigram + 英文词）→ 查询向量
   ↓
② BM25 检索知识库 → Top-K 证据块 + 绝对分数
   ↓
③ 闸门：最佳证据绝对分 < 阈值？ → 是 → 拒绝生成（不编造）
   ↓ 否
④ 抽取式生成：从证据中映射测试点 → 用例字段
   ↓
⑤ 每条用例附 citations（KB-ID + 原文）+ confidence + needs_review
   ↓
溯源输出（可点开原文逐条核对）
```

四道防线：

| # | 机制 Mechanism | 实现 Implementation |
| --- | --- | --- |
| 1 | **无证据不生成** | 绝对 BM25 分数低于 `MIN_ABS_SCORE` 时返回拒绝，绝不编造 |
| 2 | **引用可回溯** | 每条用例的 `citations` 字段绑定知识库文档 ID 与完整原文 |
| 3 | **置信度量化** | 绝对分做闸门、相对分做置信度，双层指标避免"矬子里拔将军" |
| 4 | **低分人工复核** | 置信度低于 `REVIEW_THRESHOLD` 的用例自动标记 `needs_review` |

> 开发中单元测试曾捕获一个真实缺陷：用相对分 `score/max_score` 做拒绝闸门时，top-1 恒为 1.0，导致乱码输入也会被接受。已修正为绝对分数闸门并补测——这正是"测试驱动"价值的体现。

---

## 快速开始 · Quick Start

```bash
# 克隆仓库 / Clone
git clone https://github.com/jhlking/testpilot-ai.git
cd testpilot-ai

# 一键启动（零依赖，无需 pip install）/ Start
python server.py
# 打开 http://127.0.0.1:8765

# 运行测试套件 / Run tests
python -m unittest discover -s tests -v
```

> 需要 Python 3.8+。系统自带的 Python 即可，不需要安装任何库。

---

## 使用示例 · Usage

1. 打开 `http://127.0.0.1:8765`，点击「用例生成」
2. 点示例按钮（登录 / 购物车 / 文件上传）或输入自己的需求
3. 点击「生成测试用例」——系统会先展示检索到的证据，再生成用例
4. 每条用例可点击「依据来源」展开知识库原文核对
5. 顶部可导出 Markdown / JSON

API 调用示例：

```bash
curl -X POST http://127.0.0.1:8765/api/generate \
  -H "Content-Type: application/json" \
  -d '{"title":"登录功能","requirement":"用户名6-20位，密码8-20位，连续5次错误锁定30分钟"}'
```

---

## 测试报告 · Test Report

```text
Ran 15 tests in 0.008s

OK
```

| 测试类 Test Class | 覆盖点 Coverage |
| --- | --- |
| `TestTokenizer` | 中文 bigram、英文分词、空输入 |
| `TestRetrieval` | 语料加载、登录/边界检索准确性、置信度边界、无关查询无证据 |
| `TestGeneration` | 正向生成、用例结构完整、类型覆盖、每条有引用、置信度合法、幻觉闸门拒绝 |

运行命令：`python -m unittest discover -s tests -v`

---

## 项目结构 · Structure

```
testpilot-ai/
├── engine/
│   ├── rag.py              # BM25 检索引擎（分词/索引/打分/闸门）
│   └── generator.py        # 证据驱动的用例生成器
├── knowledge/
│   └── corpus.json         # 15 篇测试知识文档（RAG 证据源）
├── web/
│   ├── index.html          # 单页应用结构
│   ├── style.css           # 科技感深色主题
│   └── app.js              # 交互逻辑与可视化
├── tests/
│   └── test_rag.py         # 15 个单元测试
├── server.py               # HTTP 服务与 API
└── README.md
```

---

## 适用场景 · Use Cases

- 软件测试课程设计 / 期末考核项目佐证
- 测试团队的需求分析与测试用例评审辅助
- RAG 落地实践与 AI 幻觉治理的技术演示
- 简历 / 评奖材料中"AI + 测试"工程能力的证明

---

## 许可 · License

MIT License · 欢迎学习与二次开发，使用时请保留来源说明。

---

<div align="center">

**TestPilot AI** — Evidence-grounded testing, by design.
</div>
