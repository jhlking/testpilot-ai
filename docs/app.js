/* TestPilot AI 前端逻辑 —— 原生 JS，无构建依赖
   本地运行走后端 API；GitHub Pages 静态部署自动降级为内嵌 JS 引擎（standalone.js）。*/
const API = '';
// 仅在 GitHub Pages（github.io 域名）启用内嵌引擎；本地运行走 Python 后端
const STANDALONE = location.hostname.endsWith('github.io') && (typeof generate === 'function');
let docs = STANDALONE ? CORPUS.map(d => ({...d})) : [];
let sessionCases = 0, guardCount = 0, confSum = 0, confCount = 0;
let typeCount = {};

const SAMPLES = {
  login: {
    title: '用户登录功能',
    text: '用户输入用户名（6-20位字母或数字）和密码（8-20位，至少含字母和数字），点击登录。用户名或密码为空提示"不能为空"；格式不符提示格式错误；用户名或密码错误提示"用户名或密码错误"；连续5次密码错误后账号锁定30分钟；登录成功跳转首页并记录日志，密码需密文显示。'
  },
  cart: {
    title: '购物车与结算',
    text: '用户可将商品加入购物车，数量1-99整数。结算时满100减10、满200减30，只享最高一档。需选择收货地址，地址为空提示选择。库存不足提示并限制上限。支付成功生成订单并扣减库存，失败订单标记为待支付。'
  },
  upload: {
    title: '文件上传功能',
    text: '支持上传JPG、PNG图片，单个文件不超过10MB，每次最多5个文件。格式不符提示"仅支持JPG/PNG"；超过10MB提示大小限制；超过5个提示数量限制。上传显示进度条，网络异常提示失败并支持重试，上传后可删除。'
  }
};

function switchView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  document.getElementById('view-' + name).classList.remove('hidden');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.view === name));
  const labels = { dashboard: '工作台', generate: '用例生成', knowledge: '知识库', tests: '质量报告' };
  document.getElementById('crumbView').textContent = labels[name];
  if (name === 'knowledge') renderKnowledge();
  if (name === 'tests') renderTypeChart();
}
document.querySelectorAll('.nav-item').forEach(n => n.addEventListener('click', () => switchView(n.dataset.view)));

function fillSample(key) {
  const s = SAMPLES[key];
  document.getElementById('reqTitle').value = s.title;
  document.getElementById('reqText').value = s.text;
}

async function api(path, options) {
  const res = await fetch(API + path, options);
  return res.json();
}

async function init() {
  if (STANDALONE) {
    // 静态演示模式：本地计算统计
    document.getElementById('mDocs').textContent = CORPUS.length;
    const cats = {};
    CORPUS.forEach(d => cats[d.category] = (cats[d.category] || 0) + 1);
    renderCatChart(cats);
    document.querySelector('.engine-pill').innerHTML = '<span class="dot"></span> 本地 RAG 引擎就绪';
    return;
  }
  try {
    const stats = await api('/api/stats');
    document.getElementById('mDocs').textContent = stats.total_documents;
    const d = await api('/api/documents');
    docs = d.documents;
    renderCatChart(stats.categories);
  } catch (e) {
    document.getElementById('mDocs').textContent = '—';
  }
}

function renderCatChart(cats) {
  const el = document.getElementById('catChart');
  const max = Math.max(...Object.values(cats), 1);
  el.innerHTML = Object.entries(cats).map(([k, v]) => `
    <div class="bar-row"><div class="bar-label">${k}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${v / max * 100}%"></div></div>
      <div class="bar-val">${v}</div></div>`).join('');
}

function renderKnowledge() {
  const kw = (document.getElementById('kbSearch').value || '').toLowerCase();
  const list = docs.filter(d => !kw || (d.title + d.content + d.tags.join('') + d.category).toLowerCase().includes(kw));
  document.getElementById('kbGrid').innerHTML = list.map(d => `
    <div class="kb-card">
      <div class="kb-cat">${d.category}</div>
      <div class="kb-title">${d.title}</div>
      <div class="kb-tags">${d.tags.slice(0, 4).map(t => `<span class="kb-tag">${t}</span>`).join('')}</div>
      <div class="kb-content">${d.content}</div>
      <div class="kb-id">${d.id}</div>
    </div>`).join('');
}

function renderEvidence(evidence) {
  const card = document.getElementById('evidenceCard');
  const list = document.getElementById('evidenceList');
  if (!evidence || !evidence.length) { card.style.display = 'none'; return; }
  card.style.display = 'block';
  document.getElementById('evCount').textContent = evidence.length + ' 条';
  list.innerHTML = evidence.map(e => `
    <div class="ev-item">
      <div class="ev-top"><span class="ev-id">${e.id} · ${e.title}</span><span class="ev-conf">置信度 ${(e.confidence * 100).toFixed(0)}%</span></div>
      <div class="ev-content">${e.content}</div>
    </div>`).join('');
}

function confColor(c) { return c >= 0.7 ? 'var(--green)' : c >= 0.4 ? 'var(--cyan)' : 'var(--amber)'; }

function renderCases(result) {
  const area = document.getElementById('resultArea');
  const ph = document.getElementById('resultPlaceholder');
  ph.style.display = 'none'; area.style.display = 'block';

  if (!result.accepted) {
    guardCount++;
    document.getElementById('mGuard').textContent = guardCount;
    area.innerHTML = `<div class="refusal"><h3>◈ 已拦截：证据不足</h3><p>${result.refusal}</p></div>`;
    return;
  }

  const cases = result.cases;
  sessionCases += cases.length;
  document.getElementById('mCases').textContent = sessionCases;
  const avg = result.meta.avg_confidence;
  confSum += avg; confCount++;
  const ring = document.querySelector('.ring');
  document.getElementById('heroConf').textContent = (avg * 100).toFixed(0) + '%';
  ring.style.background = `conic-gradient(var(--accent2) 0deg,var(--cyan) ${avg * 200}deg,var(--line) ${avg * 200}deg)`;

  cases.forEach(c => { typeCount[c.type_label] = (typeCount[c.type_label] || 0) + 1; });

  const meta = result.meta;
  let html = `<div class="result-head"><div><h3 style="font-size:16px">生成完成 · ${cases.length} 条用例</h3>
    <div class="page-head" style="margin:4px 0 0"><p>所有用例均绑定知识库证据，点击引用可展开原文核对</p></div></div>
    <div class="export-bar">
      <button class="btn btn-ghost btn-sm" onclick="exportCases('md')">导出 Markdown</button>
      <button class="btn btn-ghost btn-sm" onclick="exportCases('json')">导出 JSON</button>
    </div></div>
    <div class="result-meta">
      <span class="meta-pill">平均置信度 <b>${(avg * 100).toFixed(0)}%</b></span>
      <span class="meta-pill">证据块 <b>${meta.evidence_count}</b></span>
      <span class="meta-pill">需复核 <b>${meta.needs_review_count}</b></span>
      <span class="meta-pill">幻觉防护 <b>${meta.hallucination_guard}</b></span>
    </div>`;

  cases.forEach(c => {
    const cite = c.citations[0];
    html += `<div class="case-card">
      <div class="case-top">
        <span class="case-id">${c.id}</span>
        <span class="case-type">${c.type_label}</span>
        <span class="case-pri ${c.priority === '中' ? 'mid' : ''}">${c.priority}优先级</span>
        ${c.needs_review ? '<span class="review-flag">⚠ 建议人工复核</span>' : ''}
        <span class="case-conf"><span class="conf-bar"><span class="conf-fill" style="width:${c.confidence * 100}%;background:${confColor(c.confidence)}"></span></span>${(c.confidence * 100).toFixed(0)}%</span>
      </div>
      <div class="case-title">${c.title}</div>
      <div class="case-body">
        <div class="case-field"><div class="lbl">前置条件</div><div class="val">${c.precondition}</div></div>
        <div class="case-field"><div class="lbl">预期结果</div><div class="val">${c.expected}</div></div>
        <div class="case-field" style="grid-column:1/-1"><div class="lbl">测试步骤</div><ol>${c.steps.map(s => `<li>${s}</li>`).join('')}</ol></div>
      </div>
      <div class="cite-box">
        <div class="cite-head" onclick="toggleCite(this)">▸ 依据来源：${cite.id} · ${cite.title}（点击展开原文）</div>
        <div class="cite-body">${cite.content}</div>
      </div>
    </div>`;
  });
  area.innerHTML = html;
  lastResult = result;
}

function toggleCite(el) {
  const body = el.nextElementSibling;
  body.classList.toggle('show');
  el.textContent = (body.classList.contains('show') ? '▾' : '▸') + el.textContent.slice(1);
}

let lastResult = null;
async function generateCases() {
  const btn = document.getElementById('genBtn');
  const requirement = document.getElementById('reqText').value.trim();
  const title = document.getElementById('reqTitle').value.trim();
  if (!requirement) { alert('请先填写需求描述'); return; }
  btn.disabled = true; btn.textContent = '检索知识库并生成中…';
  try {
    let result;
    if (STANDALONE) {
      result = generate(requirement, title);
    } else {
      result = await api('/api/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requirement, title })
      });
    }
    renderEvidence(result.evidence);
    renderCases(result);
  } catch (e) {
    alert('请求失败：' + e.message);
  } finally {
    btn.disabled = false; btn.textContent = '✦ 生成测试用例';
  }
}

function renderTypeChart() {
  const el = document.getElementById('typeChart');
  const keys = Object.keys(typeCount);
  if (!keys.length) { el.innerHTML = '<div style="color:var(--faint);font-size:12px">尚无数据，请先在「用例生成」中生成用例。</div>'; }
  else {
    const max = Math.max(...Object.values(typeCount), 1);
    el.innerHTML = keys.map(k => `<div class="bar-row"><div class="bar-label">${k}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${typeCount[k] / max * 100}%"></div></div>
      <div class="bar-val">${typeCount[k]}</div></div>`).join('');
  }
  const rate = document.getElementById('passRate');
  rate.textContent = confCount ? (confSum / confCount * 100).toFixed(0) + '%' : '—';
}

function exportCases(fmt) {
  if (!lastResult || !lastResult.cases.length) return;
  let content, type, name;
  if (fmt === 'json') {
    content = JSON.stringify(lastResult, null, 2); type = 'application/json'; name = 'testcases.json';
  } else {
    let md = '# 测试用例（TestPilot AI 生成）\n\n';
    md += `> 平均置信度 ${(lastResult.meta.avg_confidence * 100).toFixed(0)}% · 幻觉防护 ${lastResult.meta.hallucination_guard}\n\n`;
    lastResult.cases.forEach(c => {
      md += `## ${c.id} ${c.title}\n\n- 类型：${c.type_label}｜优先级：${c.priority}｜置信度：${(c.confidence * 100).toFixed(0)}%${c.needs_review ? '｜⚠需复核' : ''}\n`;
      md += `- 前置条件：${c.precondition}\n- 步骤：\n${c.steps.map(s => '  1. ' + s).join('\n')}\n- 预期结果：${c.expected}\n`;
      md += `- 依据来源：${c.citations[0].id} · ${c.citations[0].title}\n\n`;
    });
    content = md; type = 'text/markdown'; name = 'testcases.md';
  }
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
}

init();
