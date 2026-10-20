# 架构

[English](architecture.md)

## 范围与运行环境

CardioScope Pro 是研究型影像工作站，已实现 DICOM 入库、公开 NIfTI 影像/标签
导入、预览体数据、标签派生网格与测量、研究型配准/纵向比较，以及带版本的
结构化报告。临床诊断、经过验证的狭窄分级、FFR-CT、单时相 EF、灌注和
介入导航均不属于已验证能力。

```text
React / Vite / three.js → 同源 /api → FastAPI
  ├── SQLite + 本地文件系统
  ├── 进程内后台任务
  ├── DICOM / NIfTI / 分割 / 网格 / 测量处理
  ├── 研究型图谱配准与纵向比较
  └── 模板报告 + 可选 Claude 草稿 + 复核与版本历史
```

Postgres、S3 兼容存储、Redis/RQ worker 和生产身份/访问控制属于部署目标。
当前 Compose 配置使用 SQLite、本地存储和合成分割适配器。构建成功不代表
已经具备部署条件或模型运行能力。

## 处理路径

**DICOM：** 检查、分组和评分上传序列 → 必要时确认选择 → 留存元数据去标识、
UID 重映射 → 像素解码并转换为 HU → 体素轴重定向与重采样 → 预览 →
适用时执行分割 → 网格/测量 → 确定性模板草稿。

合成检查使用夹具真值掩膜，不执行模型推理。真实上传使用显式选择的
TotalSegmentator 适配器，否则记录跳过分割，并将不支持的测量标为
`not_computed`。适配器实现 `heartchambers_highres`，需要上游任务许可和
运行资源，并检查必需的输出掩膜。检测到安装包不代表权重可用、推理成功
或已经完成临床验证。

**公开 NIfTI：** 验证影像/标注几何 → 保留原生标签和几何 → 重采样用于显示 →
原生标签表面/体积 → 可选的显式冠脉掩膜分析 → 模板草稿。导入记录输入哈希
和用户声明的数据集来源；不执行 DICOM 去标识，不核验数据许可，也不会由
标签值 1 推断冠脉。参见 [公开数据导入](public-data.md)。

**报告：** 两条流水线先生成模板。独立的
`POST /api/studies/{id}/ai/report-draft` 已实现可选 Claude 结构化事实语言生成。
缺少配置、服务失败或输出无效时，明确回退为模板。已记录的 SDK 模拟测试
尚未验证真实云模型调用。编辑、AI 重生成及批准会追加版本快照；两个批准
URL 使用相同的版本/哈希与复核标记校验。参见 [AI 报告](ai-reporting.md)
及[报告版本说明](report-version-review-handoff.md)。

任务提供状态、阶段、进度及错误。`202 Accepted` 不代表处理成功；ready
检查也可能包含明确不可用的测量。

## 报告语言与 API 文案

生成报告的 HTTP 请求接受 `?lang=en` 或 `?lang=zh`，默认 `en`，不通过
`Accept-Language` 选择语言。适用于上传、创建演示、选择序列、重跑流水线、
AI 草稿及公开 NIfTI 导入；后台任务保存本次语言选择。其他值（包括 zh-CN）
返回 HTTP 400，detail 为 `{"code":"INVALID_LANG","params":{"lang":"<value>"}}`。

新模板、AI 草稿及模板回退将语言写入 `content.lang` 和
`content.provenance.lang`。已保存报告/版本保持该语言；读取、批准及界面
语言切换不会翻译正文。重新生成可为新版本选择另一语言，旧快照不变。
既有 `content.language` 和没有 lang 字段的旧正文按保存内容返回，不自动
迁移或推断语言。

已映射的 API 展示文案使用 `{"code","params"}` 供前端本地化，未知旧字符串
兼容保留。这与持久化报告文本是两个层面；来源元数据和自定义标签不保证
自动翻译。

## 数据模型

| 实体 | 用途 |
| --- | --- |
| Subject / Study / Series | 假名化对象、检查来源和序列选择 |
| VolumeRecord | 预览数据、spacing、物理几何和 HU 映射 |
| Segmentation / MeshRecord | 标签、结构、表面、变换和来源 |
| Measurement | 数值/单位/方法/来源、验证状态、可用性和原因 |
| Report / ReportVersion | 当前内容/批准状态和追加快照 |
| Comparison | 历史/当前检查配准、可比性和警告 |
| Job / AuditEvent | 处理进度及按检查记录的审计哈希链 |

`not_computed` 不得由参考或演示数值替代。流水线重跑会替换包括 Report
在内的派生记录；版本快照不保证跨重跑永久归档，也不替代备份。

## 物理、预览与参考坐标

- DICOM 和 SimpleITK 物理元数据采用 **LPS 毫米**。
  `DICOMOrient(image, "RAS")` 向 RAS 重排/翻转体素轴，同时保留物理 LPS
  表示；并非把所有存储坐标都转换为 RAS。
- 存储的 affine 将 XYZ 体素索引映射为 LPS 毫米：
  `origin + direction @ (index_xyz * spacing_xyz)`。数组为 ZYX；API 的
  dimensions 和 spacing 为 XYZ。
- 体数据响应提供 origin、direction、spacing、boundsMin/Max、huRange、
  stats 和 dataUrl；affine 保存在服务端。bounds 是居中的显示范围，不是
  患者物理包围盒。
- 浏览器采用居中的预览索引轴坐标与缩放后的场景单位。公开标签 GLB
  顶点先从原生标签几何转换到预览坐标，再居中/缩放；应结合 sceneTransform
  及预览几何解释，不能视作原生患者坐标。
- 图谱靶点使用 `patient_preview_centered_mm`：
  `(index_xyz + 0.5 - dims_xyz / 2) * spacing_xyz`。此坐标未应用患者
  origin/direction，既不是原生 LPS，也不是原生 RAS。
- 参考器官使用独立的 `RAS_ORGAN_REFERENCE` 坐标系。
- MPR 使用物理 spacing。uint8 预览是经过截断和量化的显示数据；公开标签
  体积和冠脉分析使用原生标签/spacing，不使用降采样显示掩膜定量。

## 研究型配准与比较

图谱配准至少需要三个有明确语义且非共线的心腔标志点，将参考靶点拟合到
预览掩膜质心。RMS 是样本内拟合残差；靶点精度为 `not_evaluated`。
映射靶点是参考解剖而非检测出的病灶；输入无效时产生 `not_computed`。

纵向比较需要同一对象的两个不同 ready 检查，以及有效且严格更早的采集
日期。配准使用具有物理 LPS 几何的预览影像，再检查测量可比性。优化器和
覆盖率检查属于工程检查，不是解剖精度验证；质量或可比性不合格时不提供
纵向变化数值。

## 运行时能力声明

`GET /api/health` 的 `capabilities` 来自 `server/app/capabilities.py`。
它仅读取配置和包元数据，不连接服务商、不加载权重、不执行推理。

| 字段/配置 | 状态 | 含义 |
| --- | --- | --- |
| reportDraft，无非空白凭据 | template_only | 未配置报告服务凭据 |
| reportDraft，存在凭据 | configured_unverified | 连通性和输出尚未验证 |
| imageSegmentation，synthetic_ground_truth | synthetic_only | 夹具真值，不是原始影像推理 |
| imageSegmentation，缺少 TotalSegmentator 包 | dependency_missing | 所选适配器缺少依赖 |
| imageSegmentation，检测到 TotalSegmentator 包 | configured_unverified | 权重、许可和执行能力未验证 |
| imageSegmentation，未知适配器 | unsupported | 不能视为可用能力 |

仍需查看每次实际运行结果及来源信息。

## 前端、参考资源与部署

`demo` 使用程序化/参考内容，`api` 使用检查 bundle 和服务端结果。模式由
`?mode=demo|api`、`VITE_DATA_MODE` 或 health 探测选择。`npm run build`
生成单文件产物；`npm run build:cloud` 生成独立资源构建。

共享定义位于 `shared/organ_library.json`、`shared/organ_targets.json` 和
`shared/coronary_model.json`：包含 19 个器官、109 个靶点、17 个冠脉分段和
17 个心肌分区。教学几何与参考 QCA 数值不是患者测量。来源见
[资源署名](../src/assets/organs/ATTRIBUTION.md)。

本地使用 `npm run server:dev` 和 `npm run dev:api`；
`docker compose up --build` 对应本地 API/web 容器配置。当前原型缺少生产
鉴权/RBAC，操作者与复核者名称是传入标签，不是经过认证的签名。临床部署、
生产安全、数据治理和模型性能需要分别验收。


## 旧 SQLite 数据库升级

启动时先执行小范围增量升级，再创建缺失表。旧数据库补充可空的 `jobs.payload`
列，旧记录保留空值，已有报告不改写。SQLite 升级支持重复执行并对并发启动串行化。
升级前备份本地数据；其他数据库引擎的部署仍需专门的迁移与部署审查。
