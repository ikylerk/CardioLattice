# 标准器官库

[English](organ-library.md)

器官库是 React 前端和 FastAPI 后端共用的、带版本的参考目录。它提供：

- 统一的坐标系和单位；
- 供界面、测量、分割标签和导出使用的稳定器官编码；
- 一套内置三维参考模型，用于方位、教学和图谱占位。

唯一来源是 [`shared/organ_library.json`](../shared/organ_library.json)。
该文件仍为前端打包保留显示名称。`GET /api/organs` 返回同一套几何和标识，
并把每个人类可读字段替换为 `{"code", "params"}`。该接口忽略 `Accept-Language`。

> 这些是**标准参考模型**，不是患者解剖。不得用于诊断、测量患者，或代替经过验证的分割模型。

## 坐标系

`RAS_BODY_CENTER`，单位毫米：

- `+x` = 右
- `+y` = 前
- `+z` = 上
- 原点 = 身体中心

每个器官都有 `centerMm` 和 `sizeMm`。管状和堆叠网格以 `mesh.pointsMm` 中的显式几何为准；`centerMm` / `sizeMm` 仍是界面和导出使用的目录元数据。

## 内置器官

| 编码 | 器官 | 系统 | 参考几何 |
| --- | --- | --- | --- |
| `HEART` | 心脏 | cardiovascular | 演示心脏 GLB，按目录尺寸归一化 |
| `LUNG_R` | 右肺 | respiratory | 带内侧凹陷的椭球 |
| `LUNG_L` | 左肺 | respiratory | 带内侧凹陷的椭球 |
| `TRACHEA` | 气管 | respiratory | 管道 |
| `LIVER` | 肝脏 | digestive | 变形椭球 |
| `GALLBLADDER` | 胆囊 | digestive | 椭球 |
| `STOMACH` | 胃 | digestive | 弯曲管道 |
| `SPLEEN` | 脾脏 | digestive | 椭球 |
| `PANCREAS` | 胰腺 | digestive | 弯曲管道 |
| `KIDNEY_R` | 右肾 | urinary | 豆形椭球 |
| `KIDNEY_L` | 左肾 | urinary | 豆形椭球 |
| `AORTA` | 主动脉 | cardiovascular | 弯曲管道 |
| `IVC` | 下腔静脉 | cardiovascular | 管道 |
| `SPINE` | 脊柱 | skeletal | 椎体/椎间盘堆叠 |

## 心脏标签映射

心脏分割适配器沿用现有的 1–7 标签。目录把这些标签映射到稳定的标准编码：

| 标签 | 标准编码 | 结构 |
| --- | --- | --- |
| `LV` | `HEART_LV` | 左心室腔 |
| `RV` | `HEART_RV` | 右心室腔 |
| `LA` | `HEART_LA` | 左心房腔 |
| `RA` | `HEART_RA` | 右心房腔 |
| `AO` | `AORTA` | 主动脉 |
| `MYO` | `HEART_MYOCARDIUM` | 心肌 |
| `CALC` | `CORONARY_CALCIFICATION` | 冠脉钙化 |

每条分割在 API 中以 `standardLabelMap` 暴露该映射，前端在局部标签旁显示标准编码。

## JSON 文件与 API

文件为前端导入保留显示字符串。`GET /api/organs` 会替换它们。系统名称用系统 id 作为 `code`。器官名称用器官编码。标准结构名称用该结构编码。说明和来源使用各自的编码。没有专用编码时，`params.code` 为器官编码；其余情况 `params` 为 `{}`。

```json
{
  "version": "organ-atlas/v1",
  "frame": {
    "name": "RAS_BODY_CENTER",
    "units": "mm",
    "description": {"code": "FRAME_RAS_BODY_CENTER", "params": {}}
  },
  "systems": [{
    "id": "cardiovascular",
    "name": {"code": "cardiovascular", "params": {}},
    "color": "#c45258"
  }],
  "organs": [{
    "code": "HEART",
    "name": {"code": "HEART", "params": {}},
    "system": "cardiovascular",
    "source": {"code": "SOURCE_DEMO_HEART_GLB", "params": {}},
    "note": {"code": "NOTE_HEART_NORMALIZED_SURFACE", "params": {}}
  }],
  "segLabelMap": {"LV": "HEART_LV"},
  "standardCodes": {
    "HEART_LV": {"name": {"code": "HEART_LV", "params": {}}, "system": "cardiovascular"}
  }
}
```

当前查看器支持的 `mesh.type`：

- `ellipsoid` — 可选 `deform: lung | liver | kidney`
- `tube` — `pointsMm[]` 与 `radiusMm`
- `stack` — `segments`、`radiusMm`、`gapMm`
- `glb` — `asset`（当前为打包的演示心脏）

## 增加或替换器官

1. 在 `shared/organ_library.json` 中增加条目，并保持编码稳定。
2. 选择一种参考网格，或在 `src/assets/` 下加入有许可的 GLB。
3. 在 `source` 中记录来源和许可。许可不允许预期用途的模型不要加入。
4. 运行 `npm run test:server`。目录校验会检查编码唯一、系统已知、坐标为 3 个值，以及标签映射。
5. 已发布目录变更时提升 `version`，这样下游导出和报告可以绑定到特定图谱版本。

## 在代码中使用

前端：

```js
import ORGAN_LIBRARY from '../../shared/organ_library.json'
```

后端：

```python
from app.organ_library import ORGAN_LIBRARY, standard_label_map
```

API：

```http
GET /api/organs
```

响应来自 `public_catalog()`，不包含文件中的 `name` / `en` / `note` / `source` 句子。

## 路线

当前的非心脏器官故意使用简单参考几何。以后可以在不改变编码、坐标系和前端契约的前提下，逐个替换为开放许可的解剖 GLB（例如 BodyParts3D 或 Z-Anatomy）。任何替换都必须在目录中带上许可和来源。
