/* TestPilot Enterprise —— 纯前端 RAG 引擎 + 演示数据（GitHub Pages 演示版）
   由 tools/gen_standalone.py 自动生成，请勿手改。
   算法与 Python 后端一致：中文 bigram + BM25 + 绝对分数闸门 + 证据驱动生成。
   DemoAPI 提供与后端 REST 同构的方法，app.js 可无差别调用。 */
const CORPUS = [{"id":"KB-METH-001","category":"测试方法论","title":"黑盒测试与白盒测试","tags":["黑盒","白盒","测试方法","功能测试","结构测试"],"content":"黑盒测试（Black-box Testing）又称功能测试，把程序看作不透明的盒子，不关心内部代码结构，只依据需求规格说明检查输入与输出是否符合预期。常见黑盒方法有等价类划分、边界值分析、判定表驱动、因果图、场景法和错误推测法。白盒测试（White-box Testing）又称结构测试，需要了解程序内部逻辑，依据代码结构设计测试用例，常见方法有逻辑覆盖（语句覆盖、判定覆盖、条件覆盖、判定-条件覆盖、条件组合覆盖、路径覆盖）和基本路径测试。黑盒适合验证功能是否符合需求，白盒适合发现代码层面的逻辑缺陷，两者互补，实际项目中通常结合使用。"},{"id":"KB-METH-002","category":"测试方法论","title":"软件测试 pyramids 与测试分层","tags":["测试金字塔","单元测试","集成测试","系统测试","分层"],"content":"测试金字塔（Test Pyramid）描述测试的分层结构：底层是大量快速、低成本的单元测试（Unit Test），针对函数或类的最小可测试单元；中层是数量适中的集成测试（Integration Test），验证模块之间的接口与交互；顶层是少量高价值的系统测试 / 端到端测试（System / E2E Test），从用户视角验证完整业务流程。越靠下层的测试运行越快、越稳定、定位问题越精确。实践原则是'测试左移'——尽早发现问题，降低修复成本。此外还有验收测试（Acceptance Test），通常由用户或产品负责人执行，确认系统满足业务需求。"},{"id":"KB-DESIGN-001","category":"测试设计技术","title":"等价类划分法","tags":["等价类","有效等价类","无效等价类","测试设计","输入域"],"content":"等价类划分法（Equivalence Partitioning）把程序的输入域划分为若干子集，每个子集内的数据对揭示错误的作用等价，只需从每个子集中选取少数代表性数据作为测试用例。等价类分为有效等价类（符合需求规格、合理的输入集合）和无效等价类（不符合需求、不合理的输入集合）。设计步骤：1) 依据需求划分有效等价类和无效等价类；2) 为每个等价类编号；3) 从每个有效等价类中选取一个代表值组成正向用例；4) 从每个无效等价类中选取代表值组成反向用例。例如：某输入框要求年龄为 18~60 的整数，则有效等价类为 [18,60] 的整数，无效等价类包括小于 18、大于 60、非整数、空值、特殊字符等。"},{"id":"KB-DESIGN-002","category":"测试设计技术","title":"边界值分析法","tags":["边界值","边界","上点","离点","内点","测试设计"],"content":"边界值分析法（Boundary Value Analysis）是对等价类划分的补充，因为错误往往发生在输入域的边界而非内部。实践表明大量缺陷出现在边界及其附近。选取原则：对范围 [a,b]，应测试边界点 a、b，略小于边界的值（a-1）、略大于边界的值（b+1），以及范围内的典型值。相关概念：上点（边界上的点，如 a、b）、离点（离边界最近的点，闭区间取 a-1、b+1，开区间取 a、b）、内点（区间内部的点）。例如输入框允许 1~100 个字符：应测试 0、1、2、99、100、101 个字符的情况。边界值分析对数值、字符长度、集合个数、时间日期、循环次数等场景都适用。"},{"id":"KB-DESIGN-003","category":"测试设计技术","title":"判定表驱动法","tags":["判定表","条件组合","规则","测试设计","多条件"],"content":"判定表驱动法（Decision Table Testing）适合处理多个条件组合决定不同结果的逻辑。判定表由四部分组成：条件桩（列出所有条件）、条件项（各条件的取值，通常是真/假）、动作桩（列出所有可能的操作）、动作项（各条件组合下应执行的动作）。设计步骤：1) 列出所有条件与动作；2) 生成所有条件组合（n 个二值条件有 2^n 种组合）；3) 确定每种组合对应的动作；4) 合并规则（相同动作的组合可合并）；5) 为每条规则设计一条测试用例。典型场景：登录校验中'用户名正确/错误'与'密码正确/错误'的组合决定是否登录成功，可用判定表完整覆盖四种组合，避免遗漏条件组合导致的缺陷。"},{"id":"KB-DESIGN-004","category":"测试设计技术","title":"场景法与基本流备选流","tags":["场景法","基本流","备选流","业务流程","用例场景"],"content":"场景法（Scenario Testing）从用户使用系统的业务流程出发设计测试用例。大多数业务由基本流（Basic Flow，正确操作下完成业务的理想路径）和备选流（Alternative Flow，异常情况或分支操作导致的其他路径）构成。设计步骤：1) 分析业务需求，画出基本流和备选流；2) 根据基本流和备选流组合出不同场景；3) 为每个场景设计测试用例。场景法特别适合验证端到端的业务流程，例如电商下单流程：基本流是'登录→选商品→加入购物车→支付→生成订单'，备选流包括'库存不足'、'支付失败'、'地址为空'等。场景法能发现单一功能测试难以覆盖的流程衔接问题。"},{"id":"KB-DEFECT-001","category":"缺陷管理","title":"缺陷生命周期与状态","tags":["缺陷","Bug","生命周期","状态","缺陷管理"],"content":"缺陷（Defect/Bug）生命周期指缺陷从发现到关闭的完整过程，典型状态包括：新建（New，测试人员发现并提交）、待分配（Assigned，指派给开发人员）、已修复（Fixed，开发人员修复完成）、待验证（Ready for Retest，等待测试人员回归验证）、已关闭（Closed，验证通过关闭）、重新打开（Reopened，验证未通过重新激活）、延迟（Deferred，暂不修复）、拒绝（Rejected，认定为非缺陷）。规范的缺陷报告应包含：缺陷编号、标题、严重程度、优先级、复现步骤、预期结果、实际结果、前置条件、附件（截图/日志）、发现版本、测试环境。清晰的复现步骤和预期/实际结果对比是缺陷报告质量的核心。"},{"id":"KB-DEFECT-002","category":"缺陷管理","title":"缺陷严重程度与优先级","tags":["严重程度","优先级","Severity","Priority","缺陷分级"],"content":"严重程度（Severity）描述缺陷对系统技术影响的大小，一般分为：致命（Critical/Fatal，导致系统崩溃、数据丢失、核心功能完全不可用）、严重（Major，主要功能失效但系统可运行）、一般（Minor，次要功能问题，有替代方案）、轻微（Trivial/UI，界面拼写、布局等外观问题）、建议（Enhancement，改进建议）。优先级（Priority）描述修复的紧急程度，分为高/中/低，由项目经理或产品负责人根据业务影响和发布计划决定。严重程度与优先级相关但不完全相同：一个界面文字错误的严重程度低，但如果出现在首页可能影响品牌形象而优先级较高。测试人员通常建议严重程度，管理人员最终确定优先级。"},{"id":"KB-REQ-001","category":"需求样例","title":"用户登录功能需求","tags":["登录","用户名","密码","认证","需求样例"],"content":"需求描述：系统提供用户登录功能。用户输入用户名（6~20 位字母或数字）和密码（8~20 位，至少包含字母和数字），点击登录按钮提交。用户名或密码为空时提示'用户名或密码不能为空'；格式不符合要求时提示对应格式错误；用户名或密码错误时提示'用户名或密码错误'；连续 5 次密码错误后账号锁定 30 分钟；登录成功跳转到首页并记录登录日志。验证点包括：必填校验、格式校验、正确性校验、密码错误次数限制、账号锁定与解锁、登录成功跳转、日志记录、密码框密文显示。"},{"id":"KB-REQ-002","category":"需求样例","title":"购物车与结算功能需求","tags":["购物车","结算","数量","库存","金额","需求样例"],"content":"需求描述：用户可将商品加入购物车，每件商品可修改购买数量（1~99 的整数）。加入购物车时校验库存，库存不足时提示'库存不足'并限制数量上限。结算时计算商品总价，满 100 元减 10 元，满 200 元减 30 元，优惠只享受一档（取最高档）。结算需选择收货地址，地址为空时提示选择地址。支付成功后生成订单并扣减库存，支付失败时订单状态标记为待支付。验证点包括：数量边界（1、99、0、100）、库存校验、金额计算与优惠档位、地址必填、支付成功/失败分支、库存扣减正确性。"},{"id":"KB-REQ-003","category":"需求样例","title":"文件上传功能需求","tags":["文件上传","格式","大小","上传","需求样例"],"content":"需求描述：系统支持文件上传功能，允许上传 JPG、PNG 格式的图片，单个文件大小不超过 10MB，每次最多上传 5 个文件。不符合格式的文件提示'仅支持 JPG、PNG 格式'；超过大小限制提示'文件大小不能超过 10MB'；超过数量限制提示'最多上传 5 个文件'。上传成功后显示文件列表和缩略图，支持删除已上传文件。上传过程中显示进度条，网络异常时提示上传失败并支持重试。验证点包括：格式校验（合法/非法/大小写扩展名）、大小边界（0、10MB、10MB+1、略小）、数量边界（1、5、6）、进度显示、失败重试、删除功能、同名文件处理。"},{"id":"KB-PRINCIPLE-001","category":"测试原则","title":"软件测试七大原则（ISTQB）","tags":["测试原则","ISTQB","穷尽测试","缺陷聚集","杀虫剂悖论"],"content":"ISTQB 定义的软件测试七大原则：1) 测试显示缺陷存在，而不能证明缺陷不存在；2) 穷尽测试是不可能的，应基于风险和时间进行适度测试；3) 测试应尽早介入（测试左移），越早发现缺陷修复成本越低；4) 缺陷具有聚集性（二八法则），少量模块往往集中了大部分缺陷；5) 杀虫剂悖论——反复执行相同的测试会失去发现新缺陷的能力，需定期评审和更新测试用例；6) 测试依赖于测试上下文，不同类型系统测试方法不同；7) '没有错误就是好的'是谬误，发布决策应基于业务需求与风险评估。"},{"id":"KB-TECH-001","category":"测试技术","title":"接口测试与 HTTP 状态码","tags":["接口测试","API","HTTP","状态码","REST"],"content":"接口测试（API Testing）直接验证应用程序接口，不依赖用户界面。RESTful API 基于 HTTP 协议，常见状态码：200（请求成功）、201（创建成功）、400（请求参数错误）、401（未授权）、403（禁止访问）、404（资源不存在）、405（方法不允许）、409（资源冲突）、422（语义错误）、429（请求过于频繁）、500（服务器内部错误）、502（网关错误）、503（服务不可用）。接口测试要点：验证状态码、响应数据结构与字段、响应时间、边界参数、异常参数、鉴权与权限、数据一致性、幂等性。常用工具包括 Postman、curl、Apifox，也可用代码（Python requests、pytest）实现自动化接口测试。"},{"id":"KB-AUTO-001","category":"测试技术","title":"自动化测试的适用性与分层","tags":["自动化测试","Selenium","Playwright","pytest","CI"],"content":"自动化测试适合：需求稳定、需要频繁回归执行、跨浏览器/平台验证、大量数据驱动测试、性能与负载场景。不适合：需求频繁变动的一次性测试、探索性测试、需要人工判断的易用性测试。常见框架：单元测试 pytest（Python）、JUnit（Java）；Web UI 自动化 Selenium、Playwright、Cypress；移动端 Appium；接口自动化 requests + pytest。自动化测试应纳入持续集成（CI），在代码提交后自动触发。自动化脚本本身也需要维护，遵循页面对象模型（POM）等设计模式降低维护成本。衡量指标包括自动化覆盖率、脚本稳定性、缺陷检出率与投入产出比。"},{"id":"KB-QUALITY-001","category":"质量模型","title":"软件质量特性（ISO 25010）","tags":["质量模型","ISO 25010","功能性","可靠性","易用性","安全性"],"content":"ISO/IEC 25010 质量模型定义了软件产品质量特性：功能性（Functionality，功能完备性、正确性、适合性）、性能效率（Performance Efficiency，响应时间、吞吐量、资源利用率）、兼容性（Compatibility，共存性、互操作性）、易用性（Usability，可学习性、可操作性、用户界面美观）、可靠性（Reliability，成熟性、容错性、可恢复性）、安全性（Security，机密性、完整性、抗抵赖性、可审计性）、可维护性（Maintainability，模块化、可重用性、可测试性）、可移植性（Portability，适应性、可安装性）。测试应覆盖这些质量维度，其中安全性测试和性能测试是功能测试之外的重要补充。"},{"id":"KB-API-001","category":"接口测试","title":"RESTful API 测试要点与 HTTP 状态码","tags":["接口测试","API","REST","HTTP","状态码","幂等"],"content":"接口测试绕过 UI 直接验证服务端接口，关注请求方法、路径、参数、鉴权、响应码、响应体与数据一致性。RESTful 常见状态码：200 成功、201 创建成功、204 无内容、400 参数错误、401 未认证、403 无权限、404 不存在、409 冲突、422 语义错误、429 限流、500 服务端错误。测试要点：1) 正常参数返回正确数据；2) 边界与非法参数被拦截；3) 鉴权缺失或过期返回 401/403；4) 幂等性——相同幂等键重复提交应返回同一结果，不产生重复数据；5) 响应字段类型与结构符合契约；6) 异常时不产生脏数据。常用工具 Postman、Apifox、curl，或 requests + pytest 编写自动化脚本。"},{"id":"KB-API-002","category":"接口测试","title":"接口幂等性与重复提交","tags":["幂等性","重复提交","支付","订单","接口测试"],"content":"幂等性指同一操作执行一次与多次对系统状态的影响相同。在支付、下单、退款等资金敏感场景至关重要。实现方式：客户端生成唯一幂等键（Idempotency-Key）随请求提交，服务端以该键作为唯一约束，重复请求直接返回首次结果而非重复处理。测试要点：1) 使用相同幂等键连续提交两次，校验只产生一条业务记录；2) 两次响应中的业务单号一致；3) 不同幂等键正常创建新记录；4) 并发场景下的幂等（多线程同时提交同一键）；5) 幂等键过期策略是否符合需求。缺陷表现常为重复扣款、重复订单、库存重复扣减，属于致命级别。"},{"id":"KB-API-003","category":"接口测试","title":"接口鉴权：签名与 Token 校验","tags":["鉴权","签名","Token","JWT","越权","安全测试"],"content":"接口鉴权验证调用者身份与权限。常见机制：HMAC 签名（请求参数按规则排序后用密钥生成签名，服务端校验）、Token/JWT（登录后颁发令牌，后续请求携带）、OAuth2。测试要点：1) 缺少签名或 Token 返回 401；2) 篡改任一参数导致签名校验失败；3) 使用过期 Token 被拒绝；4) 越权测试——用 A 用户的 Token 访问 B 用户的资源应返回 403（水平越权），普通用户访问管理员接口应被拒绝（垂直越权）；5) 重放攻击——截获合法请求重复发送是否被拒绝（时间戳+nonce 防重放）；6) 密钥不应出现在请求响应明文中。鉴权缺陷多属严重或致命级别。"},{"id":"KB-SEC-001","category":"安全测试","title":"SQL 注入与 XSS 跨站脚本","tags":["SQL注入","XSS","安全测试","注入","脚本攻击"],"content":"SQL 注入指在输入中拼接恶意 SQL 片段，若服务端未做参数化查询，可能导致数据泄露、篡改或删库。测试方法：在输入框、URL 参数、请求头中注入 ' OR '1'='1、UNION SELECT 等载荷，观察是否返回异常数据或报错堆栈。XSS（跨站脚本）指把恶意脚本注入页面并在其他用户浏览器执行，分为反射型、存储型、DOM 型。测试方法：输入 <script>alert(1)</script>、<img src=x onerror=alert(1)> 等，检查是否被原样输出执行。防护验证：服务端应做输入校验与转义、使用参数化查询、设置 CSP 与 HttpOnly Cookie。安全测试应覆盖所有用户输入入口，包括看似无害的搜索框和文件名。"},{"id":"KB-SEC-002","category":"安全测试","title":"越权访问与敏感信息保护","tags":["越权","权限","敏感信息","安全测试","密文"],"content":"越权分为水平越权（同角色用户之间访问彼此数据，如修改订单 ID 查看他人订单）与垂直越权（低权限用户访问高权限功能，如普通用户调用管理接口）。测试方法：准备两个不同权限账号，交叉替换请求中的用户标识、资源 ID、角色参数，观察是否能访问未授权数据。敏感信息保护要点：1) 密码、身份证、银行卡号等应密文存储与展示（前端掩码如 ****1234）；2) 接口响应不应返回多余字段（如返回用户对象时剔除密码哈希）；3) 日志中不应打印敏感明文；4) 错误提示不泄露系统内部信息（如具体 SQL、堆栈）。这类缺陷往往导致数据泄露，属致命级别。"},{"id":"KB-PERF-001","category":"性能测试","title":"性能测试指标：响应时间、并发与吞吐量","tags":["性能测试","响应时间","并发","TPS","吞吐量","负载"],"content":"性能测试验证系统在不同负载下的响应能力。核心指标：响应时间（请求发出到收到响应的耗时，常用平均、P90、P95、P99 分位值）、并发用户数（同时向系统发起请求的虚拟用户数）、吞吐量/TPS（每秒处理的事务数）、资源利用率（CPU、内存、磁盘 IO、网络）。常见类型：基准测试（单用户基线）、负载测试（逐步加压到预期负载）、压力测试（加压到超出预期直至瓶颈）、稳定性测试（长时间稳定运行，如 8 小时）。测试要点：确定性能验收标准（如 P95 响应时间 ≤ 2 秒、TPS ≥ 500、CPU ≤ 70%），使用 JMeter、Locust 等工具施压，监控服务端资源，定位瓶颈（慢 SQL、锁竞争、缓存命中率低）。"},{"id":"KB-PERF-002","category":"性能测试","title":"数据一致性与幂等重跑","tags":["数据一致性","幂等","重跑","指标","数据测试"],"content":"数据类系统（报表、指标、数仓）的测试重点是数据一致性与计算正确性。数据一致性指同一业务事实在不同存储或视图中保持一致，如订单金额与支付流水、账户余额与交易明细必须能对账。测试方法：构造源数据，执行计算任务，比对结果与独立计算的期望值；跨表核对汇总值与明细值。幂等重跑指同一批次任务重复执行结果应完全一致，不产生重复计数或重复记录——测试方法：记录首次结果，重跑任务后再次比对，检查数据行数与关键指标是否一致。还要验证异常恢复：任务中途失败后重试，不应产生部分写入的脏数据。时效性是另一要点，如实时指标要求延迟不超过规定秒数。"},{"id":"KB-PROC-001","category":"测试流程","title":"测试计划与测试策略","tags":["测试计划","测试策略","范围","准入准出","里程碑"],"content":"测试计划定义测试的范围、目标、资源、进度与风险。核心内容：1) 测试范围——明确测什么（功能模块、质量维度）与不测什么；2) 测试策略——采用的测试类型（功能/接口/性能/安全/兼容）、测试层级（单元/集成/系统/验收）、自动化比例；3) 准入标准（Entry Criteria）——进入测试执行的前提，如需求已评审、提测版本可部署、用例已评审；4) 准出标准（Exit Criteria）——可以发布的条件，如用例执行率 100%、通过率 ≥ 95%、致命与严重缺陷全部关闭；5) 资源与进度安排；6) 风险与应对。测试计划是测试活动的纲领文件，也是向干系人汇报的依据。"},{"id":"KB-PROC-002","category":"测试流程","title":"用例评审与缺陷管理流程","tags":["用例评审","缺陷流程","状态流转","回归测试","冒烟测试"],"content":"用例评审由测试负责人、产品、开发共同参与，检查用例是否覆盖需求、步骤是否清晰、预期是否可判定，评审通过的用例才能纳入基线。缺陷管理流程：测试发现缺陷→提交（含复现步骤、预期/实际结果、严重程度）→指派开发→开发修复→测试回归验证→通过则关闭，不通过则重新打开。缺陷状态：新建、待分配、已修复、待验证、已关闭、重新打开、延迟、拒绝。冒烟测试（Smoke Test）在版本提测后先执行一组核心用例，快速判断版本是否可测——若冒烟失败直接打回，避免浪费测试资源。回归测试在缺陷修复或版本迭代后执行，验证修改未影响既有功能，可选取核心用例集或全量执行。"},{"id":"KB-PROC-003","category":"测试流程","title":"质量门禁与发布决策","tags":["质量门禁","发布决策","覆盖率","通过率","质量报告"],"content":"质量门禁是在发布前设置的一组量化准入门槛，只有全部达标才允许发布。常见门禁指标：需求覆盖率（有对应用例的需求占比，目标 ≥90%）、用例评审率（目标 ≥80%）、执行通过率（目标 ≥95%）、致命与严重缺陷未关闭数为 0、自动化测试通过率 100%。质量报告汇总这些指标并展示趋势，为发布决策提供客观依据。若门禁未达标，需评估风险：是否是边缘场景、是否有规避方案、是否可延期修复。发布决策不应仅凭'没有严重缺陷'，而应结合业务需求、用户影响面与剩余风险综合判断——这正是 ISTQB 原则'没有错误不等于高质量'的体现。"},{"id":"KB-REQ-004","category":"需求样例","title":"支付下单接口需求","tags":["支付","下单","接口","幂等","金额","需求样例"],"content":"需求描述：系统提供创建支付单接口 POST /api/v1/payments。请求参数包含订单号、金额（单位分，正整数）、支付方式、幂等键、签名。金额必须大于 0 且不超过单笔限额 1000000 分。请求需携带有效签名，签名错误返回 401。相同幂等键重复提交返回同一支付单号，不产生重复扣款。创建成功返回 201 与支付单号，支付单状态为待支付。验证点：正常创建、金额边界（0、1、1000000、1000001）、签名缺失/错误、幂等重复提交、并发幂等、支付方式枚举值校验、响应字段结构。"},{"id":"KB-REQ-005","category":"需求样例","title":"退款与对账需求","tags":["退款","对账","金额","资金","需求样例"],"content":"需求描述：系统支持全额退款与部分退款，退款金额必须大于 0 且不得超过原支付金额，超出时拒绝并提示。退款成功后原订单状态更新为已退款（全额）或部分退款，资金原路退回。T+1 日生成前一日对账单，支付流水与退款流水需能对平，差异记录进入异常池并告警。验证点：全额退款、部分退款、退款金额边界（0、原金额、原金额+0.01）、重复退款拦截、退款状态流转、对账数据一致性、异常差异识别、资金流水正确性。"},{"id":"KB-REQ-006","category":"需求样例","title":"优惠券叠加规则需求","tags":["优惠券","满减","折扣","叠加","需求样例"],"content":"需求描述：订单结算时可使用优惠券。满减券（满 100 减 10、满 200 减 30）与折扣券不可叠加使用，同一订单仅可使用一张优惠券，系统自动选择优惠金额最高的一档。过期优惠券不可使用并提示'优惠券已过期'。不满足门槛的优惠券不可使用。验证点：单张满减券计算、多档取最高、折扣券单独使用、两张券叠加被拒绝、过期券拦截、门槛不足拦截、优惠金额与订单金额计算正确性。"},{"id":"KB-REQ-007","category":"需求样例","title":"实时指标计算需求","tags":["指标","GMV","时效性","幂等","数据","需求样例"],"content":"需求描述：系统按分钟聚合 GMV 与订单量指标，数据延迟不超过 90 秒。支持按渠道维度下钻查询。同一批次数据重跑结果必须一致（幂等），不得产生重复计数。当源数据修正后，重跑应覆盖旧结果而非追加。验证点：指标计算正确性（与源流水比对）、时效性（延迟 ≤90 秒）、渠道维度拆分正确性、重跑幂等、数据修正后的覆盖更新、异常数据（空值、负数）处理。"}];
const DEMO = {"users":[{"id":"U-001","username":"li.wei","name":"李伟","role":"测试经理","team":"质量保障部","status":"active"},{"id":"U-002","username":"zhang.min","name":"张敏","role":"高级测试工程师","team":"质量保障部","status":"active"},{"id":"U-003","username":"chen.hao","name":"陈昊","role":"测试工程师","team":"质量保障部","status":"active"},{"id":"U-004","username":"wang.fang","name":"王芳","role":"产品经理","team":"产品中心","status":"active"},{"id":"U-005","username":"zhao.lei","name":"赵磊","role":"开发工程师","team":"研发中心","status":"active"}],"projects":[{"id":"P-001","code":"MALL","name":"星云商城 V3.0","description":"电商交易平台迭代，覆盖商品、购物车、订单、支付主链路","status":"active","owner":"李伟","priority":"P0","created_at":"2026-09-01"},{"id":"P-002","code":"PAY","name":"智联支付平台","description":"聚合支付与清结算系统，安全与资金正确性为测试重点","status":"active","owner":"张敏","priority":"P0","created_at":"2026-09-15"},{"id":"P-003","code":"DATA","name":"数据中台 2.0","description":"指标计算与报表服务，重点验证数据一致性与性能","status":"active","owner":"陈昊","priority":"P1","created_at":"2026-10-08"}],"requirements":[{"id":"R-001","project_id":"P-001","code":"REQ-MALL-01","title":"用户登录与认证","description":"用户名6-20位字母或数字，密码8-20位含字母和数字；空值/格式错误提示；连续5次错误锁定30分钟；成功跳转首页并记录日志；密码密文显示。","priority":"高","status":"已评审","source":"PRD v3.2","created_at":"2026-09-03"},{"id":"R-002","project_id":"P-001","code":"REQ-MALL-02","title":"购物车与结算","description":"商品数量1-99整数，校验库存；满100减10、满200减30取最高档；地址必选；支付成功生成订单扣库存，失败标记待支付。","priority":"高","status":"已评审","source":"PRD v3.2","created_at":"2026-09-03"},{"id":"R-003","project_id":"P-001","code":"REQ-MALL-03","title":"文件上传（商品图）","description":"支持JPG/PNG，单文件≤10MB，每次≤5个；格式/大小/数量超限分别提示；显示进度，失败可重试，支持删除。","priority":"中","status":"已评审","source":"PRD v3.2","created_at":"2026-09-05"},{"id":"R-004","project_id":"P-001","code":"REQ-MALL-04","title":"优惠券叠加规则","description":"满减券与折扣券不可叠加；同一订单仅可使用一张优惠券；过期券不可使用并给出提示。","priority":"中","status":"待评审","source":"运营需求池","created_at":"2026-10-20"},{"id":"R-005","project_id":"P-002","code":"REQ-PAY-01","title":"支付下单接口","description":"POST /api/v1/payments 创建支付单，金额单位为分，需校验签名与幂等键；重复幂等键返回同一订单；金额>0且≤单笔限额。","priority":"高","status":"已评审","source":"接口规范 v1.4","created_at":"2026-09-16"},{"id":"R-006","project_id":"P-002","code":"REQ-PAY-02","title":"退款与对账","description":"支持全额/部分退款，退款金额不得超过原支付金额；T+1 自动生成对账单，差异记录进入异常池。","priority":"高","status":"已评审","source":"接口规范 v1.4","created_at":"2026-09-18"},{"id":"R-007","project_id":"P-003","code":"REQ-DATA-01","title":"实时指标计算","description":"GMV/订单量按分钟聚合，延迟不超过90秒；数据重跑幂等，结果一致；支持按渠道维度下钻。","priority":"中","status":"已评审","source":"数据需求 v2.0","created_at":"2026-10-10"}],"cases":[{"id":"TC-001","project_id":"P-001","requirement_id":"R-001","title":"合法账号密码登录成功","type":"positive","priority":"高","precondition":"用户已注册且账号未锁定","steps":["输入合法用户名 test_user01","输入正确密码 Abc12345","点击登录"],"expected":"登录成功跳转首页，记录登录日志，密码框为密文","confidence":0.96,"needs_review":false,"review_status":"approved","execution_status":"pass","assignee":"张敏"},{"id":"TC-002","project_id":"P-001","requirement_id":"R-001","title":"用户名/密码为空校验","type":"validation","priority":"高","precondition":"进入登录页","steps":["用户名留空输入密码","提交","清空密码输入用户名后再提交"],"expected":"提示'用户名或密码不能为空'，不发起登录请求","confidence":0.93,"needs_review":false,"review_status":"approved","execution_status":"pass","assignee":"张敏"},{"id":"TC-003","project_id":"P-001","requirement_id":"R-001","title":"连续5次密码错误账号锁定","type":"security","priority":"高","precondition":"测试账号处于未锁定状态","steps":["连续5次输入错误密码","第6次输入正确密码"],"expected":"第5次后账号锁定30分钟，第6次提示账号已锁定","confidence":0.89,"needs_review":false,"review_status":"approved","execution_status":"fail","assignee":"陈昊"},{"id":"TC-004","project_id":"P-001","requirement_id":"R-001","title":"用户名长度边界值 6/20 位","type":"boundary","priority":"中","precondition":"进入登录页","steps":["输入5位用户名","输入6位合法用户名","输入20位合法用户名","输入21位用户名"],"expected":"5位与21位被拒绝并提示格式错误，6位与20位通过校验","confidence":0.84,"needs_review":false,"review_status":"approved","execution_status":"pass","assignee":"陈昊"},{"id":"TC-005","project_id":"P-001","requirement_id":"R-002","title":"购物车数量边界 1/99","type":"boundary","priority":"中","precondition":"商品库存充足","steps":["数量设为0","设为1","设为99","设为100"],"expected":"0与100被拦截，1与99正常加入购物车","confidence":0.87,"needs_review":false,"review_status":"approved","execution_status":"pass","assignee":"张敏"},{"id":"TC-006","project_id":"P-001","requirement_id":"R-002","title":"满减优惠取最高档","type":"business","priority":"高","precondition":"购物车商品总额250元","steps":["进入结算页","查看优惠金额","提交订单"],"expected":"仅减30元（最高档），订单金额220元","confidence":0.91,"needs_review":false,"review_status":"approved","execution_status":"fail","assignee":"张敏"},{"id":"TC-007","project_id":"P-001","requirement_id":"R-002","title":"支付失败订单状态为待支付","type":"negative","priority":"高","precondition":"可模拟支付网关失败","steps":["提交订单","模拟支付网关返回失败"],"expected":"订单状态为待支付，库存不扣减，无脏数据","confidence":0.82,"needs_review":false,"review_status":"reviewed","execution_status":"untested","assignee":"陈昊"},{"id":"TC-008","project_id":"P-001","requirement_id":"R-003","title":"上传超限10MB文件被拒绝","type":"boundary","priority":"中","precondition":"准备10MB+1字节的PNG文件","steps":["选择该文件上传","观察提示"],"expected":"提示'文件大小不能超过10MB'，文件未上传","confidence":0.79,"needs_review":true,"review_status":"draft","execution_status":"untested","assignee":"陈昊"},{"id":"TC-009","project_id":"P-001","requirement_id":"R-004","title":"优惠券不可叠加","type":"business","priority":"中","precondition":"用户持满减券与折扣券各一张","steps":["同时选择两张券","提交结算"],"expected":"系统拒绝叠加并提示仅可使用一张","confidence":0.68,"needs_review":true,"review_status":"draft","execution_status":"untested","assignee":"—"},{"id":"TC-010","project_id":"P-002","requirement_id":"R-005","title":"创建支付单正常流程","type":"positive","priority":"高","precondition":"签名密钥有效","steps":["POST /api/v1/payments 携带合法参数与签名","校验响应"],"expected":"返回201与支付单号，状态为待支付","confidence":0.94,"needs_review":false,"review_status":"approved","execution_status":"pass","assignee":"张敏"},{"id":"TC-011","project_id":"P-002","requirement_id":"R-005","title":"重复幂等键返回同一订单","type":"business","priority":"高","precondition":"已有支付单","steps":["使用相同幂等键重复提交两次"],"expected":"两次返回同一支付单号，未产生重复扣款","confidence":0.9,"needs_review":false,"review_status":"approved","execution_status":"pass","assignee":"张敏"},{"id":"TC-012","project_id":"P-002","requirement_id":"R-005","title":"无效签名被拒绝","type":"security","priority":"高","precondition":"构造错误签名","steps":["携带错误签名调用创建支付单接口"],"expected":"返回401，不创建任何订单","confidence":0.88,"needs_review":false,"review_status":"approved","execution_status":"pass","assignee":"陈昊"},{"id":"TC-013","project_id":"P-002","requirement_id":"R-006","title":"部分退款金额校验","type":"boundary","priority":"高","precondition":"存在100元已支付订单","steps":["申请退款100元","申请退款100.01元"],"expected":"100元退款成功；100.01元被拒绝并提示超出可退金额","confidence":0.86,"needs_review":false,"review_status":"reviewed","execution_status":"fail","assignee":"张敏"},{"id":"TC-014","project_id":"P-003","requirement_id":"R-007","title":"GMV按分钟聚合延迟<90秒","type":"business","priority":"中","precondition":"有实时交易流水","steps":["产生交易","等待80秒查询指标"],"expected":"GMV指标已更新且与流水一致，延迟不超过90秒","confidence":0.81,"needs_review":false,"review_status":"approved","execution_status":"pass","assignee":"陈昊"},{"id":"TC-015","project_id":"P-003","requirement_id":"R-007","title":"指标重跑结果幂等","type":"negative","priority":"中","precondition":"同一批次数据","steps":["执行两次重跑任务","对比两次结果"],"expected":"两次结果完全一致，无重复计数","confidence":0.77,"needs_review":true,"review_status":"draft","execution_status":"untested","assignee":"—"}],"plans":[{"id":"PL-001","project_id":"P-001","name":"V3.0 回归测试计划","description":"覆盖登录、购物车、结算主链路的系统回归","start_date":"2026-11-10","end_date":"2026-11-25","status":"执行中","owner":"李伟"},{"id":"PL-002","project_id":"P-002","name":"支付接口安全专项","description":"签名、幂等、越权与资金正确性专项测试","start_date":"2026-11-12","end_date":"2026-11-22","status":"执行中","owner":"张敏"},{"id":"PL-003","project_id":"P-003","name":"数据中台性能验收","description":"指标时效性与一致性验收","start_date":"2026-11-18","end_date":"2026-11-30","status":"待执行","owner":"陈昊"}],"planCases":[{"plan_id":"PL-001","case_id":"TC-001"},{"plan_id":"PL-001","case_id":"TC-002"},{"plan_id":"PL-001","case_id":"TC-003"},{"plan_id":"PL-001","case_id":"TC-004"},{"plan_id":"PL-001","case_id":"TC-005"},{"plan_id":"PL-001","case_id":"TC-006"},{"plan_id":"PL-001","case_id":"TC-007"},{"plan_id":"PL-001","case_id":"TC-008"},{"plan_id":"PL-002","case_id":"TC-010"},{"plan_id":"PL-002","case_id":"TC-011"},{"plan_id":"PL-002","case_id":"TC-012"},{"plan_id":"PL-002","case_id":"TC-013"},{"plan_id":"PL-003","case_id":"TC-014"},{"plan_id":"PL-003","case_id":"TC-015"}],"executions":[{"id":"EX-001","plan_id":"PL-001","case_id":"TC-001","result":"pass","actual":"登录成功，跳转首页正确","executor":"张敏","executed_at":"2026-11-12 10:23"},{"id":"EX-002","plan_id":"PL-001","case_id":"TC-002","result":"pass","actual":"空值提示正确","executor":"张敏","executed_at":"2026-11-12 10:31"},{"id":"EX-003","plan_id":"PL-001","case_id":"TC-003","result":"fail","actual":"锁定30分钟后第6次仍提示密码错误，未提示锁定","executor":"陈昊","executed_at":"2026-11-13 14:05"},{"id":"EX-004","plan_id":"PL-001","case_id":"TC-004","result":"pass","actual":"边界校验符合预期","executor":"陈昊","executed_at":"2026-11-13 14:20"},{"id":"EX-005","plan_id":"PL-001","case_id":"TC-005","result":"pass","actual":"数量边界正确","executor":"张敏","executed_at":"2026-11-14 09:40"},{"id":"EX-006","plan_id":"PL-001","case_id":"TC-006","result":"fail","actual":"250元订单同时享受满100减10与满200减30，共减40元","executor":"张敏","executed_at":"2026-11-14 11:12"},{"id":"EX-007","plan_id":"PL-002","case_id":"TC-010","result":"pass","actual":"返回201，单号正确","executor":"张敏","executed_at":"2026-11-13 16:30"},{"id":"EX-008","plan_id":"PL-002","case_id":"TC-011","result":"pass","actual":"幂等生效，无重复订单","executor":"张敏","executed_at":"2026-11-13 16:45"},{"id":"EX-009","plan_id":"PL-002","case_id":"TC-012","result":"pass","actual":"返回401","executor":"陈昊","executed_at":"2026-11-14 10:15"},{"id":"EX-010","plan_id":"PL-002","case_id":"TC-013","result":"fail","actual":"退款100.01元未被拦截，产生超额退款","executor":"张敏","executed_at":"2026-11-15 15:50"},{"id":"EX-011","plan_id":"PL-003","case_id":"TC-014","result":"pass","actual":"延迟72秒，数据一致","executor":"陈昊","executed_at":"2026-11-18 09:20"}],"defects":[{"id":"BUG-001","project_id":"P-001","case_id":"TC-003","title":"账号锁定30分钟后仍提示密码错误","description":"连续5次错误后账号锁定，但解锁时间到达后输入正确密码仍提示密码错误，需重新设置密码才能登录。","severity":"严重","priority":"高","status":"已修复待验证","assignee":"赵磊","reporter":"陈昊","created_at":"2026-11-13","resolved_at":""},{"id":"BUG-002","project_id":"P-001","case_id":"TC-006","title":"满减优惠重复叠加导致金额计算错误","description":"订单金额250元时同时命中满100减10与满200减30，实际减40元，预期仅减30元。涉及资金计算，影响面大。","severity":"致命","priority":"高","status":"新建","assignee":"赵磊","reporter":"张敏","created_at":"2026-11-14","resolved_at":""},{"id":"BUG-003","project_id":"P-002","case_id":"TC-013","title":"部分退款金额超出原支付金额未被拦截","description":"对100元订单申请退款100.01元，接口返回成功，产生超额退款，存在资金风险。","severity":"致命","priority":"高","status":"重新打开","assignee":"赵磊","reporter":"张敏","created_at":"2026-11-15","resolved_at":"2026-11-16"},{"id":"BUG-004","project_id":"P-001","case_id":"TC-008","title":"上传10MB以上文件提示文案不统一","description":"提示文案为'文件过大'，与需求规定的'文件大小不能超过10MB'不一致。","severity":"轻微","priority":"低","status":"已关闭","assignee":"赵磊","reporter":"陈昊","created_at":"2026-11-10","resolved_at":"2026-11-12"},{"id":"BUG-005","project_id":"P-001","case_id":"TC-004","title":"用户名20位边界输入被截断","description":"输入20位合法用户名时前端截断为19位，后端仍校验通过。","severity":"一般","priority":"中","status":"已关闭","assignee":"赵磊","reporter":"陈昊","created_at":"2026-11-08","resolved_at":"2026-11-11"}],"auditLogs":[{"id":"AL-001","actor":"李伟","action":"创建测试计划","entity":"PL-003","detail":"数据中台性能验收","timestamp":"2026-11-18 08:55","ip":"10.12.3.41"},{"id":"AL-002","actor":"张敏","action":"提交缺陷","entity":"BUG-003","detail":"重新打开：部分退款金额未被拦截","timestamp":"2026-11-16 09:32","ip":"10.12.3.52"},{"id":"AL-003","actor":"陈昊","action":"执行用例","entity":"TC-011","detail":"结果：通过","timestamp":"2026-11-13 16:45","ip":"10.12.3.63"},{"id":"AL-004","actor":"张敏","action":"评审用例","entity":"TC-006","detail":"评审通过，优先级：高","timestamp":"2026-11-11 14:10","ip":"10.12.3.52"},{"id":"AL-005","actor":"李伟","action":"导入需求","entity":"R-007","detail":"来源：数据需求 v2.0","timestamp":"2026-11-10 11:20","ip":"10.12.3.41"},{"id":"AL-006","actor":"系统","action":"RAG 生成用例","entity":"TC-009","detail":"置信度 0.68，已标记人工复核","timestamp":"2026-11-09 16:48","ip":"127.0.0.1"}]};
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
  const feat=String(title||"").trim();
  const cit=e=>({id:e.id,title:e.title,category:e.category,content:e.content});
  function add(type,t,pre,steps,exp,bi=0,adj=0,priority){
    const b=usable[Math.min(bi,usable.length-1)];
    const conf=Math.max(0,Math.min(1,b.confidence+adj));
    const pri=priority||(["positive","business","security","idempotency","consistency"].includes(type)?"高":"中");
    cases.push({id:"TC-"+String(cases.length+1).padStart(3,"0"),type,type_label:TYPES[type],title:feat?feat+"｜"+t:t,priority:pri,
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
    hallucination_guard:"passed",signals_detected:[...sig].sort(),priority_mix:priMix,engine_version:"2.0.1"}};
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
      {key:"coverage",name:"需求覆盖率",value:coverage,target:90,unit:"%",passed:coverage>=90},
      {key:"review",name:"用例评审率",value:cases.length?+(reviewed/cases.length*100).toFixed(1):0,target:80,unit:"%",passed:cases.length?reviewed/cases.length>=0.8:false},
      {key:"pass_rate",name:"执行通过率",value:passRate,target:95,unit:"%",passed:passRate>=95},
      {key:"critical_open",name:"致命/严重未关闭",value:critical,target:0,unit:"个",passed:critical===0}
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
