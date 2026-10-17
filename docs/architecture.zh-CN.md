# 架构

[English](architecture.md)

## 1. 目标与非目标

**目标：** 把原始 CCTA DICOM 序列到可追溯三维模型和结构化报告的路径做成真实、可测试的链路，且不编造临床 AI 输出。

**M1 的非目标：**

- 自主诊断、狭窄分级或 FFR-CT；
- 真实造影/超声入库；
- 多租户云端加固；
- 监管许可。

## 2. 运行时组件

```
Browser (React/Vite/three.js)
  │  same-origin /api
  ▼
FastAPI (server/app)
  ├── SQLite (local-lite)          → Postgres (production target)
  ├── local filesystem (local-lite) → S3/MinIO (production target)
  ├── inline BackgroundTasks        → Redis + RQ worker (production target)
  ├── imaging pipeline (pydicom/SimpleITK/scikit-image/trimesh)
  └── report generator (deterministic template now; Claude in M2)
```

浏览器从不接收原始 DICOM。它接收降采样的 8-bit 体数据、GLB 网格、结构化测量和报告内容。

## 3. 数据流

```
upload (.zip / files)
  → safe extraction + magic/tag validation
  → series grouping and scoring
  → human confirmation if ambiguous
  → PHI removal + UID remap
  → pixel decode + rescale to HU
  → LPS→RAS + isotropic resampling
  → preview volume (uint8 + real huRange)
  → segmentation mask
  → marching cubes → GLB
  → deterministic measurements
  → template report draft
  → clinician approval + audit event
```

任务状态单调前进：

```
queued → validating → anonymizing → building_volume → segmenting
       → meshing → computing_metrics → drafting_report → succeeded | failed
```

## 4. 数据模型

| 实体 | 用途 |
| --- | --- |
| `Subject` | 假名化研究对象；数据库中不保存姓名 |
| `Study` | 一次上传的检查；`source = upload \| demo \| public_dataset` |
| `Series` | DICOM 序列元数据与候选评分 |
| `VolumeRecord` | dims、spacing、affine、HU 范围、预览数据路径 |
| `Segmentation` | 标签图、模型 id/版本、验证状态 |
| `MeshRecord` | 各结构的 GLB、场景变换、来源 |
| `Measurement` | 数值 + 单位 + method + source + status + reason |
| `Report` | 结构化内容、生成器、批准信息 |
| `Job` | 流水线状态与进度 |
| `AuditEvent` | 按检查追加的哈希链 |

`Measurement.status === "not_computed"` 是一等结果。缺失的数值绝不能用演示数字代替。

## 5. 体数据约定

前端期望：

```js
{
  data: Uint8Array,          // length = nx*ny*nz, x-fastest
  dims: [nx, ny, nz],
  spacing: [sx, sy, sz],     // millimetres
  huRange: [lo, hi],         // linear mapping of uint8 → HU
  bounds: { min: [3], max: [3] }, // scene units for rendering
  defaultSlices: { x, y, z },
  markers: [{ voxel, worldMm, label, provenance }]
}
```

定量计算始终使用服务端重采样后的 HU 体数据。uint8 预览只用于显示；其量化误差大约是 `(hi - lo) / 255` HU。

## 6. 坐标

- DICOM 物理空间是 LPS。
- 后端规范为 **RAS**（`+x` 右，`+y` 前，`+z` 头）。
- 体数据与网格共用一个 affine。API 中的 `bounds` 是毫米；前端为了现有相机取景把它们缩放到场景单位。
- GLB 坐标以场景单位导出；`scene_transform` 记录 mm → scene 的映射。
- MPR 纵横比使用物理 spacing，而不是体素个数。

## 7. 前端模式

- `demo` — 无网络请求；本地程序化体数据和教学解剖。
- `api` — 工作台、检查上下文、服务端体数据/网格/报告。
- 模式选择：`?mode=demo|api`、`VITE_DATA_MODE`，或探测 `/api/health`。
- 单文件构建（`npm run build`）仍是离线演示产物。
- `npm run build:cloud` 产生常规的、按代码分割的云端构建。

## 8. 安全姿态

本地轻量模式故意不做鉴权。在接入真实数据之前：

- OIDC + PKCE、MFA、RBAC（`viewer/analyst/clinician/admin`）；
- TLS/HSTS、同源 API、httpOnly cookie；
- 私有对象存储 + 短期签名 URL；
- 静态与传输加密；
- 上传限制、zip 路径穿越/炸弹检查、隔离；
- 不含 PHI 的结构化日志、请求 ID；
- 审计导出、保留与删除任务；
- DPIA / IRB / 数据使用协议以及供应商 DPA。

## 9. 部署路径

1. **Local-lite**（当前）：`uv run uvicorn` + `npm run dev:api`。
2. **容器**：`docker compose up --build`（API + web，SQLite 卷）。
3. **云端**：托管 Postgres、S3 兼容存储、Redis/RQ worker、GPU 推理 worker、CDN/静态托管、密钥管理、监控。

存储和队列接口故意做窄，这样生产实现可以在不改影像流水线的情况下加进来。

## 10. 语言

API 不读取 `Accept-Language`。

错误、`not_computed` 原因、流水线 `message`、序列选择原因、测量标签、标记标签、分割警告，以及模型的 `intendedUse` / `license`，都是 `{"code", "params"}` 对象。这些文案由前端负责。`stage` 仍是步骤 id（`validating`、`succeeded` 等）。

报告草稿由上传、演示、选择序列和重新运行流水线的请求生成。查询参数为 `lang=en` 或 `lang=zh`。省略则为 `en`。其他值返回 HTTP 400 `{"detail": {"code": "INVALID_LANG", "params": {"lang": "<value>"}}}`。

草稿写入 `content.language` 和 `content.provenance.language`，读取和批准都不会改写。仍使用旧键 `lang` 的已存报告，以及没有语言字段的已存报告，都按保存内容原样返回。审计链仍只记录报告 id、操作者和动作。

`lang=en` 保存：“Research prototype, not a medical device. This project is not certified by NMPA / FDA / CE, and outputs must not be used for clinical diagnosis, treatment decisions, or medico-legal purposes. All data in demo mode is procedurally synthesized.”

`lang=zh` 保存原文：“研究原型，不是医疗器械。本项目未取得 NMPA / FDA / CE 认证，输出不得用于临床诊断、治疗决策或医疗法律用途。演示模式中的数据全部为程序化合成数据。”
