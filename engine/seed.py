# -*- coding: utf-8 -*-
"""
企业演示数据种子 —— 让 Demo 首次启动即呈现一个"真实在跑的测试团队"。

数据经过设计，覆盖：
  - 3 个并行项目（电商 / 支付 / 数据中台）、不同健康度
  - 需求 → 用例 → 计划 → 执行 → 缺陷 的完整链路
  - 状态流转真实（有待评审用例、有失败执行、有重开缺陷）
  - 缺陷趋势按日期分布，支撑报表图表
不依赖随机数，每次初始化结果可复现。
"""

USERS = [
    {"id": "U-001", "username": "li.wei", "name": "李伟", "role": "测试经理", "team": "质量保障部", "status": "active"},
    {"id": "U-002", "username": "zhang.min", "name": "张敏", "role": "高级测试工程师", "team": "质量保障部", "status": "active"},
    {"id": "U-003", "username": "chen.hao", "name": "陈昊", "role": "测试工程师", "team": "质量保障部", "status": "active"},
    {"id": "U-004", "username": "wang.fang", "name": "王芳", "role": "产品经理", "team": "产品中心", "status": "active"},
    {"id": "U-005", "username": "zhao.lei", "name": "赵磊", "role": "开发工程师", "team": "研发中心", "status": "active"},
]

PROJECTS = [
    {"id": "P-001", "code": "MALL", "name": "星云商城 V3.0", "description": "电商交易平台迭代，覆盖商品、购物车、订单、支付主链路",
     "status": "active", "owner": "李伟", "priority": "P0", "created_at": "2026-09-01"},
    {"id": "P-002", "code": "PAY", "name": "智联支付平台", "description": "聚合支付与清结算系统，安全与资金正确性为测试重点",
     "status": "active", "owner": "张敏", "priority": "P0", "created_at": "2026-09-15"},
    {"id": "P-003", "code": "DATA", "name": "数据中台 2.0", "description": "指标计算与报表服务，重点验证数据一致性与性能",
     "status": "active", "owner": "陈昊", "priority": "P1", "created_at": "2026-10-08"},
]

REQUIREMENTS = [
    {"id": "R-001", "project_id": "P-001", "code": "REQ-MALL-01", "title": "用户登录与认证",
     "description": "用户名6-20位字母或数字，密码8-20位含字母和数字；空值/格式错误提示；连续5次错误锁定30分钟；成功跳转首页并记录日志；密码密文显示。",
     "priority": "高", "status": "已评审", "source": "PRD v3.2", "created_at": "2026-09-03"},
    {"id": "R-002", "project_id": "P-001", "code": "REQ-MALL-02", "title": "购物车与结算",
     "description": "商品数量1-99整数，校验库存；满100减10、满200减30取最高档；地址必选；支付成功生成订单扣库存，失败标记待支付。",
     "priority": "高", "status": "已评审", "source": "PRD v3.2", "created_at": "2026-09-03"},
    {"id": "R-003", "project_id": "P-001", "code": "REQ-MALL-03", "title": "文件上传（商品图）",
     "description": "支持JPG/PNG，单文件≤10MB，每次≤5个；格式/大小/数量超限分别提示；显示进度，失败可重试，支持删除。",
     "priority": "中", "status": "已评审", "source": "PRD v3.2", "created_at": "2026-09-05"},
    {"id": "R-004", "project_id": "P-001", "code": "REQ-MALL-04", "title": "优惠券叠加规则",
     "description": "满减券与折扣券不可叠加；同一订单仅可使用一张优惠券；过期券不可使用并给出提示。",
     "priority": "中", "status": "待评审", "source": "运营需求池", "created_at": "2026-10-20"},
    {"id": "R-005", "project_id": "P-002", "code": "REQ-PAY-01", "title": "支付下单接口",
     "description": "POST /api/v1/payments 创建支付单，金额单位为分，需校验签名与幂等键；重复幂等键返回同一订单；金额>0且≤单笔限额。",
     "priority": "高", "status": "已评审", "source": "接口规范 v1.4", "created_at": "2026-09-16"},
    {"id": "R-006", "project_id": "P-002", "code": "REQ-PAY-02", "title": "退款与对账",
     "description": "支持全额/部分退款，退款金额不得超过原支付金额；T+1 自动生成对账单，差异记录进入异常池。",
     "priority": "高", "status": "已评审", "source": "接口规范 v1.4", "created_at": "2026-09-18"},
    {"id": "R-007", "project_id": "P-003", "code": "REQ-DATA-01", "title": "实时指标计算",
     "description": "GMV/订单量按分钟聚合，延迟不超过90秒；数据重跑幂等，结果一致；支持按渠道维度下钻。",
     "priority": "中", "status": "已评审", "source": "数据需求 v2.0", "created_at": "2026-10-10"},
]

# 用例：字段与生成器输出对齐，另外加评审/执行状态与负责人
CASES = [
    {"id": "TC-001", "project_id": "P-001", "requirement_id": "R-001", "title": "合法账号密码登录成功", "type": "positive", "priority": "高",
     "precondition": "用户已注册且账号未锁定", "steps": ["输入合法用户名 test_user01", "输入正确密码 Abc12345", "点击登录"],
     "expected": "登录成功跳转首页，记录登录日志，密码框为密文", "confidence": 0.96, "needs_review": False, "review_status": "approved", "execution_status": "pass", "assignee": "张敏"},
    {"id": "TC-002", "project_id": "P-001", "requirement_id": "R-001", "title": "用户名/密码为空校验", "type": "validation", "priority": "高",
     "precondition": "进入登录页", "steps": ["用户名留空输入密码", "提交", "清空密码输入用户名后再提交"],
     "expected": "提示'用户名或密码不能为空'，不发起登录请求", "confidence": 0.93, "needs_review": False, "review_status": "approved", "execution_status": "pass", "assignee": "张敏"},
    {"id": "TC-003", "project_id": "P-001", "requirement_id": "R-001", "title": "连续5次密码错误账号锁定", "type": "security", "priority": "高",
     "precondition": "测试账号处于未锁定状态", "steps": ["连续5次输入错误密码", "第6次输入正确密码"],
     "expected": "第5次后账号锁定30分钟，第6次提示账号已锁定", "confidence": 0.89, "needs_review": False, "review_status": "approved", "execution_status": "fail", "assignee": "陈昊"},
    {"id": "TC-004", "project_id": "P-001", "requirement_id": "R-001", "title": "用户名长度边界值 6/20 位", "type": "boundary", "priority": "中",
     "precondition": "进入登录页", "steps": ["输入5位用户名", "输入6位合法用户名", "输入20位合法用户名", "输入21位用户名"],
     "expected": "5位与21位被拒绝并提示格式错误，6位与20位通过校验", "confidence": 0.84, "needs_review": False, "review_status": "approved", "execution_status": "pass", "assignee": "陈昊"},
    {"id": "TC-005", "project_id": "P-001", "requirement_id": "R-002", "title": "购物车数量边界 1/99", "type": "boundary", "priority": "中",
     "precondition": "商品库存充足", "steps": ["数量设为0", "设为1", "设为99", "设为100"],
     "expected": "0与100被拦截，1与99正常加入购物车", "confidence": 0.87, "needs_review": False, "review_status": "approved", "execution_status": "pass", "assignee": "张敏"},
    {"id": "TC-006", "project_id": "P-001", "requirement_id": "R-002", "title": "满减优惠取最高档", "type": "business", "priority": "高",
     "precondition": "购物车商品总额250元", "steps": ["进入结算页", "查看优惠金额", "提交订单"],
     "expected": "仅减30元（最高档），订单金额220元", "confidence": 0.91, "needs_review": False, "review_status": "approved", "execution_status": "fail", "assignee": "张敏"},
    {"id": "TC-007", "project_id": "P-001", "requirement_id": "R-002", "title": "支付失败订单状态为待支付", "type": "negative", "priority": "高",
     "precondition": "可模拟支付网关失败", "steps": ["提交订单", "模拟支付网关返回失败"],
     "expected": "订单状态为待支付，库存不扣减，无脏数据", "confidence": 0.82, "needs_review": False, "review_status": "reviewed", "execution_status": "untested", "assignee": "陈昊"},
    {"id": "TC-008", "project_id": "P-001", "requirement_id": "R-003", "title": "上传超限10MB文件被拒绝", "type": "boundary", "priority": "中",
     "precondition": "准备10MB+1字节的PNG文件", "steps": ["选择该文件上传", "观察提示"],
     "expected": "提示'文件大小不能超过10MB'，文件未上传", "confidence": 0.79, "needs_review": True, "review_status": "draft", "execution_status": "untested", "assignee": "陈昊"},
    {"id": "TC-009", "project_id": "P-001", "requirement_id": "R-004", "title": "优惠券不可叠加", "type": "business", "priority": "中",
     "precondition": "用户持满减券与折扣券各一张", "steps": ["同时选择两张券", "提交结算"],
     "expected": "系统拒绝叠加并提示仅可使用一张", "confidence": 0.68, "needs_review": True, "review_status": "draft", "execution_status": "untested", "assignee": "—"},
    {"id": "TC-010", "project_id": "P-002", "requirement_id": "R-005", "title": "创建支付单正常流程", "type": "positive", "priority": "高",
     "precondition": "签名密钥有效", "steps": ["POST /api/v1/payments 携带合法参数与签名", "校验响应"],
     "expected": "返回201与支付单号，状态为待支付", "confidence": 0.94, "needs_review": False, "review_status": "approved", "execution_status": "pass", "assignee": "张敏"},
    {"id": "TC-011", "project_id": "P-002", "requirement_id": "R-005", "title": "重复幂等键返回同一订单", "type": "business", "priority": "高",
     "precondition": "已有支付单", "steps": ["使用相同幂等键重复提交两次"],
     "expected": "两次返回同一支付单号，未产生重复扣款", "confidence": 0.90, "needs_review": False, "review_status": "approved", "execution_status": "pass", "assignee": "张敏"},
    {"id": "TC-012", "project_id": "P-002", "requirement_id": "R-005", "title": "无效签名被拒绝", "type": "security", "priority": "高",
     "precondition": "构造错误签名", "steps": ["携带错误签名调用创建支付单接口"],
     "expected": "返回401，不创建任何订单", "confidence": 0.88, "needs_review": False, "review_status": "approved", "execution_status": "pass", "assignee": "陈昊"},
    {"id": "TC-013", "project_id": "P-002", "requirement_id": "R-006", "title": "部分退款金额校验", "type": "boundary", "priority": "高",
     "precondition": "存在100元已支付订单", "steps": ["申请退款100元", "申请退款100.01元"],
     "expected": "100元退款成功；100.01元被拒绝并提示超出可退金额", "confidence": 0.86, "needs_review": False, "review_status": "reviewed", "execution_status": "fail", "assignee": "张敏"},
    {"id": "TC-014", "project_id": "P-003", "requirement_id": "R-007", "title": "GMV按分钟聚合延迟<90秒", "type": "business", "priority": "中",
     "precondition": "有实时交易流水", "steps": ["产生交易", "等待80秒查询指标"],
     "expected": "GMV指标已更新且与流水一致，延迟不超过90秒", "confidence": 0.81, "needs_review": False, "review_status": "approved", "execution_status": "pass", "assignee": "陈昊"},
    {"id": "TC-015", "project_id": "P-003", "requirement_id": "R-007", "title": "指标重跑结果幂等", "type": "negative", "priority": "中",
     "precondition": "同一批次数据", "steps": ["执行两次重跑任务", "对比两次结果"],
     "expected": "两次结果完全一致，无重复计数", "confidence": 0.77, "needs_review": True, "review_status": "draft", "execution_status": "untested", "assignee": "—"},
]

PLANS = [
    {"id": "PL-001", "project_id": "P-001", "name": "V3.0 回归测试计划", "description": "覆盖登录、购物车、结算主链路的系统回归",
     "start_date": "2026-11-10", "end_date": "2026-11-25", "status": "执行中", "owner": "李伟"},
    {"id": "PL-002", "project_id": "P-002", "name": "支付接口安全专项", "description": "签名、幂等、越权与资金正确性专项测试",
     "start_date": "2026-11-12", "end_date": "2026-11-22", "status": "执行中", "owner": "张敏"},
    {"id": "PL-003", "project_id": "P-003", "name": "数据中台性能验收", "description": "指标时效性与一致性验收",
     "start_date": "2026-11-18", "end_date": "2026-11-30", "status": "待执行", "owner": "陈昊"},
]

PLAN_CASES = [
    ("PL-001", "TC-001"), ("PL-001", "TC-002"), ("PL-001", "TC-003"), ("PL-001", "TC-004"),
    ("PL-001", "TC-005"), ("PL-001", "TC-006"), ("PL-001", "TC-007"), ("PL-001", "TC-008"),
    ("PL-002", "TC-010"), ("PL-002", "TC-011"), ("PL-002", "TC-012"), ("PL-002", "TC-013"),
    ("PL-003", "TC-014"), ("PL-003", "TC-015"),
]

EXECUTIONS = [
    {"id": "EX-001", "plan_id": "PL-001", "case_id": "TC-001", "result": "pass", "actual": "登录成功，跳转首页正确", "executor": "张敏", "executed_at": "2026-11-12 10:23"},
    {"id": "EX-002", "plan_id": "PL-001", "case_id": "TC-002", "result": "pass", "actual": "空值提示正确", "executor": "张敏", "executed_at": "2026-11-12 10:31"},
    {"id": "EX-003", "plan_id": "PL-001", "case_id": "TC-003", "result": "fail", "actual": "锁定30分钟后第6次仍提示密码错误，未提示锁定", "executor": "陈昊", "executed_at": "2026-11-13 14:05"},
    {"id": "EX-004", "plan_id": "PL-001", "case_id": "TC-004", "result": "pass", "actual": "边界校验符合预期", "executor": "陈昊", "executed_at": "2026-11-13 14:20"},
    {"id": "EX-005", "plan_id": "PL-001", "case_id": "TC-005", "result": "pass", "actual": "数量边界正确", "executor": "张敏", "executed_at": "2026-11-14 09:40"},
    {"id": "EX-006", "plan_id": "PL-001", "case_id": "TC-006", "result": "fail", "actual": "250元订单同时享受满100减10与满200减30，共减40元", "executor": "张敏", "executed_at": "2026-11-14 11:12"},
    {"id": "EX-007", "plan_id": "PL-002", "case_id": "TC-010", "result": "pass", "actual": "返回201，单号正确", "executor": "张敏", "executed_at": "2026-11-13 16:30"},
    {"id": "EX-008", "plan_id": "PL-002", "case_id": "TC-011", "result": "pass", "actual": "幂等生效，无重复订单", "executor": "张敏", "executed_at": "2026-11-13 16:45"},
    {"id": "EX-009", "plan_id": "PL-002", "case_id": "TC-012", "result": "pass", "actual": "返回401", "executor": "陈昊", "executed_at": "2026-11-14 10:15"},
    {"id": "EX-010", "plan_id": "PL-002", "case_id": "TC-013", "result": "fail", "actual": "退款100.01元未被拦截，产生超额退款", "executor": "张敏", "executed_at": "2026-11-15 15:50"},
    {"id": "EX-011", "plan_id": "PL-003", "case_id": "TC-014", "result": "pass", "actual": "延迟72秒，数据一致", "executor": "陈昊", "executed_at": "2026-11-18 09:20"},
]

DEFECTS = [
    {"id": "BUG-001", "project_id": "P-001", "case_id": "TC-003", "title": "账号锁定30分钟后仍提示密码错误", "description": "连续5次错误后账号锁定，但解锁时间到达后输入正确密码仍提示密码错误，需重新设置密码才能登录。",
     "severity": "严重", "priority": "高", "status": "已修复待验证", "assignee": "赵磊", "reporter": "陈昊", "created_at": "2026-11-13", "resolved_at": ""},
    {"id": "BUG-002", "project_id": "P-001", "case_id": "TC-006", "title": "满减优惠重复叠加导致金额计算错误", "description": "订单金额250元时同时命中满100减10与满200减30，实际减40元，预期仅减30元。涉及资金计算，影响面大。",
     "severity": "致命", "priority": "高", "status": "新建", "assignee": "赵磊", "reporter": "张敏", "created_at": "2026-11-14", "resolved_at": ""},
    {"id": "BUG-003", "project_id": "P-002", "case_id": "TC-013", "title": "部分退款金额超出原支付金额未被拦截", "description": "对100元订单申请退款100.01元，接口返回成功，产生超额退款，存在资金风险。",
     "severity": "致命", "priority": "高", "status": "重新打开", "assignee": "赵磊", "reporter": "张敏", "created_at": "2026-11-15", "resolved_at": "2026-11-16"},
    {"id": "BUG-004", "project_id": "P-001", "case_id": "TC-008", "title": "上传10MB以上文件提示文案不统一", "description": "提示文案为'文件过大'，与需求规定的'文件大小不能超过10MB'不一致。",
     "severity": "轻微", "priority": "低", "status": "已关闭", "assignee": "赵磊", "reporter": "陈昊", "created_at": "2026-11-10", "resolved_at": "2026-11-12"},
    {"id": "BUG-005", "project_id": "P-001", "case_id": "TC-004", "title": "用户名20位边界输入被截断", "description": "输入20位合法用户名时前端截断为19位，后端仍校验通过。",
     "severity": "一般", "priority": "中", "status": "已关闭", "assignee": "赵磊", "reporter": "陈昊", "created_at": "2026-11-08", "resolved_at": "2026-11-11"},
]

# 审计日志（时间倒序由查询层处理）
AUDIT_LOGS = [
    {"id": "AL-001", "actor": "李伟", "action": "创建测试计划", "entity": "PL-003", "detail": "数据中台性能验收", "timestamp": "2026-11-18 08:55", "ip": "10.12.3.41"},
    {"id": "AL-002", "actor": "张敏", "action": "提交缺陷", "entity": "BUG-003", "detail": "重新打开：部分退款金额未被拦截", "timestamp": "2026-11-16 09:32", "ip": "10.12.3.52"},
    {"id": "AL-003", "actor": "陈昊", "action": "执行用例", "entity": "TC-011", "detail": "结果：通过", "timestamp": "2026-11-13 16:45", "ip": "10.12.3.63"},
    {"id": "AL-004", "actor": "张敏", "action": "评审用例", "entity": "TC-006", "detail": "评审通过，优先级：高", "timestamp": "2026-11-11 14:10", "ip": "10.12.3.52"},
    {"id": "AL-005", "actor": "李伟", "action": "导入需求", "entity": "R-007", "detail": "来源：数据需求 v2.0", "timestamp": "2026-11-10 11:20", "ip": "10.12.3.41"},
    {"id": "AL-006", "actor": "系统", "action": "RAG 生成用例", "entity": "TC-009", "detail": "置信度 0.68，已标记人工复核", "timestamp": "2026-11-09 16:48", "ip": "127.0.0.1"},
]
