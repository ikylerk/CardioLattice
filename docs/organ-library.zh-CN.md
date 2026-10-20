# 标准器官库

[English](organ-library.md)

器官库是 React 前端和 FastAPI 后端共用的、带版本的参考目录。它提供：

- 统一的坐标系和单位；
- 供界面、测量、分割标签和导出使用的稳定器官编码；
- 由解剖数据派生的参考网格，用于方位、教学和图谱占位。

唯一来源是 [`shared/organ_library.json`](../shared/organ_library.json)。
该文件仍为前端打包保留显示名称，前端从 `src/assets/organs/` 加载 GLB。
`GET /api/organs` 返回同一套几何和标识，并提供稳定的 `{"code", "params"}` 显示字段。该接口忽略 `Accept-Language`。

> 这些是**参考解剖**，不是患者解剖。不得用于诊断、测量患者，或代替经过验证的分割模型。

当前目录包含 **19 个器官**、**14 份命名细部网格**和 **109 个参考靶点**，这些是参考内容数量，不是患者发现或临床覆盖范围。

## 坐标系

`RAS_ORGAN_REFERENCE`，单位毫米：

- `+x` = 右
- `+y` = 前
- `+z` = 上
- 原点 = 参考器官集合的中心

各网格一起居中，相对位置保持不变。前端使用 z 轴向上的场景和标准视图。前面观中，患者右侧出现在观察者左侧（放射学惯例）。

患者影像元数据使用 **LPS 物理毫米坐标**。RAS 数组轴排列不会把 SITK 元数据变成 RAS。
患者网格显示采用中心化预览坐标，`center_mm = (dims - 1) * spacing / 2`。
LPS、中心化预览和 `RAS_ORGAN_REFERENCE` 之间需要显式变换，参考原点不是患者影像原点。

心脏图谱配准已按显式心腔语义实现研究相似变换，区分真实观测点与映射参考点；无效/重复标签和退化几何均失败。拟合 RMS 不是靶点精度，后者保持 `not_evaluated`；映射靶点仍不是检出的患者病灶。参见[配准契约](atlas-registration.md)。

## 来源与许可

| 来源 | 使用的结构 | 许可 |
| --- | --- | --- |
| **BodyParts3D 4.0**（DBCLS） | 脑、心、胃、胆囊、小肠、大肠、膀胱、食管、主动脉、下腔静脉、气管、脊柱 | CC BY 4.0 |
| **HuBMAP 人体参考图谱 v1.1 男性** | 肝、左/右肺、左/右肾、脾、胰 | CC BY 4.0 |

改编：合并所选部件或节点、简化、转换为 RAS 毫米，并用共享标志点（左心室、肾、脾、胰、气管）求出的统一缩放和平移，把 HRA 器官对齐到 BodyParts3D 坐标系。器官 GLB **不**在仓库 MIT 许可之内。见 [`src/assets/organs/ATTRIBUTION.zh-CN.md`](../src/assets/organs/ATTRIBUTION.zh-CN.md)。

## 内置器官

| 编码 | 器官 | 系统 | 来源 |
| --- | --- | --- | --- |
| `BRAIN` | 脑 | nervous | BodyParts3D |
| `HEART` | 心脏 | cardiovascular | BodyParts3D |
| `LUNG_R` | 右肺 | respiratory | HRA |
| `LUNG_L` | 左肺 | respiratory | HRA |
| `TRACHEA` | 气管 | respiratory | BodyParts3D |
| `SMALL_INTESTINE` | 小肠 | digestive | BodyParts3D |
| `LARGE_INTESTINE` | 大肠 | digestive | BodyParts3D |
| `URINARY_BLADDER` | 膀胱 | urinary | BodyParts3D |
| `ESOPHAGUS` | 食管 | digestive | BodyParts3D |
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

## 命名细部与参考靶点

14 个器官有 `<CODE>_detail.glb`，前端按需加载并提供结构树、逐部件显隐和聚焦。
气管、胃、胆囊、膀胱和食管目前仅有整体表面，没有独立命名细部目录。

| 器官 | 细部数量 | 示例 |
| --- | --- | --- |
| BRAIN | 15 组 | 脑叶、脑岛、扣带回、小脑、脑干、丘脑、基底节、海马、脑室、白质、胼胝体 |
| HEART | 83 | 心腔、瓣膜、冠脉分支、乳头肌 |
| LIVER | 12 | 包膜、八个 HRA 肝段、尾状叶、方叶、韧带 |
| LUNG_L / LUNG_R | 各 10 | 支气管肺段 |
| KIDNEY_L / KIDNEY_R | 各 7 | 包膜、皮质、肾柱、髓质、肾盏、肾盂、肾门 |
| PANCREAS | 5 | 头、颈、体、尾、钩突 |
| SPLEEN | 5 | 膈面、胃面、结肠面、肾面、脾门面 |
| AORTA | 3 | 升部、弓、降部 |
| IVC | 2 | 近端与腹段 |
| SPINE | 23 | 颈椎、胸椎、腰椎、骶骨 |
| SMALL_INTESTINE | 3 | 十二指肠、空肠、回肠 |
| LARGE_INTESTINE | 4 | 升结肠、横结肠、降结肠、直肠 |

`shared/organ_targets.json` 保存 109 个参考靶点，`GET /api/organ-targets` 提供同一目录。
字段包括 `id`、`organ`、`name`、`category`、`partCode`、`coordinateMm`、
`standardView`、`approach`、`reference` 和 `description`。靶点覆盖脑、心腔/瓣膜/冠脉、
肝段、肺段、肾极/肾门/肾盂、胰、脾、肠道、膀胱、食管、大血管、气管及部分椎体，
坐标采用 `RAS_ORGAN_REFERENCE`。位置来自参考部件中心或形态标志，不是患者病变。

参考靶点模拟已支持选择/聚焦、前后左右入路、插入深度和进针动画、轴位/冠状/矢状裁切，
以及路径长度、距靶点距离和近似结构相交读数。相交仅为参考表面射线检查，不包含组织形变、
呼吸或验证过的安全边界，不是患者规划、手术导航、活检/消融规划或机器人引导。

## 心脏标签映射

内部心脏适配器保留项目的 1–7 标签。外部编号不能推定解剖语义，导入须显式给出代码；TotalSegmentator 按官方结构文件名映射，其 `pulmonary_artery` 不能被误映射成项目的 `CALC`。目录把语义标签映射到稳定编码：

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

API 保留 `detailAsset`、`parts`、`centerMm`、`sizeMm`、`segLabels` 等几何和结构字段；显示代码不能取代实际几何或来源署名。

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

脚本会打印对齐的缩放、平移和残差，写出整体及 `*_detail.glb`，更新 `shared/organ_library.json`，写出 `shared/organ_targets.json` 和署名文件。

## 增加或替换器官

1. 在 `shared/organ_library.json` 中增加条目，并保持编码稳定。
2. 在 `src/assets/organs/` 下加入处于共享坐标系中的 GLB，或扩展 `build_organ_atlas.py`。
3. 在 `source` 中记录来源和许可。许可不允许预期用途的模型不要加入。
4. 运行 `npm run test:server`（目录与 GLB 校验）和前端构建。
5. 已发布目录变更时提升 `version`。

## 路线

- 以单独标注的网格增加更多参考结构（例如胆道、冠脉树、腹部血管）。
- 对已实现的心脏图谱到患者研究配准开展外部验证；拟合残差不是靶点精度。
- 增加标准视图和参考截面。
- 所有新增内容都要有许可和来源记录。

软件已实现及合成/mock 验收不代表临床精度。AI 报告接口已实现但验收未接真实 API key/云调用，真实权重推理也未验证。报告版本/哈希批准和纵向对比已实现，个体事件预测未实现。参见[路线图](roadmap.zh-CN.md)和[临床边界](clinical-boundaries.zh-CN.md)。
