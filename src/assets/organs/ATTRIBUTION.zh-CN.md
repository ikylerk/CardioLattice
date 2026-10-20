# 器官模型归属

[English](ATTRIBUTION.md)

本目录中的器官 GLB（整体及细部）和 `shared/organ_targets.json` 派生靶点目录是改编后的解剖参考数据。它们采用 **CC BY 4.0**，不是 MIT。仓库代码仍为 MIT。

## BodyParts3D 4.0

- 来源：BodyParts3D 4.0，生命科学数据库中心（Database Center for Life Science，DBCLS）。
- 署名要求：保留 BodyParts3D、© 数据库创建机构及 CC Attribution 4.0 International 许可标识；官方要求的完整英文署名见[英文版](ATTRIBUTION.md)。
- 数据集：https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html
- 许可：CC Attribution 4.0 International（CC BY 4.0）。
  - 官方许可页（2025-02-27 更新）：https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html
  - 原始 OBJ 头引用的是旧的 CC BY-SA 2.1 Japan 文本；当前官方数据库许可以此为准。
- 用于：脑、心脏、胃、胆囊、小肠、大肠、膀胱、食管、主动脉、下腔静脉、气管和脊柱。
- 改编：合并所选部件或导出为命名细部、简化、将坐标轴和单位转换为 RAS 毫米，并把参考器官集合中心置于原点。

## HuBMAP 人体参考图谱 v1.1

- 来源：人体参考图谱（HRA），HuBMAP 联盟，v1.1 男性参考器官：肝、肺、左/右肾、脾、胰。
- 数据集：https://github.com/hubmapconsortium/ccf-releases
- 版本模型：https://github.com/hubmapconsortium/ccf-releases/tree/main/v1.1/models
- 许可：CC Attribution 4.0 International（CC BY 4.0）。
- 改编：合并所选节点表面或导出为命名细部、简化、对齐到 BodyParts3D 参考坐标系，并转换为 RAS 毫米。

## 派生细部与靶点

19 器官目录包括 14 份命名细部网格和 109 个参考靶点。靶点由参考部件中心或形态标志生成，
保留来源署名，不代表患者病灶。所有源数据派生的外形、细部和靶点均保留上述 CC BY 4.0 署名。
许可全文：https://creativecommons.org/licenses/by/4.0/。
HRA 到 BodyParts3D 的对齐是参考数据改编，不是患者配准精度验证；参考模拟不构成临床导航许可。

## 重要说明

这些模型和靶点是用于方位、教学、图谱显示、研究配准和流程模拟的参考解剖。它们不是从患者导出的，不得用于诊断、测量或治疗决策。
