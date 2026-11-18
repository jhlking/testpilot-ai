/* ============================================================
   TestPilot Enterprise —— 前端应用逻辑
   本地运行走后端 REST API；GitHub Pages 静态部署走 DemoAPI（浏览器内持久化）
   ============================================================ */
const IS_DEMO = location.hostname.endsWith("github.io");
const ENTITY_URL = { audit: "audit-logs" };
const ENTITY_DEMO = { audit: "auditLogs", "audit-logs": "auditLogs" };

/* 当前操作者。HTTP 头只允许 ISO-8859-1，中文必须 encodeURIComponent 后再发，
   服务端用 urllib.parse.unquote 还原（否则 fetch 直接抛 TypeError）。 */
const ACTOR = "李伟";
function actorHeader() {
  try { return encodeURIComponent(ACTOR); }
  catch (e) { return "user"; }
}

const STATE = {
  view: "dashboard",
  projectId: "",
  dashboard: null,
  projects: [], requirements: [], cases: [], plans: [], defects: [], audit: [], users: [], docs: [],
  gen: { title: "", text: "", result: null, evidence: null, running: false },
  filters: { cases: { review: "", exec: "", type: "" }, defects: "" },
  search: "",
  booted: false
};

/* ---------------- 工具 ---------------- */
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function $(sel, root) { return (root || document).querySelector(sel); }
function $$(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }
function pct(v) { return (v == null ? 0 : v) + "%"; }

function toast(msg, type) {
  const wrap = $("#toastWrap");
  const el = document.createElement("div");
  el.className = "toast" + (type === "err" ? " err" : type === "info" ? " info" : "");
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => { el.style.opacity = "0"; el.style.transition = ".25s"; setTimeout(() => el.remove(), 300); }, 2600);
}

/* 状态徽章 */
function badgeReview(v) {
  const map = { draft: ["amber", "enum.review.draft"], reviewed: ["blue", "enum.review.reviewed"], approved: ["green", "enum.review.approved"] };
  const m = map[v] || ["gray", null];
  return `<span class="badge ${m[0]}">${m[1] ? t(m[1]) : esc(v)}</span>`;
}
function badgeExec(v) {
  const map = { untested: ["gray", "enum.exec.untested"], pass: ["green", "enum.exec.pass"], fail: ["red", "enum.exec.fail"], blocked: ["amber", "enum.exec.blocked"] };
  const m = map[v] || ["gray", null];
  return `<span class="badge ${m[0]}">${m[1] ? t(m[1]) : esc(v)}</span>`;
}
function badgeSeverity(v) {
  const map = { "致命": "red", "严重": "amber", "一般": "blue", "轻微": "gray" };
  return `<span class="badge ${map[v] || "gray"}">${t("enum.severity." + v) === ("enum.severity." + v) ? esc(v) : t("enum.severity." + v)}</span>`;
}
function badgePriority(v) {
  const map = { "高": "red", "中": "amber", "低": "gray", "P0": "red", "P1": "blue" };
  return `<span class="badge ${map[v] || "gray"}">${esc(prioText(v))}</span>`;
}

/* 数据值仍是中文（数据库里的枚举），展示时按当前语言翻译 */
const SEV_ORDER = ["致命", "严重", "一般", "轻微"];
const DEFECT_STATUS = ["新建", "已修复待验证", "重新打开", "已关闭", "拒绝", "延迟"];
function enumText(prefix, v) {
  const k = prefix + v;
  const s = t(k);
  return s === k ? v : s;
}
function sevText(v) { return enumText("enum.severity.", v); }
function statusText(v) { return enumText("enum.dstatus.", v); }
function prioText(v) {
  const key = { "高": "high", "中": "mid", "低": "low" }[v];
  return key ? t("enum.priority." + key) : v;
}

/* 审计日志里的动作是后端按"动词+实体"拼的中文，这里按当前语言还原 */
const AUDIT_VERB = {
  "创建": "audit.create", "更新": "audit.update", "删除": "audit.delete",
  "提交": "audit.submit", "评审": "audit.review", "导入": "audit.import", "执行": "audit.execute"
};
const ENTITY_ZH = {
  "用例": "entity.case", "需求": "entity.requirement", "缺陷": "entity.defect",
  "测试计划": "entity.plan", "项目": "entity.project", "执行记录": "entity.execution", "用户": "entity.user"
};
function auditAction(action) {
  const m = /^(创建|更新|删除|提交|评审|导入|执行)(.+)$/.exec(action || "");
  if (m) {
    const verb = t(AUDIT_VERB[m[1]]);
    const obj = ENTITY_ZH[m[2]] ? t(ENTITY_ZH[m[2]]) : m[2];
    // 拉丁字母结尾的动词需要补空格（英文），中日文直接拼接
    return verb + (/[A-Za-z]$/.test(verb) ? " " : "") + obj;
  }
  if (action === "RAG 生成用例") return t("audit.generate");
  if (action === "执行用例") return t("audit.execute");
  return action;
}

/* ---------------- 数据访问（后端 / 演示 双模式） ---------------- */
async function apiList(entity, where) {
  if (IS_DEMO) {
    const items = (await DemoAPI.list(ENTITY_DEMO[entity] || entity, where)).items;
    return items;
  }
  const qs = where ? "?" + new URLSearchParams(where).toString() : "";
  const r = await fetch("/api/" + (ENTITY_URL[entity] || entity) + qs);
  if (!r.ok) throw new Error("HTTP " + r.status);
  return (await r.json()).items;
}
async function apiDashboard() {
  if (IS_DEMO) return DemoAPI.dashboard();
  const qs = STATE.projectId ? "?project_id=" + STATE.projectId : "";
  return (await fetch("/api/dashboard" + qs)).json();
}
async function apiCreate(entity, data) {
  if (IS_DEMO) return DemoAPI.create(ENTITY_DEMO[entity] || entity, data);
  const r = await fetch("/api/" + (ENTITY_URL[entity] || entity), {
    method: "POST", headers: { "Content-Type": "application/json", "X-Actor": actorHeader() }, body: JSON.stringify(data)
  });
  return r.json();
}
async function apiUpdate(entity, id, patch) {
  if (IS_DEMO) return DemoAPI.update(ENTITY_DEMO[entity] || entity, id, patch);
  const r = await fetch("/api/" + (ENTITY_URL[entity] || entity) + "/" + id, {
    method: "PATCH", headers: { "Content-Type": "application/json", "X-Actor": actorHeader() }, body: JSON.stringify(patch)
  });
  return r.json();
}
async function apiDelete(entity, id) {
  if (IS_DEMO) return DemoAPI.remove(ENTITY_DEMO[entity] || entity, id);
  const r = await fetch("/api/" + (ENTITY_URL[entity] || entity) + "/" + id, {
    method: "DELETE", headers: { "X-Actor": actorHeader() }
  });
  return r.json();
}
async function apiGenerate(title, text) {
  if (IS_DEMO) return DemoAPI.generate(text, title);
  const r = await fetch("/api/generate", {
    method: "POST", headers: { "Content-Type": "application/json", "X-Actor": actorHeader() },
    body: JSON.stringify({ title, requirement: text })
  });
  return r.json();
}
async function apiExecute(payload) {
  if (IS_DEMO) {
    const ex = await DemoAPI.create("executions", {
      plan_id: payload.plan_id, case_id: payload.case_id, result: payload.result,
      actual: payload.actual, executor: "李伟",
      executed_at: new Date().toLocaleString("sv-CN").slice(0, 16)
    });
    await DemoAPI.update("cases", payload.case_id, { execution_status: payload.result });
    if (payload.result === "fail" && payload.create_defect) {
      const c = (await DemoAPI.get("cases", payload.case_id)) || {};
      await DemoAPI.create("defects", {
        project_id: c.project_id, case_id: payload.case_id,
        title: "执行失败：" + (c.title || payload.case_id), description: payload.actual || "",
        severity: "一般", priority: "高", status: "新建", assignee: "待分配",
        reporter: "李伟", created_at: new Date().toISOString().slice(0, 10), resolved_at: ""
      });
    }
    return ex;
  }
  const r = await fetch("/api/execute", {
    method: "POST", headers: { "Content-Type": "application/json", "X-Actor": actorHeader() }, body: JSON.stringify(payload)
  });
  return r.json();
}
async function apiPlanDetail(id) {
  if (IS_DEMO) return DemoAPI.planDetail(id);
  return (await fetch("/api/plans/" + id + "/detail")).json();
}

/* ---------------- 加载 ---------------- */
async function loadAll() {
  const pid = STATE.projectId || null;
  const where = pid ? { project_id: pid } : null;
  const [projects, requirements, cases, plans, defects, audit, users] = await Promise.all([
    apiList("projects"), apiList("requirements", where), apiList("cases", where),
    apiList("plans", where), apiList("defects", where), apiList("audit"), apiList("users")
  ]);
  STATE.projects = projects; STATE.requirements = requirements; STATE.cases = cases;
  STATE.plans = plans; STATE.defects = defects; STATE.audit = audit; STATE.users = users;
  STATE.dashboard = await apiDashboard();
  if (!STATE.docs.length) {
    STATE.docs = IS_DEMO ? STANDALONE_CORPUS : (await (await fetch("/api/documents")).json()).documents;
  }
}

/* ---------------- i18n 应用 ---------------- */
function applyI18n() {
  $$("[data-i18n]").forEach(el => { el.textContent = t(el.getAttribute("data-i18n")); });
  $$("[data-i18n-ph]").forEach(el => { el.setAttribute("placeholder", t(el.getAttribute("data-i18n-ph"))); });
  renderLangSwitch();
  updateCrumb();
}
function renderLangSwitch() {
  const box = $("#langSwitch");
  if (!box) return;
  box.innerHTML = LANGS.map(l =>
    `<button class="${l.code === LANG ? "on" : ""}" onclick="switchLang('${l.code}')">${l.short}</button>`
  ).join("");
}
function switchLang(code) {
  setLang(code);
  applyI18n();
  render();
}

/* ---------------- 路由 ---------------- */
const VIEW_LABEL = {
  dashboard: "nav.dashboard", projects: "nav.projects", requirements: "nav.requirements",
  cases: "nav.cases", plans: "nav.plans", executions: "nav.executions", defects: "nav.defects",
  generate: "nav.generate", knowledge: "nav.knowledge", reports: "nav.reports",
  audit: "nav.audit", settings: "nav.settings"
};
function updateCrumb() {
  const el = $("#crumbView");
  if (el) el.textContent = t(VIEW_LABEL[STATE.view] || "nav.dashboard");
}
async function switchView(name) {
  STATE.view = name;
  if (location.hash !== "#" + name) history.replaceState(null, "", "#" + name);
  $$(".nav-item").forEach(n => n.classList.toggle("active", n.dataset.view === name));
  updateCrumb();
  closeDrawer(); closeModal();
  await render();
  $("#content").scrollTop = 0;
}
window.addEventListener("hashchange", () => {
  const h = location.hash.replace("#", "");
  if (VIEW_LABEL[h] && h !== STATE.view) switchView(h);
});

async function onProjectChange(pid) {
  STATE.projectId = pid || "";
  await loadAll();
  renderProjectSwitcher();
  await render();
}
function renderProjectSwitcher() {
  const sel = $("#projectSwitcher");
  sel.innerHTML = `<option value="">${t("common.allProjects")}</option>` +
    STATE.projects.map(p => `<option value="${p.id}" ${p.id === STATE.projectId ? "selected" : ""}>${esc(p.name)}</option>`).join("");
}

/* ---------------- 主渲染 ---------------- */
async function render() {
  const c = $("#content");
  const fn = {
    dashboard: viewDashboard, projects: viewProjects, requirements: viewRequirements,
    cases: viewCases, plans: viewPlans, executions: viewExecutions, defects: viewDefects,
    generate: viewGenerate, knowledge: viewKnowledge, reports: viewReports,
    audit: viewAudit, settings: viewSettings
  }[STATE.view] || viewDashboard;
  c.innerHTML = await fn();
  if (STATE.view === "dashboard") drawTrend();
  if (STATE.view === "plans") loadPlanProgress();
}

/* ============================================================
   1. 质量工作台
   ============================================================ */
function viewDashboard() {
  const d = STATE.dashboard;
  if (!d) return `<div class="empty">${t("common.loading")}</div>`;
  const s = d.summary;
  const gateOk = d.gate_passed, gateTotal = d.gates.length;
  const openDefects = STATE.defects.filter(x => x.status !== "已关闭").length;

  let html = `
  <div class="page-head">
    <div><h2>${t("dashboard.title")}</h2><p>${t("dashboard.subtitle")}</p></div>
    <div class="page-actions">
      <button class="btn btn-ghost btn-sm" onclick="refreshAll()">↻ ${t("common.refresh")}</button>
      <button class="btn btn-primary btn-sm" onclick="switchView('generate')">✦ ${t("nav.generate")}</button>
    </div>
  </div>

  <div class="kpi-grid">
    ${kpi(t("dashboard.kpi.projects"), s.projects, "", "ok")}
    ${kpi(t("dashboard.kpi.requirements"), s.requirements, "", "")}
    ${kpi(t("dashboard.kpi.cases"), s.cases, "", "")}
    ${kpi(t("dashboard.kpi.passRate"), s.pass_rate, "%", s.pass_rate >= 95 ? "ok" : s.pass_rate >= 60 ? "warn" : "bad")}
    ${kpi(t("dashboard.kpi.coverage"), s.coverage, "%", s.coverage >= 90 ? "ok" : "warn")}
    ${kpi(t("dashboard.kpi.defects"), openDefects, "", openDefects ? "bad" : "ok")}
  </div>

  <div class="grid-2 mb-14">
    <div class="panel">
      <div class="panel-head"><h3>${t("dashboard.gates")}</h3><span class="panel-hint">${gateOk}/${gateTotal} ${t("dashboard.pass")}</span></div>
      <div class="gate-list">${d.gates.map(gateHtml).join("")}</div>
    </div>
    <div class="panel">
      <div class="panel-head"><h3>${t("dashboard.caseResult")}</h3><span class="panel-hint">${t("dashboard.caseResult.hint")}</span></div>
      ${donutHtml(d.case_results)}
    </div>
  </div>

  <div class="grid-2 mb-14">
    <div class="panel">
      <div class="panel-head"><h3>${t("dashboard.trend")}</h3><span class="panel-hint">${t("dashboard.trend.hint")}</span></div>
      <div id="trendBox"></div>
      <div class="trend-legend"><span><i style="background:var(--green)"></i>${t("enum.exec.pass")}</span><span><i style="background:var(--red)"></i>${t("enum.exec.fail")}</span></div>
    </div>
    <div class="panel">
      <div class="panel-head"><h3>${t("dashboard.defectSeverity")}</h3><span class="panel-hint">${t("dashboard.defectSeverity.hint")}</span></div>
      ${severityBars(d.defect_severity)}
    </div>
  </div>

  <div class="grid-2">
    <div class="panel">
      <div class="panel-head"><h3>${t("dashboard.health")}</h3><span class="panel-link" onclick="switchView('projects')">${t("common.viewAll")} →</span></div>
      <div class="table-wrap"><table class="data" style="min-width:auto">
        <thead><tr><th>${t("common.project")}</th><th>${t("dashboard.kpi.cases")}</th><th>${t("dashboard.kpi.passRate")}</th><th>${t("dashboard.kpi.defects")}</th></tr></thead>
        <tbody>${STATE.projects.filter(p => !STATE.projectId || p.id === STATE.projectId).map(p => projectHealthRow(p)).join("")}</tbody>
      </table></div>
    </div>
    <div class="panel">
      <div class="panel-head"><h3>${t("dashboard.recent")}</h3><span class="panel-link" onclick="switchView('audit')">${t("common.viewAll")} →</span></div>
      <div style="display:flex;flex-direction:column;gap:9px">
        ${(d.recent_audit || []).slice(0, 6).map(a => `
          <div style="display:flex;gap:9px;font-size:11.5px;line-height:1.5">
            <span style="color:var(--faint);font-family:var(--font-mono);flex:0 0 86px">${esc((a.timestamp || "").slice(5))}</span>
            <span><b style="color:var(--text)">${esc(a.actor)}</b> <span style="color:var(--muted)">${esc(auditAction(a.action))}</span>
            <span style="color:var(--faint)">${esc(a.entity)}</span></span>
          </div>`).join("") || `<div class="empty" style="padding:20px">${t("common.noData")}</div>`}
      </div>
    </div>
  </div>`;
  return html;
}
function kpi(label, value, unit, cls) {
  return `<div class="kpi ${cls || ""}"><div class="kpi-label">${label}</div>
    <div class="kpi-value">${value}${unit ? `<small>${unit}</small>` : ""}</div></div>`;
}
function gateHtml(g) {
  const color = g.passed ? "var(--green)" : "var(--red)";
  const w = Math.min(100, g.target ? (g.value / g.target) * 100 : 100);
  const k = "gate." + (g.key || "");
  const name = g.key && t(k) !== k ? t(k) : g.name;
  const unit = g.unit === "个" ? t("dashboard.unit.count") : g.unit;
  return `<div class="gate">
    <div class="gate-ico ${g.passed ? "ok" : "no"}">${g.passed ? "✓" : "!"}</div>
    <div class="gate-main">
      <div class="gate-top"><b>${esc(name)}</b><span>${g.value}${unit} / ${t("dashboard.target")} ${g.target}${unit}</span></div>
      <div class="gate-track"><div class="gate-fill" style="width:${w}%;background:${color}"></div></div>
    </div>
  </div>`;
}
function donutHtml(obj) {
  const entries = [
    ["pass", "var(--green)"], ["fail", "var(--red)"], ["blocked", "var(--amber)"], ["untested", "var(--faint)"]
  ].map(([k, c]) => [k, obj[k] || 0, c]).filter(x => x[1] > 0);
  const total = entries.reduce((s, x) => s + x[1], 0) || 1;
  let acc = 0;
  const stops = entries.map(([k, v, c]) => {
    const from = (acc / total) * 360; acc += v; const to = (acc / total) * 360;
    return `${c} ${from}deg ${to}deg`;
  }).join(",");
  const passRate = Math.round(((obj.pass || 0) / total) * 100);
  return `<div class="donut-wrap">
    <div class="donut" style="background:conic-gradient(${stops || "var(--line) 0deg 360deg"})">
      <div class="donut-center"><b>${passRate}%</b><small>${t("enum.exec.pass")}</small></div>
    </div>
    <div class="legend">
      ${[["pass", "var(--green)"], ["fail", "var(--red)"], ["blocked", "var(--amber)"], ["untested", "var(--faint)"]].map(([k, c]) => `
        <div class="legend-item"><span class="legend-dot" style="background:${c}"></span>${t("enum.exec." + k)}<b>${obj[k] || 0}</b></div>`).join("")}
    </div>
  </div>`;
}
function barsHtml(obj, color) {
  const keys = Object.keys(obj || {});
  if (!keys.length) return `<div class="empty" style="padding:20px">${t("common.noData")}</div>`;
  const max = Math.max(...keys.map(k => obj[k]), 1);
  return `<div class="bars">${keys.map(k => `
    <div class="bar-row"><div class="bar-label">${esc(k)}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${obj[k] / max * 100}%;background:${color || ""}"></div></div>
      <div class="bar-val">${obj[k]}</div></div>`).join("")}</div>`;
}
function severityBars(obj) {
  const colorMap = { "致命": "var(--red)", "严重": "#fb923c", "一般": "var(--amber)", "轻微": "var(--faint)" };
  let keys = Object.keys(obj || {});
  if (!keys.length) return `<div class="empty" style="padding:20px">${t("common.noData")}</div>`;
  keys.sort((a, b) => {
    const ia = SEV_ORDER.indexOf(a), ib = SEV_ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  const max = Math.max(...keys.map(k => obj[k]), 1);
  return `<div class="bars">${keys.map(k => `
    <div class="bar-row"><div class="bar-label">${esc(sevText(k))}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${obj[k] / max * 100}%;background:${colorMap[k] || "var(--accent)"}"></div></div>
      <div class="bar-val">${obj[k]}</div></div>`).join("")}</div>`;
}
function projectHealthRow(p) {
  const cases = STATE.cases.filter(c => c.project_id === p.id);
  const defects = STATE.defects.filter(d => d.project_id === p.id && d.status !== "已关闭");
  const done = cases.filter(c => c.execution_status !== "untested").length;
  const pass = cases.filter(c => c.execution_status === "pass").length;
  const rate = done ? Math.round(pass / done * 100) : 0;
  return `<tr>
    <td><div style="font-weight:600">${esc(p.name)}</div><div class="td-muted">${esc(p.code)}</div></td>
    <td class="td-muted">${cases.length}</td>
    <td><span class="badge ${rate >= 80 ? "green" : rate >= 50 ? "amber" : "red"}">${rate}%</span></td>
    <td><span class="badge ${defects.length ? "red" : "green"}">${defects.length}</span></td>
  </tr>`;
}
function drawTrend() {
  const box = $("#trendBox");
  if (!box || !STATE.dashboard) return;
  const trend = STATE.dashboard.trend || [];
  if (!trend.length) { box.innerHTML = `<div class="empty" style="padding:20px">${t("common.noData")}</div>`; return; }
  const W = 560, H = 150, PAD = 24;
  const maxV = Math.max(...trend.map(x => Math.max(x.pass || 0, x.fail || 0)), 1);
  const stepX = trend.length > 1 ? (W - PAD * 2) / (trend.length - 1) : 0;
  const pt = (i, v) => [PAD + i * stepX, H - PAD - (v / maxV) * (H - PAD * 2)];
  const line = (key, color) => {
    const pts = trend.map((x, i) => pt(i, x[key] || 0));
    const d = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
    const area = d + ` L${pts[pts.length - 1][0].toFixed(1)} ${H - PAD} L${pts[0][0].toFixed(1)} ${H - PAD} Z`;
    return `<path d="${area}" fill="${color}" opacity=".10"/>
      <path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      ${pts.map(p => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="2.6" fill="${color}"/>`).join("")}`;
  };
  box.innerHTML = `<svg class="trend-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    ${[0, .25, .5, .75, 1].map(f => `<line x1="${PAD}" x2="${W - PAD}" y1="${PAD + f * (H - PAD * 2)}" y2="${PAD + f * (H - PAD * 2)}" stroke="rgba(148,163,184,.10)" stroke-width="1"/>`).join("")}
    ${line("pass", "#34d399")}
    ${line("fail", "#f87171")}
    ${trend.map((x, i) => `<text x="${pt(i, 0)[0]}" y="${H - 6}" fill="#5d6b80" font-size="9" text-anchor="middle">${esc((x.date || "").slice(5))}</text>`).join("")}
  </svg>`;
}

/* ============================================================
   2. 项目管理
   ============================================================ */
function viewProjects() {
  return `
  <div class="page-head">
    <div><h2>${t("projects.title")}</h2><p>${t("projects.subtitle")}</p></div>
    <div class="page-actions"><button class="btn btn-primary btn-sm" onclick="openProjectModal()">＋ ${t("projects.new")}</button></div>
  </div>
  <div class="proj-grid">
    ${STATE.projects.map(p => {
      const cs = STATE.cases.filter(c => c.project_id === p.id);
      const ds = STATE.defects.filter(d => d.project_id === p.id);
      const rs = STATE.requirements.filter(r => r.project_id === p.id);
      const done = cs.filter(c => c.execution_status !== "untested").length;
      const pass = cs.filter(c => c.execution_status === "pass").length;
      const rate = done ? Math.round(pass / done * 100) : 0;
      return `<div class="proj-card">
        <div class="proj-top">
          <span class="proj-code">${esc(p.code)}</span>
          <span class="badge ${p.priority === "P0" ? "red" : "blue"}">${esc(p.priority || "")}</span>
          <span class="badge gray" style="margin-left:auto">${esc(p.owner || "")}</span>
        </div>
        <div class="proj-name">${esc(p.name)}</div>
        <div class="proj-desc">${esc(p.description || "")}</div>
        <div class="plan-bar">
          <i style="width:${rate}%;background:var(--green)"></i>
        </div>
        <div class="proj-metrics">
          <div>${t("dashboard.kpi.requirements")}<b>${rs.length}</b></div>
          <div>${t("dashboard.kpi.cases")}<b>${cs.length}</b></div>
          <div>${t("dashboard.kpi.passRate")}<b>${rate}%</b></div>
          <div>${t("dashboard.kpi.defects")}<b>${ds.filter(d => d.status !== "已关闭").length}</b></div>
        </div>
        <div style="margin-top:12px;display:flex;gap:6px">
          <button class="btn btn-ghost btn-sm" onclick="filterToProject('${p.id}')">${t("common.detail")}</button>
          <button class="btn btn-ghost btn-sm" onclick="openProjectModal('${p.id}')">${t("common.edit")}</button>
          <button class="btn btn-danger btn-sm" onclick="delProject('${p.id}')">${t("common.delete")}</button>
        </div>
      </div>`;
    }).join("")}
  </div>`;
}
function filterToProject(pid) { onProjectChange(pid); }
function openProjectModal(id) {
  const p = STATE.projects.find(x => x.id === id) || {};
  openModal(id ? t("common.edit") : t("projects.new"), `
    <div class="field-row">
      <div class="field"><label>${t("projects.code")}</label><input class="input" id="f_code" value="${esc(p.code || "")}" placeholder="MALL"></div>
      <div class="field"><label>${t("common.priority")}</label>
        <select class="select" id="f_priority">${["P0", "P1", "P2"].map(v => `<option ${v === (p.priority || "P1") ? "selected" : ""}>${v}</option>`).join("")}</select></div>
    </div>
    <div class="field"><label>${t("common.name")}</label><input class="input" id="f_name" value="${esc(p.name || "")}"></div>
    <div class="field"><label>${t("common.description")}</label><textarea class="textarea" id="f_desc" rows="3">${esc(p.description || "")}</textarea></div>
    <div class="field-row">
      <div class="field"><label>${t("common.owner")}</label><input class="input" id="f_owner" value="${esc(p.owner || "")}"></div>
      <div class="field"><label>${t("common.status")}</label>
        <select class="select" id="f_status">${["active", "paused", "closed"].map(v => `<option ${v === (p.status || "active") ? "selected" : ""}>${v}</option>`).join("")}</select></div>
    </div>`,
    async () => {
      const data = {
        code: $("#f_code").value.trim(), name: $("#f_name").value.trim(),
        description: $("#f_desc").value.trim(), priority: $("#f_priority").value,
        owner: $("#f_owner").value.trim(), status: $("#f_status").value,
        created_at: p.created_at || new Date().toISOString().slice(0, 10)
      };
      if (!data.name) { toast("名称不能为空", "err"); return; }
      if (id) await apiUpdate("projects", id, data); else await apiCreate("projects", data);
      closeModal(); await refreshAll(); toast(t("common.success"));
    });
}
async function delProject(id) {
  if (!confirm(t("common.confirmDelete"))) return;
  await apiDelete("projects", id);
  if (STATE.projectId === id) STATE.projectId = "";
  await refreshAll(); toast(t("common.success"));
}

/* ============================================================
   3. 需求管理
   ============================================================ */
function viewRequirements() {
  return `
  <div class="page-head">
    <div><h2>${t("req.title")}</h2><p>${t("req.subtitle")}</p></div>
    <div class="page-actions"><button class="btn btn-primary btn-sm" onclick="openReqModal()">＋ ${t("req.new")}</button></div>
  </div>
  <div class="table-wrap"><table class="data">
    <thead><tr>
      <th>${t("req.code")}</th><th>${t("common.name")}</th><th>${t("common.project")}</th>
      <th>${t("common.priority")}</th><th>${t("common.status")}</th><th>${t("cases.reqTrace")}</th>
      <th>${t("req.source")}</th><th>${t("common.actions")}</th>
    </tr></thead>
    <tbody>${STATE.requirements.map(r => {
      const cs = STATE.cases.filter(c => c.requirement_id === r.id);
      const proj = STATE.projects.find(p => p.id === r.project_id);
      return `<tr>
        <td class="td-id">${esc(r.code)}</td>
        <td class="td-title"><div class="cell-clip" style="max-width:340px">
            <div style="font-weight:600;overflow:hidden;text-overflow:ellipsis">${esc(r.title)}</div>
            <div class="td-muted" style="overflow:hidden;text-overflow:ellipsis">${esc(r.description || "")}</div>
          </div></td>
        <td class="td-muted">${esc(proj ? proj.name : "—")}</td>
        <td>${badgePriority(r.priority)}</td>
        <td><span class="badge ${r.status === "已评审" ? "green" : "amber"}">${esc(r.status)}</span></td>
        <td><span class="badge ${cs.length ? "cyan" : "gray"}">${cs.length} ${t("common.items")}</span></td>
        <td class="td-muted">${esc(r.source || "—")}</td>
        <td><div class="td-actions">
          <button class="btn btn-ghost btn-sm" onclick="genForReq('${r.id}')">✦ ${t("req.genCases")}</button>
          <button class="btn btn-ghost btn-sm" onclick="openReqModal('${r.id}')">${t("common.edit")}</button>
          <button class="btn btn-danger btn-sm" onclick="delEntity('requirements','${r.id}')">✕</button>
        </div></td>
      </tr>`;
    }).join("") || emptyRow(8)}</tbody>
  </table></div>`;
}
function genForReq(id) {
  const r = STATE.requirements.find(x => x.id === id);
  if (!r) return;
  STATE.gen.title = r.title;
  STATE.gen.text = r.description || "";
  STATE.gen.result = null; STATE.gen.evidence = null;
  switchView("generate");
}
function openReqModal(id) {
  const r = STATE.requirements.find(x => x.id === id) || {};
  openModal(id ? t("common.edit") : t("req.new"), `
    <div class="field-row">
      <div class="field"><label>${t("req.code")}</label><input class="input" id="f_code" value="${esc(r.code || "")}" placeholder="REQ-XXX-01"></div>
      <div class="field"><label>${t("common.project")}</label>
        <select class="select" id="f_pid">${STATE.projects.map(p => `<option value="${p.id}" ${p.id === r.project_id ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select></div>
    </div>
    <div class="field"><label>${t("common.name")}</label><input class="input" id="f_title" value="${esc(r.title || "")}"></div>
    <div class="field"><label>${t("common.description")}</label><textarea class="textarea" id="f_desc" rows="5">${esc(r.description || "")}</textarea></div>
    <div class="field-row">
      <div class="field"><label>${t("common.priority")}</label>
        <select class="select" id="f_priority">${["高", "中", "低"].map(v => `<option ${v === (r.priority || "中") ? "selected" : ""}>${v}</option>`).join("")}</select></div>
      <div class="field"><label>${t("common.status")}</label>
        <select class="select" id="f_status">${["待评审", "已评审", "已上线"].map(v => `<option ${v === (r.status || "待评审") ? "selected" : ""}>${v}</option>`).join("")}</select></div>
    </div>
    <div class="field"><label>${t("req.source")}</label><input class="input" id="f_source" value="${esc(r.source || "")}" placeholder="PRD v1.0"></div>`,
    async () => {
      const data = {
        code: $("#f_code").value.trim(), title: $("#f_title").value.trim(),
        project_id: $("#f_pid").value, description: $("#f_desc").value.trim(),
        priority: $("#f_priority").value, status: $("#f_status").value, source: $("#f_source").value.trim(),
        created_at: r.created_at || new Date().toISOString().slice(0, 10)
      };
      if (!data.title || !data.code) { toast("编号与名称不能为空", "err"); return; }
      if (id) await apiUpdate("requirements", id, data); else await apiCreate("requirements", data);
      closeModal(); await refreshAll(); toast(t("common.success"));
    });
}

/* ============================================================
   4. 用例库
   ============================================================ */
function viewCases() {
  const f = STATE.filters.cases;
  let list = STATE.cases.slice();
  if (f.review) list = list.filter(c => c.review_status === f.review);
  if (f.exec) list = list.filter(c => c.execution_status === f.exec);
  if (f.type) list = list.filter(c => c.type === f.type);
  if (STATE.search) {
    const kw = STATE.search.toLowerCase();
    list = list.filter(c => (c.title + c.id + (c.requirement_code || "")).toLowerCase().includes(kw));
  }
  const types = [...new Set(STATE.cases.map(c => c.type))];
  return `
  <div class="page-head">
    <div><h2>${t("cases.title")}</h2><p>${t("cases.subtitle")} · ${t("common.total")} ${list.length} ${t("common.items")}</p></div>
    <div class="page-actions">
      <button class="btn btn-ghost btn-sm" onclick="exportCasesCsv()">⇩ ${t("common.exportCsv")}</button>
      <button class="btn btn-primary btn-sm" onclick="openCaseModal()">＋ ${t("cases.new")}</button>
    </div>
  </div>
  <div class="toolbar">
    <select class="select" onchange="setCaseFilter('review',this.value)">
      <option value="">${t("cases.review")}: ${t("common.all")}</option>
      ${["draft", "reviewed", "approved"].map(v => `<option value="${v}" ${f.review === v ? "selected" : ""}>${t("enum.review." + v)}</option>`).join("")}
    </select>
    <select class="select" onchange="setCaseFilter('exec',this.value)">
      <option value="">${t("cases.exec")}: ${t("common.all")}</option>
      ${["untested", "pass", "fail", "blocked"].map(v => `<option value="${v}" ${f.exec === v ? "selected" : ""}>${t("enum.exec." + v)}</option>`).join("")}
    </select>
    <select class="select" onchange="setCaseFilter('type',this.value)">
      <option value="">${t("cases.type")}: ${t("common.all")}</option>
      ${types.map(v => `<option value="${v}" ${f.type === v ? "selected" : ""}>${esc(v)}</option>`).join("")}
    </select>
    <input class="input search" id="searchInput" placeholder="${t("common.search")}…" value="${esc(STATE.search)}" oninput="onSearch(this.value)">
  </div>
  <div class="table-wrap"><table class="data">
    <thead><tr>
      <th>${t("cases.id")}</th><th>${t("cases.titleCol")}</th><th>${t("common.requirement")}</th>
      <th>${t("cases.type")}</th><th>${t("common.priority")}</th>
      <th>${t("cases.review")}</th><th>${t("cases.exec")}</th><th>${t("common.actions")}</th>
    </tr></thead>
    <tbody>${list.map(c => `<tr>
      <td class="td-id">${esc(c.id)}</td>
      <td class="td-title"><div class="cell-clip"><span class="link" onclick="openCaseDetail('${c.id}')">${esc(c.title)}</span>
        ${c.needs_review ? `<span class="badge amber" style="margin-left:6px">${t("cases.needsReview")}</span>` : ""}</div></td>
      <td class="td-muted" style="white-space:nowrap">${esc(c.requirement_code || "—")}</td>
      <td class="td-muted">${esc(c.type)}</td>
      <td>${badgePriority(c.priority)}</td>
      <td>${badgeReview(c.review_status)}</td>
      <td>${badgeExec(c.execution_status)}</td>
      <td><div class="td-actions">
        <button class="btn btn-ghost btn-sm" onclick="openCaseDetail('${c.id}')">${t("common.detail")}</button>
        <button class="btn btn-ghost btn-sm" onclick="openExecuteModal('${c.id}')">▷</button>
      </div></td>
    </tr>`).join("") || emptyRow(8)}</tbody>
  </table></div>`;
}
function setCaseFilter(k, v) { STATE.filters.cases[k] = v; render(); }
function onSearch(v) {
  STATE.search = v;
  if (STATE.view === "cases" || STATE.view === "knowledge") {
    render().then(() => {
      const el = document.getElementById("searchInput");
      if (el) { el.focus(); const n = el.value.length; el.setSelectionRange(n, n); }
    });
  }
}
function openCaseDetail(id) {
  const c = STATE.cases.find(x => x.id === id);
  if (!c) return;
  const cites = (c.citations || []).map(x => `
    <div class="ev-item" style="margin-bottom:8px">
      <div class="ev-top"><span class="ev-id">${esc(x.id)} · ${esc(x.title)}</span></div>
      <div class="ev-content" style="max-height:none">${esc(x.content)}</div>
    </div>`).join("");
  openDrawer(`${c.id} · ${t("common.detail")}`, `
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">
      ${badgeReview(c.review_status)} ${badgeExec(c.execution_status)} ${badgePriority(c.priority)}
      <span class="badge purple">${esc(c.type)}</span>
      ${c.needs_review ? `<span class="badge amber">${t("cases.needsReview")}</span>` : ""}
    </div>
    <h3 style="font-size:16px;margin-bottom:14px;line-height:1.5">${esc(c.title)}</h3>
    <div class="field"><label>${t("cases.precondition")}</label><div class="case-field">${esc(c.precondition || "—")}</div></div>
    <div class="field"><label>${t("cases.steps")}</label><div class="case-field"><ol>${(c.steps || []).map(s => `<li>${esc(s)}</li>`).join("")}</ol></div></div>
    <div class="field"><label>${t("cases.expected")}</label><div class="case-field">${esc(c.expected || "—")}</div></div>
    <div class="field-row">
      <div class="field"><label>${t("common.project")}</label><div class="case-field">${esc((STATE.projects.find(p => p.id === c.project_id) || {}).name || "—")}</div></div>
      <div class="field"><label>${t("common.requirement")}</label><div class="case-field">${esc(c.requirement_code || "—")}</div></div>
    </div>
    <div class="field"><label>${t("cases.confidence")}</label>
      <div class="gate-track" style="height:6px"><div class="gate-fill" style="width:${(c.confidence || 0) * 100}%;background:${(c.confidence || 0) >= .7 ? "var(--green)" : "var(--amber)"}"></div></div>
      <div class="td-muted" style="margin-top:4px">${Math.round((c.confidence || 0) * 100)}%</div></div>
    <div class="field"><label>${t("cases.citations")}</label>${cites || `<div class="td-muted">—</div>`}</div>
    <div style="display:flex;gap:8px;margin-top:18px;flex-wrap:wrap">
      ${c.review_status !== "approved" ? `<button class="btn btn-primary btn-sm" onclick="reviewCase('${c.id}','approved')">✓ ${t("cases.reviewAction")}</button>` : ""}
      ${c.review_status !== "draft" ? `<button class="btn btn-ghost btn-sm" onclick="reviewCase('${c.id}','draft')">↺ ${t("cases.rejectAction")}</button>` : ""}
      <button class="btn btn-ghost btn-sm" onclick="openExecuteModal('${c.id}')">▷ ${t("cases.executeAction")}</button>
      <button class="btn btn-danger btn-sm" onclick="delEntity('cases','${c.id}')">${t("common.delete")}</button>
    </div>`);
}
async function reviewCase(id, status) {
  await apiUpdate("cases", id, { review_status: status, needs_review: false });
  closeDrawer(); await refreshAll(); toast(t("common.success"));
}
function openCaseModal() {
  openModal(t("cases.new"), `
    <div class="field"><label>${t("cases.titleCol")}</label><input class="input" id="f_title"></div>
    <div class="field-row">
      <div class="field"><label>${t("common.project")}</label>
        <select class="select" id="f_pid">${STATE.projects.map(p => `<option value="${p.id}" ${p.id === STATE.projectId ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select></div>
      <div class="field"><label>${t("common.requirement")}</label>
        <select class="select" id="f_rid"><option value="">—</option>${STATE.requirements.map(r => `<option value="${r.id}">${esc(r.code + " " + r.title)}</option>`).join("")}</select></div>
    </div>
    <div class="field-row">
      <div class="field"><label>${t("cases.type")}</label>
        <select class="select" id="f_type">${["positive", "negative", "boundary", "validation", "security", "business", "idempotency", "performance", "consistency"].map(v => `<option>${v}</option>`).join("")}</select></div>
      <div class="field"><label>${t("common.priority")}</label>
        <select class="select" id="f_priority">${["高", "中", "低"].map(v => `<option ${v === "中" ? "selected" : ""}>${v}</option>`).join("")}</select></div>
    </div>
    <div class="field"><label>${t("cases.precondition")}</label><input class="input" id="f_pre"></div>
    <div class="field"><label>${t("cases.steps")}（${t("commaSeparated") === "commaSeparated" ? "每行一步" : ""}）</label><textarea class="textarea" id="f_steps" rows="4"></textarea></div>
    <div class="field"><label>${t("cases.expected")}</label><textarea class="textarea" id="f_exp" rows="2"></textarea></div>`,
    async () => {
      const title = $("#f_title").value.trim();
      if (!title) { toast("标题不能为空", "err"); return; }
      await apiCreate("cases", {
        title, project_id: $("#f_pid").value, requirement_id: $("#f_rid").value || null,
        type: $("#f_type").value, priority: $("#f_priority").value,
        precondition: $("#f_pre").value.trim(),
        steps: $("#f_steps").value.split("\n").map(s => s.trim()).filter(Boolean),
        expected: $("#f_exp").value.trim(), confidence: 1.0, citations: [],
        needs_review: false, review_status: "draft", execution_status: "untested",
        assignee: "—", created_at: new Date().toISOString().slice(0, 10)
      });
      closeModal(); await refreshAll(); toast(t("common.success"));
    });
}

/* ============================================================
   5. 测试计划
   ============================================================ */
function viewPlans() {
  return `
  <div class="page-head">
    <div><h2>${t("plans.title")}</h2><p>${t("plans.subtitle")}</p></div>
    <div class="page-actions"><button class="btn btn-primary btn-sm" onclick="openPlanModal()">＋ ${t("plans.new")}</button></div>
  </div>
  <div class="grid-3">
    ${STATE.plans.map(p => {
      const pid = p.id;
      return `<div class="plan-card">
        <div class="plan-top">
          <div><div class="plan-name">${esc(p.name)}</div>
          <div class="td-muted" style="font-size:11px">${esc(p.owner || "")} · ${esc(p.start_date || "")} ~ ${esc(p.end_date || "")}</div></div>
          <span class="badge ${p.status === "执行中" ? "blue" : p.status === "已完成" ? "green" : "gray"}">${esc(p.status)}</span>
        </div>
        <div class="plan-desc">${esc(p.description || "")}</div>
        <div id="planprog-${pid}"><div class="td-muted" style="font-size:11px">${t("common.loading")}</div></div>
        <div style="margin-top:12px;display:flex;gap:6px">
          <button class="btn btn-ghost btn-sm" onclick="openPlanDetail('${pid}')">${t("plans.open")}</button>
          <button class="btn btn-danger btn-sm" onclick="delEntity('plans','${pid}')">✕</button>
        </div>
      </div>`;
    }).join("") || `<div class="empty">${t("common.noData")}</div>`}
  </div>`;
}
async function loadPlanProgress() {
  for (const p of STATE.plans) {
    const box = document.getElementById("planprog-" + p.id);
    if (!box) continue;
    try {
      const d = await apiPlanDetail(p.id);
      const pr = d.progress || {};
      box.innerHTML = `
        <div class="plan-bar">
          <i style="width:${pr.pass_rate || 0}%;background:var(--green)"></i>
          <i style="width:${(pr.progress || 0) - (pr.pass_rate || 0)}%;background:var(--amber)"></i>
        </div>
        <div class="plan-stats">
          <span>${t("common.progress")} <b>${pr.progress || 0}%</b></span>
          <span>${t("enum.exec.pass")} <b>${pr.pass || 0}</b></span>
          <span>${t("enum.exec.fail")} <b>${pr.fail || 0}</b></span>
          <span>${t("enum.exec.untested")} <b>${pr.not_run || 0}</b></span>
        </div>`;
    } catch (e) { box.innerHTML = ""; }
  }
}
async function openPlanDetail(id) {
  const d = await apiPlanDetail(id);
  if (!d) return;
  const pr = d.progress || {};
  openDrawer(d.name, `
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">
      <span class="badge blue">${esc(d.status)}</span>
      <span class="badge gray">${esc(d.owner || "")}</span>
      <span class="badge gray">${esc(d.start_date || "")} ~ ${esc(d.end_date || "")}</span>
    </div>
    <p class="td-muted" style="margin-bottom:16px;line-height:1.7">${esc(d.description || "")}</p>
    <div class="kpi-grid" style="grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:16px">
      <div class="kpi" style="padding:10px"><div class="kpi-label">${t("plans.cases")}</div><div class="kpi-value" style="font-size:19px">${pr.total || 0}</div></div>
      <div class="kpi ok" style="padding:10px"><div class="kpi-label">${t("enum.exec.pass")}</div><div class="kpi-value" style="font-size:19px">${pr.pass || 0}</div></div>
      <div class="kpi bad" style="padding:10px"><div class="kpi-label">${t("enum.exec.fail")}</div><div class="kpi-value" style="font-size:19px">${pr.fail || 0}</div></div>
      <div class="kpi" style="padding:10px"><div class="kpi-label">${t("enum.exec.untested")}</div><div class="kpi-value" style="font-size:19px">${pr.not_run || 0}</div></div>
    </div>
    <div class="panel-head"><h3 style="font-size:12.5px">${t("plans.cases")}</h3></div>
    <div class="table-wrap"><table class="data" style="min-width:auto">
      <thead><tr><th>ID</th><th>${t("cases.titleCol")}</th><th>${t("cases.exec")}</th></tr></thead>
      <tbody>${(d.cases || []).map(c => `<tr>
        <td class="td-id">${esc(c.id)}</td>
        <td style="font-size:12px">${esc(c.title)}</td>
        <td>${badgeExec(c.execution_status)}</td>
      </tr>`).join("")}</tbody>
    </table></div>
    <div class="panel-head" style="margin-top:18px"><h3 style="font-size:12.5px">${t("exec.recent")}</h3></div>
    <div style="display:flex;flex-direction:column;gap:8px">
      ${(d.executions || []).slice(0, 8).map(e => `<div style="display:flex;gap:8px;align-items:center;font-size:11.5px">
        ${badgeExec(e.result)}<span class="td-id">${esc(e.case_id)}</span>
        <span class="td-muted" style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(e.actual || "")}</span>
        <span class="td-muted">${esc(e.executor)}</span>
      </div>`).join("") || `<div class="td-muted">${t("common.noData")}</div>`}
    </div>`);
}
function openPlanModal() {
  openModal(t("plans.new"), `
    <div class="field"><label>${t("common.name")}</label><input class="input" id="f_name"></div>
    <div class="field"><label>${t("common.project")}</label>
      <select class="select" id="f_pid">${STATE.projects.map(p => `<option value="${p.id}" ${p.id === STATE.projectId ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select></div>
    <div class="field"><label>${t("common.description")}</label><textarea class="textarea" id="f_desc" rows="2"></textarea></div>
    <div class="field-row">
      <div class="field"><label>${t("plans.range")} (${t("common.back")})</label><input class="input" type="date" id="f_start"></div>
      <div class="field"><label>&nbsp;</label><input class="input" type="date" id="f_end"></div>
    </div>
    <div class="field"><label>${t("common.owner")}</label><input class="input" id="f_owner" value="李伟"></div>`,
    async () => {
      const name = $("#f_name").value.trim();
      if (!name) { toast("名称不能为空", "err"); return; }
      const plan = await apiCreate("plans", {
        name, project_id: $("#f_pid").value, description: $("#f_desc").value.trim(),
        start_date: $("#f_start").value, end_date: $("#f_end").value,
        status: "待执行", owner: $("#f_owner").value.trim()
      });
      // 自动纳入该项目下已通过评审的用例
      closeModal(); await refreshAll(); toast(t("common.success"));
    });
}

/* ============================================================
   6. 测试执行
   ============================================================ */
async function viewExecutions() {
  let execs = [];
  try {
    execs = IS_DEMO ? (await DemoAPI.list("executions")).items : (await (await fetch("/api/executions")).json()).items;
  } catch (e) { execs = []; }
  execs.sort((a, b) => (b.executed_at || "").localeCompare(a.executed_at || ""));
  const pending = STATE.cases.filter(c => c.execution_status === "untested");
  return `
  <div class="page-head">
    <div><h2>${t("exec.title")}</h2><p>${t("exec.subtitle")}</p></div>
  </div>
  <div class="grid-2">
    <div class="panel">
      <div class="panel-head"><h3>${t("exec.recent")}</h3><span class="panel-hint">${execs.length} ${t("common.items")}</span></div>
      <div class="table-wrap"><table class="data" style="min-width:auto">
        <thead><tr><th>${t("cases.id")}</th><th>${t("common.status")}</th><th>${t("exec.actual")}</th><th>${t("exec.tester")}</th><th>${t("exec.time")}</th></tr></thead>
        <tbody>${execs.slice(0, 20).map(e => {
          const c = STATE.cases.find(x => x.id === e.case_id) || {};
          return `<tr>
            <td class="td-id">${esc(e.case_id)}</td>
            <td>${badgeExec(e.result)}</td>
            <td class="td-muted" style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(e.actual || c.title || "")}</td>
            <td class="td-muted">${esc(e.executor || "")}</td>
            <td class="td-muted" style="font-size:10.5px;font-family:var(--font-mono)">${esc(e.executed_at || "")}</td>
          </tr>`;
        }).join("") || emptyRow(5)}</tbody>
      </table></div>
    </div>
    <div class="panel">
      <div class="panel-head"><h3>${t("enum.exec.untested")}</h3><span class="panel-hint">${pending.length} ${t("common.items")}</span></div>
      <div style="display:flex;flex-direction:column;gap:8px;max-height:520px;overflow-y:auto">
        ${pending.map(c => `
          <div style="background:var(--panel-2);border:1px solid var(--line);border-radius:8px;padding:10px;display:flex;gap:9px;align-items:center">
            <span class="td-id">${esc(c.id)}</span>
            <span style="flex:1;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(c.title)}</span>
            <button class="btn btn-primary btn-sm" onclick="openExecuteModal('${c.id}')">${t("exec.record")}</button>
          </div>`).join("") || `<div class="empty">${t("common.noData")}</div>`}
      </div>
    </div>
  </div>`;
}
function openExecuteModal(caseId) {
  const c = STATE.cases.find(x => x.id === caseId);
  if (!c) return;
  const plans = STATE.plans;
  openModal(t("exec.record") + " · " + c.id, `
    <div class="case-field" style="margin-bottom:13px"><b>${esc(c.title)}</b><div class="td-muted" style="margin-top:4px">${esc(c.expected || "")}</div></div>
    <div class="field"><label>${t("common.status")}</label>
      <select class="select" id="f_result">
        <option value="pass">${t("enum.exec.pass")}</option>
        <option value="fail">${t("enum.exec.fail")}</option>
        <option value="blocked">${t("enum.exec.blocked")}</option>
      </select></div>
    <div class="field"><label>${t("exec.actual")}</label><textarea class="textarea" id="f_actual" rows="3" placeholder="记录实际结果…"></textarea></div>
    <div class="field"><label>${t("plans.title")}</label>
      <select class="select" id="f_plan"><option value="">—</option>${plans.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join("")}</select></div>
    <div class="field"><label style="display:flex;align-items:center;gap:7px;cursor:pointer">
      <input type="checkbox" id="f_defect" style="width:auto"> ${t("exec.createDefect")}</label></div>`,
    async () => {
      const result = $("#f_result").value;
      await apiExecute({
        case_id: caseId, plan_id: $("#f_plan").value || null, result,
        actual: $("#f_actual").value.trim(), create_defect: $("#f_defect").checked,
        defect_title: "执行失败：" + c.title
      });
      closeModal(); await refreshAll(); toast(t("common.success"));
    });
}

/* ============================================================
   7. 缺陷管理
   ============================================================ */
function viewDefects() {
  const cols = ["新建", "已修复待验证", "重新打开", "已关闭"];
  const colors = { "新建": "var(--red)", "已修复待验证": "var(--blue)", "重新打开": "var(--amber)", "已关闭": "var(--green)" };
  return `
  <div class="page-head">
    <div><h2>${t("defects.title")}</h2><p>${t("defects.subtitle")}</p></div>
    <div class="page-actions"><button class="btn btn-primary btn-sm" onclick="openDefectModal()">＋ ${t("defects.new")}</button></div>
  </div>
  <div class="panel-head mb-14"><h3>${t("defects.board")}</h3><span class="panel-hint">${t("defects.board.hint")}</span></div>
  <div class="kanban">
    ${cols.map(col => {
      const list = STATE.defects.filter(d => d.status === col);
      return `<div class="kanban-col">
        <div class="kanban-head"><span style="color:${colors[col]}">${esc(statusText(col))}</span><span class="kanban-count">${list.length}</span></div>
        ${list.map(d => `
          <div class="kcard sev-${esc(d.severity)}" onclick="openDefectDetail('${d.id}')">
            <div class="kcard-title">${esc(d.title)}</div>
            <div class="kcard-meta">
              <span class="kcard-id">${esc(d.id)}</span>
              <span class="badge ${d.severity === "致命" || d.severity === "严重" ? "red" : "gray"}" style="font-size:9px;padding:1px 6px">${esc(sevText(d.severity))}</span>
              <span>${esc(d.assignee || "")}</span>
            </div>
          </div>`).join("") || `<div class="td-muted" style="font-size:11px;text-align:center;padding:12px">—</div>`}
      </div>`;
    }).join("")}
  </div>`;
}
function openDefectDetail(id) {
  const d = STATE.defects.find(x => x.id === id);
  if (!d) return;
  const statuses = DEFECT_STATUS;
  openDrawer(`${d.id} · ${t("defects.title")}`, `
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:13px">
      ${badgeSeverity(d.severity)} ${badgePriority(d.priority)}
      <span class="badge gray">${esc(statusText(d.status))}</span>
    </div>
    <h3 style="font-size:15px;margin-bottom:12px;line-height:1.5">${esc(d.title)}</h3>
    <div class="field"><label>${t("common.description")}</label><div class="case-field">${esc(d.description || "—")}</div></div>
    <div class="field-row">
      <div class="field"><label>${t("defects.reporter")}</label><div class="case-field">${esc(d.reporter || "—")}</div></div>
      <div class="field"><label>${t("defects.assignee")}</label><div class="case-field">${esc(d.assignee || "—")}</div></div>
    </div>
    <div class="field-row">
      <div class="field"><label>${t("defects.linkCase")}</label><div class="case-field">${esc(d.case_id || "—")}</div></div>
      <div class="field"><label>${t("common.createdAt")}</label><div class="case-field">${esc((d.created_at || "").slice(0, 10))}</div></div>
    </div>
    <div class="field"><label>${t("common.status")}</label>
      <select class="select" id="f_dstatus" onchange="changeDefectStatus('${d.id}',this.value)">
        ${statuses.map(s => `<option value="${esc(s)}" ${s === d.status ? "selected" : ""}>${esc(statusText(s))}</option>`).join("")}
      </select></div>`);
}
async function changeDefectStatus(id, status) {
  await apiUpdate("defects", id, { status, resolved_at: status === "已关闭" ? new Date().toISOString().slice(0, 10) : "" });
  await refreshAll(); toast(t("common.success"));
}
function openDefectModal() {
  openModal(t("defects.new"), `
    <div class="field"><label>${t("common.name")}</label><input class="input" id="f_title"></div>
    <div class="field"><label>${t("common.description")}</label><textarea class="textarea" id="f_desc" rows="3"></textarea></div>
    <div class="field-row">
      <div class="field"><label>${t("common.project")}</label>
        <select class="select" id="f_pid">${STATE.projects.map(p => `<option value="${p.id}" ${p.id === STATE.projectId ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select></div>
      <div class="field"><label>${t("defects.severity")}</label>
        <select class="select" id="f_sev">${SEV_ORDER.map(v => `<option value="${v}" ${v === "一般" ? "selected" : ""}>${esc(sevText(v))}</option>`).join("")}</select></div>
    </div>
    <div class="field-row">
      <div class="field"><label>${t("defects.assignee")}</label><input class="input" id="f_assignee" value="待分配"></div>
      <div class="field"><label>${t("defects.linkCase")}</label>
        <select class="select" id="f_case"><option value="">—</option>${STATE.cases.map(c => `<option value="${c.id}">${esc(c.id + " " + c.title.slice(0, 20))}</option>`).join("")}</select></div>
    </div>`,
    async () => {
      const title = $("#f_title").value.trim();
      if (!title) { toast("标题不能为空", "err"); return; }
      await apiCreate("defects", {
        title, description: $("#f_desc").value.trim(), project_id: $("#f_pid").value,
        case_id: $("#f_case").value || null, severity: $("#f_sev").value, priority: "高",
        status: "新建", assignee: $("#f_assignee").value.trim(), reporter: "李伟",
        created_at: new Date().toISOString().slice(0, 10), resolved_at: ""
      });
      closeModal(); await refreshAll(); toast(t("common.success"));
    });
}

/* ============================================================
   8. RAG 生成台
   ============================================================ */
const SAMPLES = {
  login: { title: "用户登录功能", text: "用户输入用户名（6-20位字母或数字）和密码（8-20位，至少含字母和数字），点击登录。用户名或密码为空提示不能为空；格式不符提示格式错误；用户名或密码错误提示错误；连续5次密码错误后账号锁定30分钟；登录成功跳转首页并记录日志，密码需密文显示。" },
  pay: { title: "支付下单接口", text: "POST /api/v1/payments 创建支付单，金额单位为分，大于0且不超过1000000分。需校验签名，签名错误返回401。相同幂等键重复提交返回同一支付单号，不产生重复扣款。创建成功返回201与支付单号。" },
  perf: { title: "实时指标计算", text: "系统按分钟聚合GMV与订单量，延迟不超过90秒，支持按渠道维度下钻。同一批次数据重跑结果必须一致，不得重复计数。源数据修正后重跑应覆盖旧结果。" },
  sec: { title: "文件上传安全", text: "支持上传JPG、PNG图片，单文件不超过10MB，每次最多5个。需防止上传恶意文件与路径穿越，文件名需转义，超限分别提示格式、大小、数量错误。" }
};
function viewGenerate() {
  const g = STATE.gen;
  return `
  <div class="page-head">
    <div><h2>${t("gen.title")}</h2><p>${t("gen.subtitle")}</p></div>
    <div class="page-actions"><span class="badge cyan">BM25-RAG v2 · ${STATE.docs.length} ${t("kb.docs")}</span></div>
  </div>
  <div class="gen-layout">
    <div>
      <div class="panel">
        <div class="panel-head"><h3>${t("gen.reqText")}</h3></div>
        <div class="field"><label>${t("gen.reqTitle")}</label>
          <input class="input" id="genTitle" value="${esc(g.title)}" placeholder="${t("gen.reqPlaceholder")}" oninput="STATE.gen.title=this.value"></div>
        <div class="field"><label>${t("gen.reqText")}</label>
          <textarea class="textarea" id="genText" rows="9" placeholder="${t("gen.reqTextPlaceholder")}" oninput="STATE.gen.text=this.value">${esc(g.text)}</textarea></div>
        <div class="samples"><span>${t("gen.samples")}:</span>
          ${Object.keys(SAMPLES).map(k => `<button class="chip" onclick="fillSample('${k}')">${esc(SAMPLES[k].title)}</button>`).join("")}
        </div>
        <button class="btn btn-primary" style="width:100%" id="genBtn" onclick="runGenerate()" ${g.running ? "disabled" : ""}>
          ${g.running ? t("gen.running") : "✦ " + t("gen.run")}</button>
        <div class="tip">${t("gen.tip")}</div>
      </div>
      ${g.evidence && g.evidence.length ? `
      <div class="panel" style="margin-top:14px">
        <div class="panel-head"><h3>${t("gen.evidence")}</h3><span class="panel-hint">${g.evidence.length} ${t("common.items")}</span></div>
        <div class="ev-list">${g.evidence.map(e => `
          <div class="ev-item">
            <div class="ev-top"><span class="ev-id">${esc(e.id)} · ${esc(e.title)}</span>
            <span class="ev-conf">${Math.round(e.confidence * 100)}%</span></div>
            <div class="ev-content">${esc(e.content)}</div>
          </div>`).join("")}</div>
      </div>` : ""}
    </div>
    <div>
      ${renderGenResult(g.result)}
    </div>
  </div>`;
}
function renderGenResult(res) {
  if (!res) return `<div class="panel ph"><div class="ph-ico">✦</div><h3>${t("gen.waiting")}</h3><p>${t("gen.waitingHint")}</p></div>`;
  if (!res.accepted) {
    return `<div class="panel"><div class="refusal"><h3>◈ ${t("gen.refusal")}</h3><p>${esc(res.refusal)}</p></div></div>`;
  }
  const m = res.meta;
  return `<div class="panel">
    <div class="res-head">
      <div><h3 style="font-size:15px">${t("gen.done")} · ${m.case_count} ${t("gen.cases")}</h3>
        <p class="td-muted" style="font-size:11.5px;margin-top:3px">${t("cases.citations")}: ${m.evidence_count} · ${t("common.total")} ${m.case_count}</p></div>
      <div style="display:flex;gap:6px">
        <button class="btn btn-ghost btn-sm" onclick="exportGen('md')">${t("common.exportMd")}</button>
        <button class="btn btn-ghost btn-sm" onclick="exportGen('json')">${t("common.exportJson")}</button>
        <button class="btn btn-primary btn-sm" onclick="saveGenToLib()">＋ ${t("gen.saveToLib")}</button>
      </div>
    </div>
    <div class="res-meta">
      <span class="meta-pill">${t("gen.avgConf")} <b>${Math.round(m.avg_confidence * 100)}%</b></span>
      <span class="meta-pill">${t("gen.blocks")} <b>${m.evidence_count}</b></span>
      <span class="meta-pill">${t("gen.review")} <b>${m.needs_review_count}</b></span>
      <span class="meta-pill">${t("gen.guard")} <b>${m.hallucination_guard === "passed" ? t("gen.guardPass") : t("gen.guardTrig")}</b></span>
    </div>
    ${res.cases.map(c => {
      const cite = (c.citations || [])[0] || {};
      return `<div class="case-card">
        <div class="case-top">
          <span class="case-id">${esc(c.id)}</span>
          <span class="badge purple">${esc(c.type_label)}</span>
          ${badgePriority(c.priority)}
          ${c.needs_review ? `<span class="badge amber">⚠ ${t("cases.needsReview")}</span>` : ""}
          <span style="margin-left:auto;font-family:var(--font-mono);font-size:11px;color:${c.confidence >= .7 ? "var(--green)" : "var(--amber)"}">${Math.round(c.confidence * 100)}%</span>
        </div>
        <div class="case-title">${esc(c.title)}</div>
        <div class="case-body">
          <div class="case-field"><div class="lbl">${t("cases.precondition")}</div>${esc(c.precondition)}</div>
          <div class="case-field"><div class="lbl">${t("cases.expected")}</div>${esc(c.expected)}</div>
          <div class="case-field" style="grid-column:1/-1"><div class="lbl">${t("cases.steps")}</div>
            <ol>${c.steps.map(s => `<li>${esc(s)}</li>`).join("")}</ol></div>
        </div>
        ${cite.id ? `<div class="cite-box">
          <div class="cite-head" onclick="toggleCite(this)">▸ ${t("cases.citations")}: ${esc(cite.id)} · ${esc(cite.title)}</div>
          <div class="cite-body">${esc(cite.content)}</div>
        </div>` : ""}
      </div>`;
    }).join("")}
  </div>`;
}
function fillSample(k) {
  STATE.gen.title = SAMPLES[k].title;
  STATE.gen.text = SAMPLES[k].text;
  STATE.gen.result = null; STATE.gen.evidence = null;
  render();
}
async function runGenerate() {
  const title = ($("#genTitle") || {}).value || STATE.gen.title;
  const text = ($("#genText") || {}).value || STATE.gen.text;
  if (!text.trim()) { toast(t("gen.reqText") + " " + t("common.required"), "err"); return; }
  STATE.gen.title = title; STATE.gen.text = text; STATE.gen.running = true;
  render();
  try {
    const res = await apiGenerate(title, text);
    STATE.gen.result = res;
    STATE.gen.evidence = res.evidence || [];
  } catch (e) {
    toast(t("common.failed") + ": " + e.message, "err");
  } finally {
    STATE.gen.running = false;
    render();
  }
}
function toggleCite(el) {
  const body = el.nextElementSibling;
  body.classList.toggle("show");
  el.textContent = (body.classList.contains("show") ? "▾" : "▸") + el.textContent.slice(1);
}
async function saveGenToLib() {
  const res = STATE.gen.result;
  if (!res || !res.accepted) return;
  const pid = STATE.projectId || (STATE.projects[0] || {}).id;
  for (const c of res.cases) {
    await apiCreate("cases", {
      project_id: pid, requirement_id: null, title: c.title, type: c.type,
      priority: c.priority, precondition: c.precondition, steps: c.steps,
      expected: c.expected, confidence: c.confidence, citations: c.citations,
      needs_review: c.needs_review, review_status: "draft", execution_status: "untested",
      assignee: "—", created_at: new Date().toISOString().slice(0, 10)
    });
  }
  await refreshAll(); toast(t("gen.saved") + " · " + res.cases.length);
}
function exportGen(fmt) {
  const res = STATE.gen.result;
  if (!res || !res.accepted) return;
  let content, type, name;
  if (fmt === "json") {
    content = JSON.stringify(res, null, 2); type = "application/json"; name = "testcases.json";
  } else {
    let md = `# ${STATE.gen.title || "Test Cases"}\n\n> ${t("gen.avgConf")} ${Math.round(res.meta.avg_confidence * 100)}%\n\n`;
    res.cases.forEach(c => {
      md += `## ${c.id} ${c.title}\n\n- ${t("cases.type")}: ${c.type_label} | ${t("common.priority")}: ${c.priority} | ${t("cases.confidence")}: ${Math.round(c.confidence * 100)}%\n`;
      md += `- ${t("cases.precondition")}: ${c.precondition}\n- ${t("cases.steps")}:\n${c.steps.map(s => "  1. " + s).join("\n")}\n- ${t("cases.expected")}: ${c.expected}\n`;
      if (c.citations[0]) md += `- ${t("cases.citations")}: ${c.citations[0].id} ${c.citations[0].title}\n`;
      md += "\n";
    });
    content = md; type = "text/markdown"; name = "testcases.md";
  }
  downloadFile(content, name, type);
}
function downloadFile(content, name, type) {
  const blob = new Blob([content], { type: type || "text/plain" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}

/* ============================================================
   9. 知识库
   ============================================================ */
function viewKnowledge() {
  const kw = (STATE.search || "").toLowerCase();
  const list = STATE.docs.filter(d => !kw || (d.title + d.content + (d.tags || []).join("") + d.category).toLowerCase().includes(kw));
  return `
  <div class="page-head">
    <div><h2>${t("kb.title")}</h2><p>${t("kb.subtitle")} · ${list.length} ${t("kb.docs")}</p></div>
    <div class="page-actions"><input class="input search" id="searchInput" placeholder="${t("kb.search")}" value="${esc(STATE.search)}" oninput="onSearch(this.value)"></div>
  </div>
  <div class="kb-grid">
    ${list.map(d => `
      <div class="kb-card">
        <div class="kb-cat">${esc(d.category)}</div>
        <div class="kb-title">${esc(d.title)}</div>
        <div class="kb-tags">${(d.tags || []).slice(0, 4).map(x => `<span class="kb-tag">${esc(x)}</span>`).join("")}</div>
        <div class="kb-content">${esc(d.content)}</div>
        <div class="kb-id">${esc(d.id)}</div>
      </div>`).join("") || `<div class="empty">${t("common.noData")}</div>`}
  </div>`;
}

/* ============================================================
   10. 质量报告
   ============================================================ */
function viewReports() {
  const d = STATE.dashboard;
  if (!d) return `<div class="empty">${t("common.loading")}</div>`;
  const typeCount = {};
  STATE.cases.forEach(c => typeCount[c.type_label || c.type] = (typeCount[c.type_label || c.type] || 0) + 1);
  return `
  <div class="page-head">
    <div><h2>${t("report.title")}</h2><p>${t("report.subtitle")}</p></div>
    <div class="page-actions">
      <button class="btn btn-ghost btn-sm" onclick="exportCasesCsv()">⇩ ${t("report.export")}</button>
      <button class="btn btn-ghost btn-sm" onclick="window.print()">⎙ PDF</button>
    </div>
  </div>
  <div class="kpi-grid">
    <div class="kpi ${d.gate_passed === d.gates.length ? "ok" : "bad"}"><div class="kpi-label">${t("report.gate")}</div>
      <div class="kpi-value">${d.gate_passed}<small>/${d.gates.length}</small></div></div>
    ${kpi(t("dashboard.kpi.passRate"), d.summary.pass_rate, "%", d.summary.pass_rate >= 95 ? "ok" : "warn")}
    ${kpi(t("dashboard.kpi.coverage"), d.summary.coverage, "%", d.summary.coverage >= 90 ? "ok" : "warn")}
    ${kpi(t("gen.avgConf"), Math.round(d.summary.avg_confidence * 100), "%", "ok")}
  </div>
  <div class="grid-2 mb-14">
    <div class="panel">
      <div class="panel-head"><h3>${t("dashboard.gates")}</h3><span class="panel-hint">${d.gate_passed}/${d.gates.length}</span></div>
      <div class="gate-list">${d.gates.map(gateHtml).join("")}</div>
    </div>
    <div class="panel">
      <div class="panel-head"><h3>${t("report.typeDist")}</h3></div>
      ${barsHtml(typeCount, "linear-gradient(90deg,var(--accent-2),var(--cyan))")}
    </div>
  </div>
  <div class="grid-2">
    <div class="panel">
      <div class="panel-head"><h3>${t("report.defectTrend")}</h3></div>
      ${barsHtml(d.defect_status, "var(--amber)")}
    </div>
    <div class="panel">
      <div class="panel-head"><h3>${t("report.summary")}</h3></div>
      <div class="set-grid" style="grid-template-columns:1fr">
        ${[["dashboard.kpi.projects", d.summary.projects], ["dashboard.kpi.requirements", d.summary.requirements],
           ["dashboard.kpi.cases", d.summary.cases], ["nav.plans", d.summary.plans],
           ["nav.executions", d.summary.executions], ["dashboard.kpi.defects", d.summary.defects],
           ["cases.needsReview", d.summary.needs_review]].map(([k, v]) => `
          <div class="set-item"><span class="k">${t(k)}</span><span class="v">${v}</span></div>`).join("")}
      </div>
    </div>
  </div>`;
}

/* ============================================================
   11. 审计日志
   ============================================================ */
function viewAudit() {
  const list = STATE.audit.slice().sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""));
  return `
  <div class="page-head">
    <div><h2>${t("audit.title")}</h2><p>${t("audit.subtitle")} · ${t("common.total")} ${list.length} ${t("common.items")}</p></div>
    <div class="page-actions"><button class="btn btn-ghost btn-sm" onclick="refreshAll()">↻ ${t("common.refresh")}</button></div>
  </div>
  <div class="table-wrap"><table class="data">
    <thead><tr><th>${t("audit.time")}</th><th>${t("audit.actor")}</th><th>${t("audit.action")}</th>
      <th>${t("audit.entity")}</th><th>${t("audit.detail")}</th><th>${t("audit.ip")}</th></tr></thead>
    <tbody>${list.map(a => `<tr>
      <td class="td-muted" style="font-family:var(--font-mono);font-size:11px;white-space:nowrap">${esc(a.timestamp || "")}</td>
      <td><b style="font-weight:600">${esc(a.actor || "")}</b></td>
      <td><span class="badge gray">${esc(auditAction(a.action))}</span></td>
      <td class="td-id">${esc(a.entity || "")}</td>
      <td class="td-muted">${esc(a.detail || "")}</td>
      <td class="td-muted" style="font-family:var(--font-mono);font-size:10.5px">${esc(a.ip || "")}</td>
    </tr>`).join("") || emptyRow(6)}</tbody>
  </table></div>`;
}

/* ============================================================
   12. 系统设置
   ============================================================ */
function viewSettings() {
  return `
  <div class="page-head">
    <div><h2>${t("settings.title")}</h2><p>${t("settings.subtitle")}</p></div>
  </div>
  <div class="set-grid">
    <div class="panel">
      <div class="panel-head"><h3>${t("settings.lang")}</h3><span class="panel-hint">${t("settings.langHint")}</span></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${LANGS.map(l => `<button class="btn ${l.code === LANG ? "btn-primary" : "btn-ghost"}" onclick="switchLang('${l.code}')">${l.label}</button>`).join("")}
      </div>
      <div class="panel-head" style="margin-top:20px"><h3>${t("settings.role")}</h3><span class="panel-hint">${t("settings.roleHint")}</span></div>
      <div class="set-item"><span class="k">${t("top.role")}</span><span class="v">李伟 · QA Manager</span></div>
      <div class="set-item"><span class="k">${t("settings.engine")}</span><span class="v">BM25-RAG v2 · ${STATE.docs.length} docs</span></div>
      <div class="set-item"><span class="k">${t("settings.store")}</span><span class="v">${IS_DEMO ? "Browser Storage" : "SQLite"}</span></div>
      <div class="set-item"><span class="k">${t("settings.mode")}</span><span class="v">${IS_DEMO ? t("common.mode.demo") : t("common.mode.server")}</span></div>
    </div>
    <div class="panel">
      <div class="panel-head"><h3>${t("settings.team")}</h3><span class="panel-hint">${STATE.users.length}</span></div>
      <div class="team-list">
        ${STATE.users.map(u => `<div class="team-row">
          <div class="avatar">${esc((u.name || "?").slice(0, 1))}</div>
          <div><div style="font-weight:600">${esc(u.name)}</div><div class="td-muted" style="font-size:10.5px">${esc(u.team || "")}</div></div>
          <span class="role">${esc(u.role)}</span>
        </div>`).join("")}
      </div>
      <div class="panel-head" style="margin-top:20px"><h3>${t("settings.reset")}</h3></div>
      <p class="td-muted" style="font-size:11.5px;line-height:1.7;margin-bottom:10px">${t("settings.resetHint")}</p>
      <button class="btn btn-danger btn-sm" onclick="resetDemo()">⟲ ${t("settings.resetBtn")}</button>
    </div>
  </div>
  <div class="panel" style="margin-top:14px">
    <div class="panel-head"><h3>${t("settings.about")}</h3><span class="panel-hint">v2.0.1</span></div>
    <p class="td-muted" style="font-size:12px;line-height:1.85">
      TestPilot Enterprise —— 企业级智能测试管理平台。覆盖项目 / 需求 / 用例 / 计划 / 执行 / 缺陷 / 审计全流程，
      内置基于 RAG 的测试用例生成引擎，每条用例均可追溯到知识库原文。<br>
      技术栈：Python 3 标准库（http.server + sqlite3）· 自研 BM25 检索引擎 · 原生前端（零构建、零第三方依赖）。
    </p>
  </div>`;
}

/* ============================================================
   通用：抽屉 / 弹窗 / 删除 / 刷新
   ============================================================ */
function openDrawer(title, body) {
  $("#drawerTitle").textContent = title;
  $("#drawerBody").innerHTML = body;
  $("#drawer").classList.remove("hidden");
  $("#drawerMask").classList.remove("hidden");
}
function closeDrawer() {
  $("#drawer").classList.add("hidden");
  $("#drawerMask").classList.add("hidden");
}
let MODAL_SUBMIT = null;
function openModal(title, body, onSubmit) {
  $("#modalTitle").textContent = title;
  $("#modalBody").innerHTML = body;
  $("#modalFoot").innerHTML = `
    <button class="btn btn-ghost" onclick="closeModal()">${t("common.cancel")}</button>
    <button class="btn btn-primary" onclick="submitModal()">${t("common.save")}</button>`;
  MODAL_SUBMIT = onSubmit;
  $("#modalMask").classList.remove("hidden");
}
function closeModal() {
  $("#modalMask").classList.add("hidden");
  MODAL_SUBMIT = null;
}
async function submitModal() {
  if (MODAL_SUBMIT) { try { await MODAL_SUBMIT(); } catch (e) { toast(t("common.failed") + ": " + e.message, "err"); } }
}
async function delEntity(entity, id) {
  if (!confirm(t("common.confirmDelete"))) return;
  await apiDelete(entity, id);
  await refreshAll(); toast(t("common.success"));
}
function emptyRow(cols) {
  return `<tr><td colspan="${cols}"><div class="empty">${t("common.noData")}</div></td></tr>`;
}
async function refreshAll() {
  try {
    await loadAll();
    renderProjectSwitcher();
    await render();
    if (STATE.view === "plans") loadPlanProgress();
  } catch (e) { toast(t("common.failed") + ": " + e.message, "err"); }
}
async function exportCasesCsv() {
  if (IS_DEMO) { toast(t("common.failed") + " · CSV 需服务端模式", "info"); return; }
  const qs = STATE.projectId ? "?project_id=" + STATE.projectId : "";
  window.open("/api/cases/export.csv" + qs, "_blank");
}
async function resetDemo() {
  if (!confirm(t("settings.resetHint") + " " + t("common.confirm"))) return;
  if (IS_DEMO) {
    localStorage.removeItem("tp.deep.db");
    location.reload();
    return;
  }
  toast(t("common.failed") + ": 请删除 data/testpilot.db 后重启服务", "info");
}
function doGlobalSearch() {
  const v = $("#globalSearch").value.trim();
  STATE.search = v;
  if (STATE.view !== "cases" && STATE.view !== "knowledge") switchView("cases");
  else render();
}

/* ============================================================
   启动
   ============================================================ */
async function boot() {
  const qLang = new URLSearchParams(location.search).get("lang");
  if (qLang && I18N[qLang]) setLang(qLang);
  const startView = location.hash.replace("#", "");
  if (VIEW_LABEL[startView]) STATE.view = startView;
  applyI18n();
  $$(".nav-item").forEach(n => n.classList.toggle("active", n.dataset.view === STATE.view));
  updateCrumb();
  try {
    await loadAll();
    renderProjectSwitcher();
    await render();
    if (STATE.view === "plans") loadPlanProgress();
    const pill = $("#engineStatus");
    if (pill) pill.textContent = IS_DEMO ? t("common.mode.demo") : t("top.ready");
    const mode = $("#modeLabel");
    if (mode) mode.textContent = IS_DEMO ? "Browser Storage · BM25-RAG v2" : "SQLite · BM25-RAG v2";
  } catch (e) {
    $("#content").innerHTML = `<div class="empty">${t("common.failed")}: ${esc(e.message)}</div>`;
  }
  document.addEventListener("keydown", e => { if (e.key === "Escape") { closeDrawer(); closeModal(); } });

  // 一键演示：?gen=login|pay|perf|sec 自动填充并生成（便于分享演示链接）
  const qGen = new URLSearchParams(location.search).get("gen");
  if (qGen && SAMPLES[qGen]) {
    STATE.gen.title = SAMPLES[qGen].title;
    STATE.gen.text = SAMPLES[qGen].text;
    STATE.gen.result = null; STATE.gen.evidence = null;
    if (STATE.view !== "generate") { STATE.view = "generate"; updateCrumb(); }
    await render();
    setTimeout(runGenerate, 200);
  }
}
boot();
