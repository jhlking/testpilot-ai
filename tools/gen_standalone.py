# -*- coding: utf-8 -*-
"""
从 knowledge/corpus.json + engine/seed.py 生成 web/standalone.js 和 docs 副本。
保证 GitHub Pages 静态演示与 Python 后端使用完全相同的语料与演示数据。
"""
import io
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
from engine import seed  # noqa: E402

CORPUS_PATH = os.path.join(ROOT, "knowledge", "corpus.json")
OUT_PATH = os.path.join(ROOT, "web", "standalone.js")

corpus = json.load(io.open(CORPUS_PATH, "r", encoding="utf-8"))
docs = corpus["documents"]

# 语料：保留全文，JS 字符串安全处理
corpus_js = json.dumps(docs, ensure_ascii=False, separators=(",", ":"))

# 演示数据
demo = {
    "users": seed.USERS,
    "projects": seed.PROJECTS,
    "requirements": seed.REQUIREMENTS,
    "cases": seed.CASES,
    "plans": seed.PLANS,
    "planCases": [{"plan_id": a, "case_id": b} for a, b in seed.PLAN_CASES],
    "executions": seed.EXECUTIONS,
    "defects": seed.DEFECTS,
    "auditLogs": seed.AUDIT_LOGS,
}
demo_js = json.dumps(demo, ensure_ascii=False, separators=(",", ":"))

TEMPLATE = r'''/* TestPilot Enterprise —— 纯前端 RAG 引擎 + 演示数据（GitHub Pages 演示版）
   由 tools/gen_standalone.py 自动生成，请勿手改。
   算法与 Python 后端一致：中文 bigram + BM25 + 绝对分数闸门 + 证据驱动生成。
   DemoAPI 提供与后端 REST 同构的方法，app.js 可无差别调用。 */
const CORPUS = __CORPUS__;
const DEMO = __DEMO__;
const STOP = new Set("的 了 和 与 及 在 是 有 对 为 以 把 被 从 到 这 那 一个 一些 进行 可以 需要 应该 我们 你们 他们 如果 然后 或者 并且 请 要 时 后 前 中 上".split(" "));
const K1=1.5, B=0.75, MIN_ABS=6.0, REVIEW=0.35;

function tokenize(text){
  if(!text)return[];
  const t=[], s=String(text).toLowerCase();
  for(const m of s.match(/[a-z0-9]+/g)||[]) if(!STOP.has(m)) t.push(m);
  for(const seg of s.match(/[\u4e00-\u9fff]+/g)||[]){
    const ch=[...seg];
    for(const c of ch) if(!STOP.has(c)) t.push(c);
    for(let i=0;i<ch.length-1;i++){const bg=ch[i]+ch[i+1]; if(!STOP.has(bg)) t.push(bg);}
  }
  return t;
}
const DOCS=CORPUS.map(d=>({...d,tokens:tokenize([d.title,d.title,...(d.tags||[]),d.content].join(" "))}));
const TF=DOCS.map(d=>{const m={};for(const t of d.tokens)m[t]=(m[t]||0)+1;return m;});
const N=DOCS.length, AVG=DOCS.reduce((s,d)=>s+d.tokens.length,0)/N;
const DF={};for(const m of TF)for(const k in m)DF[k]=(DF[k]||0)+1;
const IDF={};for(const k in DF)IDF[k]=Math.log(1+(N-DF[k]+0.5)/(DF[k]+0.5));

function retrieve(q,topK=5){
  const qt={};for(const t of tokenize(q))qt[t]=(qt[t]||0)+1;
  const scored=[];
  DOCS.forEach((d,i)=>{
    let s=0;
    for(const term in qt){const f=TF[i][term]||0;if(!f)continue;
      s+=IDF[term]*(f*(K1+1)/(f+K1*(1-B+B*d.tokens.length/AVG)))*qt[term];}
    if(s>0)scored.push([s,i]);
  });
  scored.sort((a,b)=>b[0]-a[0]);
  if(!scored.length)return[];
  const mx=scored[0][0]||1;
  return scored.slice(0,topK).map(([s,i])=>({...DOCS[i],score:s,confidence:s/mx,has_evidence:s>=MIN_ABS}));
}

const SIGNALS={
  boundary:["边界","范围","限制","最大","最小","不超过","最多","最少","位","长度","之间","以内","以上","超限"],
  validation:["校验","验证","必填","不能为空","提示","错误","格式","合法","仅支持","只允许","非法"],
  auth:["登录","密码","账号","认证","鉴权","权限","token","授权","签名","令牌"],
  business:["结算","支付","加入购物车","下单","订单","优惠","库存","金额","提交","生成","退款","对账","满减"],
  security:["安全","上传","注入","越权","加密","密文","SQL","XSS","敏感","重放"],
  idempotency:["幂等","重复提交","重复请求","重试","幂等键","单次"],
  performance:["性能","并发","响应","延迟","TPS","吞吐","秒","负载"],
  consistency:["一致","扣减","对账","流水","重跑","同步","累计"]
};
const TYPES={positive:"正向功能",negative:"异常/反向",boundary:"边界值",validation:"格式校验",security:"安全性",
  business:"业务流程",idempotency:"幂等性",performance:"性能时效",consistency:"数据一致性"};

function generate(requirement,title){
  const q=String(title+" "+requirement).trim();
  const raw=retrieve(q);
  if(!raw.length||!raw[0].has_evidence)
    return{accepted:false,refusal:"未检索到足够相关的测试知识证据（相关性低于可信阈值）。为避免编造（幻觉），已拒绝生成用例。请补充更具体的需求描述或更换措辞后重试。",
      cases:[],evidence:raw,meta:{hallucination_guard:"triggered",best_abs_score:raw[0]?raw[0].score:0}};
  const usable=raw.filter(e=>e.has_evidence);
  const sig=new Set();
  for(const t in SIGNALS) for(const w of SIGNALS[t]) if(q.includes(w)){sig.add(t);break;}
  const numbers=q.match(/\d+/g)||[];
  const cases=[];
  const cit=e=>({id:e.id,title:e.title,category:e.category,content:e.content});
  function add(type,t,pre,steps,exp,bi=0,adj=0,priority){
    const b=usable[Math.min(bi,usable.length-1)];
    const conf=Math.max(0,Math.min(1,b.confidence+adj));
    const pri=priority||(["positive","business","security","idempotency","consistency"].includes(type)?"高":"中");
    cases.push({id:"TC-"+String(cases.length+1).padStart(3,"0"),type,type_label:TYPES[type],title:t,priority:pri,
      precondition:pre,steps,expected:exp,citations:[cit(b)],confidence:conf,needs_review:conf<REVIEW,
      review_status:"draft",execution_status:"untested",assignee:"—"});
  }
  add("positive","验证核心功能在合法输入下正确执行","系统正常运行，用户已进入功能页面",
    ["按需求输入一组合法数据","提交/确认操作","观察系统响应"],"操作成功，系统按需求返回预期结果，无异常提示");
  const be=usable.findIndex(e=>e.title.includes("边界"));
  if(sig.has("boundary")||be>=0){
    const rng=numbers.slice(0,4).join(" / ")||"需求边界";
    add("boundary","验证输入边界值与临界值","系统正常运行，了解需求规定的取值边界",
      ["输入边界下限值并提交","输入边界上限值并提交","分别输入略低于下限、略高于上限的值并提交"],
      "边界内取值被接受；超出边界值被拒绝并提示（依据："+rng+"）",be>=0?be:0);
  }
  const ve=usable.findIndex(e=>e.content.includes("校验")||e.content.includes("必填")||e.title.includes("格式"));
  if(sig.has("validation")||ve>=0)
    add("validation","验证必填项与格式校验","系统正常运行，进入输入页面",
      ["必填项留空直接提交","输入不符合格式要求的数据提交","输入合法格式数据提交"],
      "空值与非法格式被拦截并提示原因；合法输入通过校验",ve>=0?ve:0);
  add("negative","验证异常与无效输入的处理","系统正常运行",
    ["输入无效或非法的数据组合","提交并检查系统反馈"],
    "系统不崩溃、不产生脏数据，给出清晰错误提示，保持数据一致性",Math.min(1,usable.length-1),-0.05);
  if(sig.has("auth")||sig.has("security")){
    const se=usable.findIndex(e=>e.category.includes("安全")||e.category.includes("接口"));
    add("security","验证身份鉴权与安全性约束","系统具备鉴权机制",
      ["未登录/无权限尝试访问受限功能","尝试非法或越权参数提交"],
      "未授权访问被拒绝；敏感信息不明文展示；无安全漏洞暴露",se>=0?se:0);
  }
  if(sig.has("business")){
    const bi=usable.findIndex(e=>e.title.includes("场景")||e.content.includes("流程"));
    add("business","验证完整业务流程与异常分支","具备完成业务所需的前置数据",
      ["按基本流完成一次完整业务操作","在关键节点制造异常分支后重试"],
      "基本流成功产出预期结果；异常分支被正确处理，状态与数据保持一致",bi>=0?bi:0);
  }
  if(sig.has("idempotency")){
    const ii=usable.findIndex(e=>e.title.includes("幂等")||e.content.includes("幂等"));
    add("idempotency","验证重复提交与幂等键约束","系统具备幂等机制，已生成唯一幂等键",
      ["使用同一幂等键连续提交两次相同请求","校验业务记录数量与返回单号","使用不同幂等键再提交一次"],
      "重复请求只产生一条记录且返回同一单号；无重复扣款/库存扣减",ii>=0?ii:0,"高");
  }
  if(sig.has("performance")){
    const pi=usable.findIndex(e=>e.title.includes("性能")||e.content.includes("延迟"));
    add("performance","验证关键操作的时效性与并发响应","系统部署完成，可模拟多用户并发",
      ["在预期并发下执行目标操作","记录 P95 响应时间与吞吐量","持续运行观察稳定性"],
      "关键操作响应时间满足需求阈值，吞吐达标，长时间运行无性能衰减",pi>=0?pi:0,"中");
  }
  if(sig.has("consistency")){
    const ci=usable.findIndex(e=>e.title.includes("一致")||e.content.includes("重跑"));
    add("consistency","验证跨模块数据一致性与重跑幂等","具备可对照的源数据与业务流水",
      ["完成一次业务操作后核对关联表数据","对同一批次执行两次重跑","比对两次结果与明细汇总"],
      "各关联数据能对平，重跑结果完全一致、无重复计数或脏数据",ci>=0?ci:0,"高");
  }
  const avg=cases.reduce((s,c)=>s+c.confidence,0)/cases.length;
  const priMix={};cases.forEach(c=>priMix[c.priority]=(priMix[c.priority]||0)+1);
  return{accepted:true,refusal:"",cases,evidence:usable,meta:{
    evidence_count:usable.length,case_count:cases.length,avg_confidence:avg,
    needs_review_count:cases.filter(c=>c.needs_review).length,
    hallucination_guard:"passed",signals_detected:[...sig].sort(),priority_mix:priMix,engine_version:"2.0.0"}};
}

/* ---------- 与后端 REST 同构的本地数据访问层 ---------- */
function clone(o){return o==null?o:JSON.parse(JSON.stringify(o));}
function matchWhere(item,where){
  if(!where)return true;
  return Object.keys(where).every(k=>Array.isArray(where[k])?where[k].includes(item[k]):item[k]===where[k]);
}
const DB_KEY="tp.deep.db";
function loadDB(){
  try{ if(typeof localStorage!=="undefined"){ const s=localStorage.getItem(DB_KEY); if(s) return JSON.parse(s); } }catch(e){}
  return clone(DEMO);
}
function persist(){
  try{ if(typeof localStorage!=="undefined") localStorage.setItem(DB_KEY, JSON.stringify(DB)); }catch(e){}
}
let DB=loadDB();
const ID_PREFIX={projects:"P",users:"U",requirements:"R",cases:"TC",plans:"PL",executions:"EX",defects:"BUG",auditLogs:"AL"};
function nextId(entity){
  const p=ID_PREFIX[entity]||"ID";
  const nums=(DB[entity]||[]).map(x=>parseInt(String(x.id).split("-").pop(),10)).filter(n=>!isNaN(n));
  return p+"-"+String(Math.max(0,...nums)+1).padStart(3,"0");
}
function autoAudit(action,entity,detail){
  DB.auditLogs.unshift({id:nextId("auditLogs"),actor:"当前用户",action,entity,
    detail:detail||"",timestamp:new Date().toLocaleString("sv-CN").replace("T"," ").slice(0,16),ip:"127.0.0.1"});
  persist();
}

const DemoAPI={
  async health(){return{status:"ok",service:"TestPilot Enterprise",engine:"BM25-RAG",mode:"standalone"};},
  async stats(){return{total_documents:CORPUS.length,
    categories:CORPUS.reduce((a,d)=>(a[d.category]=(a[d.category]||0)+1,a),{}),
    avg_tokens_per_doc:Math.round(AVG)};},
  async documents(){return{documents:DB.cases?CORPUS:CORPUS};},
  async list(entity,where){return{items:clone((DB[entity]||[]).filter(x=>matchWhere(x,where)))};},
  async get(entity,id){return clone((DB[entity]||[]).find(x=>x.id===id)||null);},
  async create(entity,data,actor){
    const row=clone(data); if(!row.id)row.id=nextId(entity);
    DB[entity].unshift(row); autoAudit("创建"+(entity==="auditLogs"?"日志":entity.slice(0,-1)),row.id,row.title||row.name||"");
    return clone(row);
  },
  async update(entity,id,patch,actor){
    const row=(DB[entity]||[]).find(x=>x.id===id); if(!row)return null;
    Object.assign(row,clone(patch)); autoAudit("更新"+entity.slice(0,-1),id,Object.keys(patch).join(","));
    return clone(row);
  },
  async remove(entity,id){
    const i=(DB[entity]||[]).findIndex(x=>x.id===id); if(i>=0)DB[entity].splice(i,1);
    autoAudit("删除"+entity.slice(0,-1),id,""); return{deleted:id};
  },
  async search(query,top_k){return{results:retrieve(query,top_k||5),query};},
  async generate(requirement,title){return generate(requirement,title);},
  async planDetail(id){
    const p=clone(DB.plans.find(x=>x.id===id)); if(!p)return null;
    const ids=new Set(DB.planCases.filter(x=>x.plan_id===id).map(x=>x.case_id));
    p.cases=clone(DB.cases.filter(c=>ids.has(c.id)));
    p.executions=clone(DB.executions.filter(e=>e.plan_id===id));
    const done=p.executions.length,pass=p.executions.filter(e=>e.result==="pass").length,
      fail=p.executions.filter(e=>e.result==="fail").length;
    p.progress={total:p.cases.length,executed:done,pass,fail,not_run:Math.max(0,p.cases.length-done),
      pass_rate:done?+(pass/done*100).toFixed(1):0,progress:p.cases.length?+(done/p.cases.length*100).toFixed(1):0};
    return p;
  },
  async dashboard(){
    const cases=DB.cases,reqs=DB.requirements,defects=DB.defects;
    const byResult={pass:0,fail:0,blocked:0,untested:0};
    cases.forEach(c=>byResult[c.execution_status]=(byResult[c.execution_status]||0)+1);
    const bySeverity={},byStatus={};
    defects.forEach(d=>{bySeverity[d.severity]=(bySeverity[d.severity]||0)+1;byStatus[d.status]=(byStatus[d.status]||0)+1;});
    const reviewed=cases.filter(c=>["reviewed","approved"].includes(c.review_status)).length;
    const covered=new Set(cases.filter(c=>c.requirement_id).map(c=>c.requirement_id)).size;
    const executed=byResult.pass+byResult.fail+byResult.blocked;
    const passRate=executed?+(byResult.pass/executed*100).toFixed(1):0;
    const coverage=reqs.length?+(covered/reqs.length*100).toFixed(1):0;
    const critical=defects.filter(d=>["致命","严重"].includes(d.severity)&&d.status!=="已关闭").length;
    const gates=[
      {name:"需求覆盖率",value:coverage,target:90,unit:"%",passed:coverage>=90},
      {name:"用例评审率",value:cases.length?+(reviewed/cases.length*100).toFixed(1):0,target:80,unit:"%",passed:cases.length?reviewed/cases.length>=0.8:false},
      {name:"执行通过率",value:passRate,target:95,unit:"%",passed:passRate>=95},
      {name:"致命/严重未关闭",value:critical,target:0,unit:"个",passed:critical===0}
    ];
    const trend={};
    DB.executions.forEach(e=>{const day=(e.executed_at||"").slice(0,10);if(day){(trend[day]=trend[day]||{pass:0,fail:0})[e.result]=(trend[day][e.result]||0)+1;}});
    return{scope:"ALL",summary:{projects:DB.projects.length,requirements:reqs.length,cases:cases.length,
      plans:DB.plans.length,executions:DB.executions.length,defects:defects.length,pass_rate:passRate,coverage,
      avg_confidence:cases.length?+(cases.reduce((s,c)=>s+(c.confidence||0),0)/cases.length).toFixed(3):0,
      needs_review:cases.filter(c=>c.needs_review).length},
      case_results:byResult,defect_severity:bySeverity,defect_status:byStatus,gates,
      gate_passed:gates.filter(g=>g.passed).length,
      trend:Object.keys(trend).sort().map(k=>({date:k,...trend[k]})),
      recent_audit:clone(DB.auditLogs.slice(0,8))};
  },
  async exportCSV(){return "";}
};
window.DemoAPI=DemoAPI;
window.STANDALONE_CORPUS=CORPUS;
'''

out = TEMPLATE.replace("__CORPUS__", corpus_js).replace("__DEMO__", demo_js)
with io.open(OUT_PATH, "w", encoding="utf-8", newline="\n") as f:
    f.write(out)
print("generated:", OUT_PATH, "bytes:", len(out.encode("utf-8")), "docs:", len(docs))
