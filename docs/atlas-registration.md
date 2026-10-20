# 心脏参考图谱配准（研究用途）

本模块把参考心脏图谱的解剖靶点映射到患者**预览网格的中心化索引毫米坐标系**。
计算完成只表示输入通过校验、相似变换已求解；不表示临床可靠、靶点精度已测得，
也不把参考解剖解释为患者病灶。

入口为 `register_cardiac_atlas(db, study, volume, segmentation, labels)`。
`GET /api/studies/{id}/registration` 读取当前 `derived/atlas_registration.json`。
本模块不负责原生 NIfTI 重采样、原生定量或前端坐标变换。

## 显式标签语义

`segmentation.label_map` 的方向是 **语义代码 → 正整数标签值**，例如：

```json
{"LV": 19, "RV": 7, "LA": 91, "RA": 3}
```

LV/RV/LA/RA 分别为左心室、右心室、左心房、右心房。接受显式别名
`HEART_LV`、`CHAMBER_LV`（其他心腔同理），忽略两端空格并规范大小写。
自定义代码可通过 `provenance.standard_label_map` 明确映射到心腔语义。
直接代码与标准代码矛盾时拒绝计算。

**任何编号都没有默认解剖含义。** 单标签 1、连续编号 1–4、`LABEL_1` 或未知
代码不会自动识别为心腔。未知且未显式映射的代码不参与拟合。

以下情况输出 `not_computed`，不返回成功变换或映射靶点：

- 元数据标签值不是正整数类型，包括 0、负数、布尔值、浮点数、字符串、非有限值。
- 同一标签值声明给多个结构，或同一心腔通过不同代码/别名重复声明。
- 标签数组不是匹配预览尺寸的非空三维数值数组，或含负值、NaN/Inf、非整数、
  布尔值。数组可使用整数类型或值均为整数的浮点类型。
- 已声明的心腔标签在数组中没有体素；可用心腔少于三个。
- 分割未完成，或 study/volume/segmentation 归属不一致。
- 若保存了原始 `provenance.label_spec`（值 → 代码），其中有重复代码、
  重复标签值、重复心腔语义，或心腔声明与 `label_map` 不一致。这能检测导入时
  由“代码 → 值”字典覆盖而隐藏的重复心腔。

语义来自输入声明，模块不能凭质心证实心腔身份正确。上游若已丢弃重复声明且未
保留 `label_spec`，无法恢复被丢弃的信息。

## 坐标约定与兼容字段

保留 `frame = "patient_preview_centered_mm"` 和供渲染使用的
`targets[].patientMm`。这里 x/y/z 是**预览索引轴**，不单凭该字段宣称
它们是患者 LPS/RAS 解剖方向。

- 标签数组顺序为 `labels[z, y, x]`（ZYX）。
- `volume.dims = [nx, ny, nz]`（XYZ），须与数组形状反序完全一致。
- `volume.spacing` 为 XYZ、mm，三个值均须有限且大于零。
- 实际观测点是该心腔所有标签体素的平均索引，继续使用原来的体素中心偏移：

```text
observed_patient_mm = (mean_index_xyz + 0.5 - dims_xyz / 2) * spacing_xyz
```

原点为预览体素范围的中心。**不应用** volume 的物理 origin、direction、affine，
也不额外翻转数组。NIfTI/DICOM 原生物理坐标与预览重采样由上游负责；
本模块不能仅凭尺寸匹配证明标签与影像在物理空间中对齐。

参考坐标声明读取自 `organ_targets.json.frame`（当前 `RAS_ORGAN_REFERENCE`、mm）。

| 字段 | 含义 |
| --- | --- |
| `sourceFrame` | 参考图谱原始坐标声明 |
| `targetFrame` | 索引顺序、尺寸、间距、轴方向、中心化公式，以及未应用患者物理变换的声明 |
| `transform.matrix4x4` | 未作显示舍入的齐次矩阵：列向量，参考 mm → 预览中心化 mm |
| `scale/rotation/translationMm` | 保留原显示精度；精确复算使用 matrix4x4 |

```text
[mapped_preview_mm, 1] = matrix4x4 @ [reference_mm, 1]
mapped_preview_mm = scale * rotation @ reference_mm + translation_mm
```

## 几何校验与拟合

按 LV、RV、LA、RA 的固定顺序建立对应，使用 Umeyama 相似变换（正尺度、
正规旋转、平移），不返回镜像矩阵。三个非共线点足够，平面点集本身不视作退化。
两组点须为同形状的有限 `N × 3` 数组、N ≥ 3，拒绝：

- 重复或不可区分的点：任意点对距离 ≤ 1e-8 mm。
- 点集尺度退化、共线或近共线：中心化点集第一奇异值 ≤ 1e-8，
  或第二奇异值 ≤ 第一奇异值的 1e-6。
- 对应协方差退化：第二奇异值 ≤ 第一奇异值的 1e-6。
- 非有限数值、溢出、SVD 失败、非正尺度或非正规旋转。
- 重复/无效参考心脏靶点 ID、缺失已声明心腔的参考点、非有限/非三维
  参考坐标、非有限映射结果。

这些阈值只排除数值不稳定，**不是临床质量阈值**。没有经验证的残差放行阈值；
错误语义、形态差异、镜像数据或很大的残差仍需独立质量检查。

## 真实观测、映射与残差

保留 `version = "atlas-registration/v1"`，新增 `schemaRevision = 2`。
成功时 `status = "computed"`、`validationStatus = "research"`。

| 标志点字段 | 含义 |
| --- | --- |
| `chamberCode/labelValue/voxelCount` | 心腔语义、实际标签值、体素数 |
| `centroidIndexXyz` | 标签质心在预览网格上的平均索引 |
| `referenceMm` | 参考图谱点 |
| `observedPatientMm` | 实际标签质心，预览中心化 mm |
| `mappedPatientMm` | 参考点经变换后的坐标，预览中心化 mm |
| `patientMm` | 兼容字段：映射点，两位小数；不是观测点 |
| `fitResidualMm` | 未作显示舍入的映射点到观测点欧氏距离 |
| `residualMm` | 同一拟合残差，两位小数 |

`targets[].mappedPatientMm` 为所有心脏参考靶点的精确映射坐标，
`targets[].patientMm` 保持原两位小数渲染接口。`input` 保存输入 ID、预览采样
来源和语义来源；`labelMapping` 保存参与拟合的心腔、标签值、参考靶点对应。

```text
fit_residual_i = ||mapped_patient_i - observed_patient_i||
fitRmsMm = sqrt(mean(fit_residual_i ** 2))
```

`rmsMm` 保留两位小数，与 `ATLAS_REGISTRATION_RMS` 兼容。
`fitMetric = "in_sample_landmark_rms"` 指明这是**参与求解的同一批点的拟合残差**。
`targetAccuracyMm = null`、`targetAccuracyStatus = "not_evaluated"` 指明未用独立
靶点评估定位误差，不能将残差称为靶点精度、置信区间或导航误差。

## 失败、持久化与重试

保持函数成功返回字典、无效输入返回 `None`。失败仍写入可追溯 JSON，包含
`status/validationStatus = "not_computed"`、原因和输入 ID；`landmarks/targets`
为空，RMS 为 null，不含变换。

同步更新本 study 的 `ATLAS_REGISTRATION`（状态）、
`ATLAS_REGISTRATION_RMS`（拟合残差）、`ATLAS_REGISTERED_TARGETS`（映射数量）。
失败时数值为 null，并清空指标 provenance 中的映射点。已有记录（包括重复记录）
均更新，防止现有接口的无序 `first()` 选中旧成功结果。其他测量指标不变。

当前 JSON 通过临时文件替换，失败也替换旧成功产物；每次记录审计事件。
使用 `allow_nan=False` 防止输出 NaN/Inf。存储/数据库错误向调用方传播。
文件替换与数据库提交不构成跨存储事务，同一 study 的并发调用需上游串行调度。
新计算/重跑后接口可返回失败 JSON；未运行或历史数据无产物时仍可返回 404。
历史产物不会在启动时自动迁移。

## 独立验证与边界

在项目根目录执行：

```sh
cd server
.venv/bin/python -m pytest tests/test_registration.py
```

测试使用合成点、合成标签、隔离内存 SQLite 和临时产物目录，验证已知变换、
平面三点、镜像禁止、语义映射与原始声明冲突、无效/退化输入拒绝、实际观测
与映射点复算、兼容坐标公式、JSON 回读，以及成功→失败→恢复的一致性。

这是软件行为验证，不是真实患者、外部数据集或临床定位验证。当前无强度配准或
形变配准，未量化分割误差、重采样误差、解剖差异及远离拟合点的外推误差。
参考靶点仅供研究展示，不用于导航、穿刺、治疗计划或认定患者病灶。
