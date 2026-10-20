# 报告版本与复核使用说明

本文说明当前版本、编辑、批准及冲突处理契约。报告用于研究流程；
人工批准不等于临床有效性验证，也不是经过身份认证的电子签名。

## 当前稿、历史快照和版本号

Report 保存当前正文、生成方式、状态与批准信息；ReportVersion 保存
报告操作追加的历史快照。

| 接口 | 结果 |
| --- | --- |
| GET /api/reports/{id} | 当前稿、真实 version、contentHash、批准信息 |
| GET /api/reports/{id}/versions | currentVersion、当前 contentHash/status、版本升序的 items |
| GET /api/studies/{study_id} | bundle 中 reports 使用相同的真实版本/哈希序列化 |

尚无快照的初始报告为 **v0**。首次编辑、修订、AI 重生成或批准前，
先保存原稿为 v1，再追加结果为 v2，随后按操作追加版本。例如：
初稿 v0 → 批准稿 v2 → 人工修订稿 v3 → 再批准稿 v4。
对已批准的当前版本重复批准不追加快照；提交旧版本仍返回冲突。

contentHash 是正文按排序键、紧凑 JSON 编码计算的 SHA-256，不包含
顶层批准状态、批准人或版本号。因此批准可增加版本号而不改变正文哈希。
哈希不能代替版本号，也不是数字签名。

历史项包含正文、生成方式/模型、editedBy、reason、contentHash、createdAt。
编辑和批准不会覆盖旧快照。该保证限于报告工作流：当前流水线重跑会
替换派生记录及 Report，不能据此承诺跨重跑永久留存，也不能替代备份
或长期病例归档。

## 生成语言与历史兼容

生成报告的 HTTP 请求支持查询参数 `?lang=en` 或 `?lang=zh`，省略时默认 en，
不读取 `Accept-Language`。适用上传、演示检查、选择序列、流水线重跑、
AI 草稿以及公开 NIfTI 导入；后台任务会保存本次选择的语言。
其他值（包括 zh-CN）返回 HTTP 400，detail 为
`{"code":"INVALID_LANG","params":{"lang":"<value>"}}`。

新模板、AI 草稿及 AI 失败后的模板回退均写入 `content.lang` 和
`content.provenance.lang`。语言及正文在生成保存的版本中固定；读取、
批准或切换界面语言不会重新翻译。重新生成可以显式选择另一种语言，
其结果成为新版本，旧快照仍保留原文及语言。

既有报告的 legacy `content.language` 字段兼容保留；读取不会删除、
自动重命名或据此补写 lang。没有语言字段的旧正文也按保存内容返回。
新生成使用 lang，不再额外生成旧 language 字段。
修订接口提交完整正文时，应连同原文保留既有语言/来源元数据；它不是翻译接口。
语言字段属于 content，受内容哈希及快照约束，不能仅切换标签便将旧正文
当作另一语言的新稿。自定义名称、来源元数据和人工文字也不保证自动翻译。

## 写入契约

请求为 JSON；版本号必须是非负整数，哈希若提供必须为 64 位小写十六进制。

| 接口 | 必填字段 | 可选字段及规则 |
| --- | --- | --- |
| PATCH /api/reports/{id} | content、baseVersion | baseContentHash、actor、reason；已批准稿禁止直接覆盖 |
| POST /api/reports/{id}/amend | content、baseVersion、reason | baseContentHash、actor；原因去空白后不可为空，最长 1000 字符 |
| POST /api/reports/{id}/approve | baseVersion、baseContentHash | approvedBy；缺省使用服务端 DEFAULT_ACTOR |
| POST /api/studies/{study_id}/reports/{id}/approve | 同上 | 先校验检查归属，再调用同一批准服务 |

编辑/修订接口的哈希在服务端为可选，客户端应同时传递版本与哈希；
批准两者均必填，兼容 URL 也不接受缺少版本参数的旧请求。
content 是完整正文对象，不是局部补丁。不要把报告响应的 status、version、
approvedBy 等字段混入编辑请求。

客户端应把**用户实际查看的正文**及对应版本/哈希一起保存为编辑基线。
不能仅刷新版本号就继续提交旧正文。冲突后重新读取当前稿，让用户核对、
合并修改，再使用新基线重试。

## 状态与复核

- 模板和 AI 新稿为 draft。
- 人工编辑/修订为 clinician_reviewed，表示已编辑，仍需批准。顶层
  generator 为 human，model/promptVersion 清空。
- 修订和 AI 重生成清除当前 approvedBy/approvedAt；历史批准快照保留。
- sections、impression、recommendations 中仍有 needs_review 时禁止批准。
- 界面支持逐条修改、填写修订原因及显式核对证据；修改文字不会自动
  消除待复核标记。
- actor/approvedBy 是研究客户端提供的标签，缺省使用配置值，不是已认证
  医生身份。历史快照/审计链不构成防篡改存储或临床签名保证。

AI 生成前记录版本/哈希/状态，保存时复查；期间出现修改、批准或更新报告
则返回 409。没有已有流水线报告时也返回 409。模板回退同样是新草稿，
需重新复核。参见 [AI 报告说明](ai-reporting.md)。

## 错误处理

| 状态码 | 常见原因 | 处理 |
| --- | --- | --- |
| 400 | 生成请求的 lang 不是 en/zh | 使用合法查询值，或省略以采用 en |
| 404 | 报告不存在或检查归属不符 | 重新选择检查/报告 |
| 422 | 必填字段缺失、格式错误、原因或批准人为空白 | 修正请求 |
| 409 | 版本/哈希过期、并发冲突、已批准稿被 PATCH、复核项未解决 | 读取 detail，刷新并核对；修改批准稿使用 amend |

写入在数据库写锁内复查版本及提供的哈希，正文、快照和审计一起提交，
冲突时回滚。保存成功后界面先采用返回的新稿；其他数据刷新失败会单独
提示，不能继续把旧批准状态视作当前状态。

## 验证与研究边界

server/tests/test_report_versions.py 覆盖基线/哈希、批准后修订、过期与并发
写保护及复核门禁；server/tests/test_api.py 覆盖兼容批准与 bundle 一致性；
server/tests/test_ai_report.py 覆盖生成冲突、证据校验、回退和 SDK 请求契约；
server/tests/test_i18n.py 覆盖语言选择、默认值、非法值及已存报告的读取行为。

这些验证软件行为。AI 服务使用模拟响应，未验证真实云模型调用；掩膜测量、
参考配准、模型准确性和临床结论需要独立验证。测试通过、界面批准或研究
标签都不能作为临床可用性证明。
