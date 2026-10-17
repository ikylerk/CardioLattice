# CardioLattice · CardioScope Pro

[English](README.md)

面向心血管影像的**开源研究原型**：上传原始 CCTA DICOM → 去标识与体数据重建 → 3D 分割建模 → 可追溯的定量测量 → 结构化报告草稿 → 医生复核与审计。

> **Research prototype, not a medical device.** This project is not certified by NMPA / FDA / CE, and outputs must not be used for clinical diagnosis, treatment decisions, or medico-legal purposes. All data in demo mode is procedurally synthesized.
>
> **研究原型，不是医疗器械。** 本项目未取得 NMPA / FDA / CE 认证，输出不得用于临床诊断、治疗决策或医疗法律用途。演示模式中的数据全部为程序化合成数据。

---

## 现在真正打通了什么

M1 把「演示」换成了可验证的数据链路：

| 能力 | 状态 | 说明 |
| --- | --- | --- |
| DICOM 上传（.zip / 多文件） | ✅ 已实现 | 支持未压缩与常见压缩传输语法（pydicom + pylibjpeg/gdcm） |
| 序列识别与选择 | ✅ 已实现 | 按 modality、层厚、层数、协议描述打分；歧义时要求人工选择 |
| 去标识与 UID 重映射 | ✅ 已实现 | PS3.15 风格基础轮廓；原始 DICOM 不经 API 暴露 |
| HU 解码、层序/方向校正 | ✅ 已实现 | RescaleSlope/Intercept、LPS→RAS、各向同性重采样 |
| 体数据预览与 MPR/VRT | ✅ 已实现 | 任意 dims/spacing/huRange；浏览器端 MPR + WebGL 光线步进 |
| 分割 → marching cubes → GLB | ✅ 已实现 | 合成夹具 ground truth；真实上传可选 TotalSegmentator |
| 腔室容积测量 | ✅ 已实现 | 体素数 × 体素体积，带 method / source / validation_status |
| 结构化报告草稿 | ✅ 已实现 | 模板生成；每个结论引用 measurement；医生批准后写入审计链 |
| 审计哈希链 | ✅ 已实现 | 去标识、体数据、流水线、报告批准等事件 |
| 标准器官模型库 | ✅ 已实现 | 14 个解剖参考器官、统一编码、RAS 坐标系、可导出目录 |
| LLM 辅助报告（Claude） | 🚧 M2 | 只对结构化事实做语言化，不独立下诊断；接口与校验已设计 |
| 冠脉管腔/狭窄/FFR-CT | 🚧 M3–M4 | 未接入经过验证的模型，UI 显示 `not_computed`，不编造数值 |
| 纵向对比/预测 | 🚧 M3 | 先做配准与 delta；没有验证模型前不展示“未来事件概率” |
| 真实造影（XA）/超声（TTE） | 🚧 后续 | API 模式下明确显示「该检查不可用」，演示模式保留 |

**最重要的边界**：单时相 CCTA 不能计算 EF/SV；Agatston 积分需要非增强钙化扫描；AHA 灌注/存活心肌不能只靠 CTA 推断；冠脉狭窄百分比必须来自经过独立验证的管腔模型。当前代码在这些项目上返回 `not_computed` 和原因。

---

## 快速开始

### 1. 依赖

- Node.js 20+
- Python 3.11+
- [uv](https://docs.astral.sh/uv/)

### 2. 启动本地 API 与前端

```bash
npm install
npm run server:dev     # FastAPI: http://127.0.0.1:8000
npm run dev:api        # Vite:    http://127.0.0.1:5183
```

打开 `http://127.0.0.1:5183` → 侧栏「检查工作台」→「生成合成 CCTA 检查」。
这会生成一套真实的合成 DICOM 序列，走完整的上传 → 去标识 → 体数据 → 分割 → GLB → 测量 → 报告链路。

也可以上传自己的 CCTA `.zip`（研究用途，仅限已获授权数据）。

### 3. 纯离线演示（不启动后端）

```bash
npm run dev            # 自动探测不到 /api 时进入离线演示模式
npm run build          # 单文件 dist/index.html，可双击打开
```

演示模式保留原有五个模块（三维解剖、冠脉造影、CT、超声、定量分析），所有数值明确标记为合成数据。

### 4. 云端构建

```bash
npm run build:cloud    # 正常代码分割，输出 dist-cloud/
```

将 `dist-cloud/` 部署到静态托管，并把同源 `/api/*` 反向代理到 FastAPI。

---

## 架构

```
React + Vite + three.js
        │  /api（同源，开发时 Vite proxy）
        ▼
FastAPI（server/）
  ├─ SQLite（本地）/ Postgres（生产，规划中）
  ├─ 本地文件存储（本地）/ S3 兼容对象存储（生产，规划中）
  ├─ inline BackgroundTasks（本地）/ Redis + RQ worker（规划中）
  ├─ pydicom + SimpleITK + scikit-image + trimesh
  ├─ TotalSegmentator（可选真实分割）
  └─ Anthropic SDK（M2，服务端密钥）
```

### 流水线阶段

```
queued → validating → anonymizing → building_volume
       → segmenting → meshing → computing_metrics → drafting_report
       → succeeded | failed
```

`stage` 保持上述稳定步骤 id。`message` 为 `{"code": "STAGE_SUCCEEDED", "params": {}}`（其他步骤同形）。服务端不翻译它。

### 坐标与单位

- 内部统一 **RAS**（+x 右，+y 前，+z 头），单位毫米。
- DICOM 输入为 LPS，在边界处转换。
- 前端体数据按 `(z, y, x)` C-order 存储，MPR 按物理 spacing 计算纵横比。
- GLB 网格已转换为场景单位；`scene_transform` 记录 mm → scene 的缩放与中心。

### 数据模型（核心）

`Subject → Study → Series → Volume / Segmentation / Mesh / Measurement / Report / Job / AuditEvent`

每条测量都包含：

```js
{
  code,                 // LV_EF、LV_VOLUME 等
  label,                // {"code": "LV_EF", "params": {}}
  value, unit,
  method,               // voxel_count / model inference / ...
  source,               // synthetic_ground_truth / model id
  validationStatus,     // synthetic / research / validated
  status,               // computed / not_computed
  reason                // null，或 {"code": "LV_EF_REQUIRES_TWO_PHASES", "params": {}}
}
```

`label`、`reason`、流水线 `message`、序列选择 `reasons` 和错误 `detail` 都是 `{code, params}`。文案由前端负责。

---

## 标准器官模型库

侧栏「器官模型库」提供一套内置、可版本化的标准参考模型：

- 心脏、左右肺、气管、肝、胆囊、胃、脾、胰腺、左右肾、主动脉、下腔静脉、脊柱，共 14 个器官；
- 使用真实解剖参考网格：心、胃、胆囊、主动脉、下腔静脉、气管、脊柱来自 **BodyParts3D 4.0**；肝、肺、肾、脾、胰来自 **HuBMAP HRA v1.1**；
- 统一使用 `RAS_ORGAN_REFERENCE` 坐标系，单位 mm（+x 右、+y 前、+z 上），原点位于参考器官集合中心；
- 每个器官有稳定 `code`、系统分类、颜色、实际网格尺寸/中心与来源说明；
- 支持系统筛选、单器官显示/隐藏、聚焦、实体/半透明、前面观/后面观/左侧观/右侧观、截图和 JSON 目录导出；
- 心脏分割标签通过 `standardLabelMap` 映射到 `HEART_LV`、`AORTA` 等标准代码；
- 前后端共用 `shared/organ_library.json`。`GET /api/organs` 返回同一套几何，但名称、说明、来源、许可和机构都是 `{"code", "params"}`，不读取 `Accept-Language`。

> 这些是**解剖参考模型**，不是患者解剖，不能用于诊断或测量。器官 GLB 采用 **CC BY 4.0** 授权，与仓库代码的 MIT 授权分开；详见 [`src/assets/organs/ATTRIBUTION.zh-CN.md`](src/assets/organs/ATTRIBUTION.zh-CN.md)。

当前版本提供标准目录、可视化和编码映射；把图谱配准到患者体数据属于后续工作，并且只能用于方位与质控，不能用于推导患者测量。

详见 [`docs/organ-library.zh-CN.md`](docs/organ-library.zh-CN.md)。

---

## API（M1）

后端不读取 `Accept-Language`。

错误、`not_computed` 原因、流水线消息、序列选择原因和测量标签都是对象，例如 `{"code": "LV_EF_REQUIRES_TWO_PHASES", "params": {}}`。枚举（`stage`、`status`、`method`、`source`）保持原样。

| Method | Path | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 健康检查与当前分割适配器 |
| GET | `/api/studies` | 检查列表 |
| POST | `/api/studies` | 上传 DICOM（multipart，`.zip` 或多文件） |
| POST | `/api/studies/demo` | 服务端生成合成 DICOM 并跑完整流水线 |
| GET | `/api/studies/{id}` | 完整 study bundle |
| POST | `/api/studies/{id}/select-series` | 人工选择 CCTA 序列 |
| POST | `/api/studies/{id}/pipeline` | 重新运行 |
| GET | `/api/studies/{id}/events` | SSE 进度 |
| GET | `/api/studies/{id}/audit` | 审计事件 + 哈希链校验 |
| DELETE | `/api/studies/{id}` | 删除检查与派生文件 |
| GET | `/api/volumes/{id}/data` | 8-bit 体数据 |
| GET | `/api/meshes/{id}/glb` | 患者 GLB |
| GET | `/api/organs` | 标准器官目录，人类可读字段为 `{code, params}` |
| GET | `/api/models` | 模型注册表与授权状态 |
| POST | `/api/studies/{id}/reports/{reportId}/approve` | 医生批准报告 |

结构化报告由 `POST /api/studies`、`POST /api/studies/demo`、`POST /api/studies/{id}/select-series` 和 `POST /api/studies/{id}/pipeline` 生成。用查询参数指定草稿语言：`lang=en` 或 `lang=zh`。省略则为 `en`。其他值返回 HTTP 400 `{"detail": {"code": "INVALID_LANG", "params": {"lang": "<value>"}}}`。

示例：`POST /api/studies/demo?lang=zh`。

草稿写入 `content.lang` 和 `content.provenance.lang`。之后的读取和批准都不会改写正文。没有 `lang` 字段的已存报告按保存内容原样返回。审计链仍只记录报告 id、操作者和动作。

`lang=en` 时保存的英文免责声明：

> Research prototype, not a medical device. This project is not certified by NMPA / FDA / CE, and outputs must not be used for clinical diagnosis, treatment decisions, or medico-legal purposes. All data in demo mode is procedurally synthesized.

`lang=zh` 时保存的是原文：

> 研究原型，不是医疗器械。本项目未取得 NMPA / FDA / CE 认证，输出不得用于临床诊断、治疗决策或医疗法律用途。演示模式中的数据全部为程序化合成数据。

交互式文档：启动后端后访问 `http://127.0.0.1:8000/docs`。

---

## 测试

```bash
npm run test:server    # pytest：DICOM、HU、方向、去标识、网格、API、审计、语言
npm run build          # 前端单文件构建回归
npm run build:cloud    # 云端构建回归
```

后端测试使用**程序化合成 DICOM**，不下载外部数据集，也不接触真实患者数据。

公开数据验证（后续里程碑）：

- **ImageCAS**：约 1000 例 CCTA，含冠脉体素标注；用于管腔分割的训练/验证。使用前核对 Kaggle/官方条款与再分发限制。
- **ASOCA**：40 例标注 + 20 例测试；其挑战赛 DUA 限制商业使用，需逐项核对。
- **TotalSegmentator**：代码 Apache-2.0，但 `heartchambers_highres`、`coronary_arteries` 等任务权重并非全部允许商用，必须在进入商业/临床路径前核对并按需取得授权。

模型授权与验证状态记录在 `server/app/routes/assets.py` 的 `/api/models` 与 [`docs/clinical-boundaries.zh-CN.md`](docs/clinical-boundaries.zh-CN.md)。

---

## 项目结构

```
src/                        React 前端
  api/                      fetch/upload/SSE 客户端
  study/                    StudyContext、演示适配器
  components/               工作台、CTA/MPR/VRT、患者 3D、分析、报告、器官库
  three/                    HeartEngine / VolumeRenderer / OrganLibraryEngine
  data/heart-data.json      演示用教学解剖数据
shared/organ_library.json   前后端共享的标准器官目录
server/                     FastAPI 后端
  app/imaging/              DICOM 解析、体数据、分割、marching cubes
  app/routes/               studies / assets / reports
  app/codes.py              稳定的 {code, params}
  app/reporting.py          报告草稿正文（en / zh），生成时冻结
  app/pipeline.py           异步流水线
  app/audit.py              审计哈希链
  scripts/                  合成 DICOM 生成器
  tests/                    pytest
docs/                       架构、临床边界、路线图
```

---

## 安全与合规

- 本地开发无需鉴权；生产环境必须加 OIDC、RBAC、TLS、加密存储、短期签名 URL、日志脱敏。
- 原始 DICOM 不通过 API 暴露；只提供派生体数据与网格。
- 去标识化保留加盐哈希用于纵向关联；不能保证清除像素中的 burned-in PHI，真实数据必须有人工确认与伦理/数据使用协议。
- **M1/M2 不应接收真实患者数据**，除非已完成治理评审。
- 任何面向临床的发布都需要另行评估 NMPA 软件注册、数据合规与临床验证。

详见 [`docs/clinical-boundaries.zh-CN.md`](docs/clinical-boundaries.zh-CN.md)。

---

## 路线图

| 里程碑 | 内容 |
| --- | --- |
| **M1（当前）** | 真实 DICOM → 体数据 → 分割/网格 → 可追溯测量 → 报告草稿 → 审计 |
| M2 | Claude 辅助结构化报告、报告版本与逐条确认、TotalSegmentator 真实分割 |
| M3 | 既往检查配准、纵向 delta、可比性警告 |
| M4 | 冠脉管腔/狭窄模型、模型注册表、独立测试集验证 |
| M5 | 云端加固、OIDC/RBAC、备份/监控、安全评审与治理门禁 |

详见 [`docs/roadmap.zh-CN.md`](docs/roadmap.zh-CN.md) 与 [`docs/architecture.zh-CN.md`](docs/architecture.zh-CN.md)。

---

## 第三方授权

- 演示 3D 心脏表面：**“Realistic Human Heart”** by [neshallads](https://sketchfab.com/neshallads)，CC BY 4.0；授权文本见 `src/assets/heart-license.txt`。
- 标准器官模型：**BodyParts3D 4.0**（DBCLS，CC BY 4.0）与 **HuBMAP Human Reference Atlas v1.1**（CC BY 4.0）；授权与改编说明见 `src/assets/organs/ATTRIBUTION.zh-CN.md`。
- Three.js（MIT）、React（MIT）、Lucide（ISC）。
- 冠脉中心线参考原始 CardioScope 教学模型数据。
- 仓库代码：MIT（见 `LICENSE`）。

## 免责声明

> This project is a research prototype, is not a medical device, and does not provide clinical diagnosis or treatment advice. All demo data is synthetic; every model output must be reviewed by a physician.
>
> 本项目是研究原型，不构成医疗器械，不提供临床诊断或治疗建议。所有演示数据均为合成数据；所有模型输出均需医生复核。
