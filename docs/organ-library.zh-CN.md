# 标准器官库

[English](organ-library.md)

器官库是 React 前端和 FastAPI 后端共用的、带版本的参考目录。它提供：

- 统一的坐标系和单位；
- 供界面、测量、分割标签和导出使用的稳定器官编码；
- 由解剖数据派生的参考网格，用于方位、教学和图谱占位。

唯一来源是 [`shared/organ_library.json`](../shared/organ_library.json)。
该文件仍为前端打包保留显示名称，前端从 `src/assets/organs/` 加载 GLB。
`GET /api/organs` 返回同一套几何和标识，并把每个人类可读字段替换为 `{"code", "params"}`。该接口忽略 `Accept-Language`。

> 这些是**参考解剖**，不是患者解剖。不得用于诊断、测量患者，或代替经过验证的分割模型。

## 坐标系

`RAS_ORGAN_REFERENCE`，单位毫米：

- `+x` = 右
- `+y` = 前
- `+z` = 上
- 原点 = 参考器官集合的中心

各网格一起居中，相对位置保持不变。前端使用 z 轴向上的场景和标准视图。前面观中，患者右侧出现在观察者左侧（放射学惯例）。

## 来源与许可

| 来源 | 使用的结构 | 许可 |
| --- | --- | --- |
| **BodyParts3D 4.0**（DBCLS） | 心、胃、胆囊、主动脉、下腔静脉、气管、脊柱 | CC BY 4.0 |
| **HuBMAP 人体参考图谱 v1.1 男性** | 肝、左/右肺、左/右肾、脾、胰 | CC BY 4.0 |

改编：合并所选部件或节点、简化、转换为 RAS 毫米，并用共享标志点（左心室、肾、脾、胰、气管）求出的统一缩放和平移，把 HRA 器官对齐到 BodyParts3D 坐标系。器官 GLB **不**在仓库 MIT 许可之内。见 [`src/assets/organs/ATTRIBUTION.zh-CN.md`](../src/assets/organs/ATTRIBUTION.zh-CN.md)。

## 内置器官

| 编码 | 器官 | 系统 | 来源 |
| --- | --- | --- | --- |
| `HEART` | 心脏 | cardiovascular | BodyParts3D |
| `LUNG_R` | 右肺 | respiratory | HRA |
| `LUNG_L` | 左肺 | respiratory | HRA |
| `TRACHEA` | 气管 | respiratory | BodyParts3D |
| `LIVER` | 肝脏 | digestive | HRA |
| `GALLBLADDER` | 胆囊 | digestive | BodyParts3D |
| `STOMACH` | 胃 | digestive | BodyParts3D |
| `SPLEEN` | 脾脏 | digestive | HRA |
| `PANCREAS` | 胰腺 | digestive | HRA |
| `KIDNEY_R` | 右肾 | urinary | HRA |
| `KIDNEY_L` | 左肾 | urinary | HRA |
| `AORTA` | 主动脉 | cardiovascular | BodyParts3D |
| `IVC` | 下腔静脉 | cardiovascular | BodyParts3D |
| `SPINE` | 脊柱 | skeletal | BodyParts3D |

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

每条分割在 API 中以 `standardLabelMap` 暴露该映射。

## JSON 文件与 API

文件为前端导入保留显示字符串。`GET /api/organs` 会替换它们。系统名称用系统 id 作为 `code`。器官名称用器官编码。标准结构名称用该结构编码。说明、来源、许可和机构使用各自的编码。没有专用编码时，`params.code` 为器官编码（来源目录则为 `params.id`）。响应来自 `public_catalog()`，不包含文件中的显示句子。

```json
{
  "version": "organ-atlas/v2",
  "frame": {
    "name": "RAS_ORGAN_REFERENCE",
    "units": "mm",
    "description": {"code": "FRAME_RAS_ORGAN_REFERENCE", "params": {}}
  },
  "organs": [{
    "code": "HEART",
    "name": {"code": "HEART", "params": {}},
    "source": {"code": "SOURCE_BODYPARTS3D", "params": {}},
    "note": {"code": "NOTE_ANATOMICAL_REFERENCE", "params": {}}
  }],
  "sources": [{
    "id": "bodyparts3d",
    "name": {"code": "SOURCE_NAME_BODYPARTS3D", "params": {}},
    "institution": {"code": "INSTITUTION_DBCLS", "params": {}},
    "license": {"code": "LICENSE_CC_BY_4_0", "params": {}}
  }]
}
```

## 前端

- `src/three/OrganLibraryEngine.js` 通过 `import.meta.glob` 从 `src/assets/organs/` 加载每个 `organs/<CODE>.glb`。
- GLB 顶点已经在共享的 RAS_ORGAN_REFERENCE 坐标系中，不再对单个器官做变换。
- 引擎指定目录颜色，并提供显隐、透明度、标准视图（前/后/左/右）和射线选择。
- 如果缺少 GLB，引擎可以回退到 `src/three/organGeometry.js` 中的内置程序化几何，并明确标为参考几何。

## 重建图谱

源压缩包很大，**不**纳入版本库。生成的 GLB 已提交，以便离线构建。

1. 下载 BodyParts3D 4.0 OBJ 压缩包：
   `https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/isa_BP3D_4.0_obj_99.zip`
   （或 Human Atlas 的二进制分块：
   `https://github.com/ashemag/human-atlas/tree/main/public/models`）。
2. 从 `https://github.com/hubmapconsortium/ccf-releases/tree/main/v1.1/models` 下载 HRA v1.1 男性参考器官：
   `VH_M_Liver.glb`、`VH_M_Lung.glb`、`VH_M_Kidney_L.glb`、
   `VH_M_Kidney_R.glb`、`VH_M_Spleen.glb`、`VH_M_Pancreas.glb`、
   `VH_M_Heart.glb`（用于对齐标志点）。
3. 运行维护脚本：

```bash
uv run --directory server python scripts/build_organ_atlas.py \
  --atlas-json /path/to/human-atlas/public/models/atlas.json \
  --chunks /path/to/human-atlas/public/models \
  --hra /path/to/hra/models
```

脚本会打印对齐的缩放、平移和残差，写出 `src/assets/organs/*.glb`，更新 `shared/organ_library.json`，并写归属说明。

## 增加或替换器官

1. 在 `shared/organ_library.json` 中增加条目，并保持编码稳定。
2. 在 `src/assets/organs/` 下加入处于共享坐标系中的 GLB，或扩展 `build_organ_atlas.py`。
3. 在 `source` 中记录来源和许可。许可不允许预期用途的模型不要加入。
4. 运行 `npm run test:server`（目录与 GLB 校验）和前端构建。
5. 已发布目录变更时提升 `version`。

## 路线

- 以单独标注的网格增加更多参考结构（例如胆道、冠脉树、腹部血管）。
- 做图谱到患者的配准，用于方位和左右核对。
- 增加标准视图和参考截面。
- 所有新增内容都要有许可和来源记录。
