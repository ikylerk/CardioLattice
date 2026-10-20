# CardioLattice · CardioScope Pro

[English](README.md) · [文档索引](docs/README.md) · [临床就绪度](docs/clinical-readiness.md)

心血管影像研究工作站：DICOM 或公开 NIfTI 输入 → 物理坐标重建 → 分割后的
3D 表面与测量 → 参考解剖、纵向对比 → 可追溯的报告与复核。

> 研究原型，不是医疗器械。项目未取得 NMPA / FDA / CE 认证，输出不得用于
> 临床诊断、治疗决策或医疗法律用途。离线演示数据为合成数据。

## 已实现能力

| 范围 | 当前行为 | 验证边界 |
| --- | --- | --- |
| 影像 | DICOM 序列选择、去标识、HU 体数据、考虑方向的 MPR/VRT | 研究链路，具有合成数据回归测试 |
| 公开数据 | NIfTI 影像/标签导入、原始文件哈希、原生标签几何及高编号标签 | 数据集身份由上传者声明；导入不等于模型验证 |
| 分割 | 合成夹具适配器、可选 TotalSegmentator 适配器 | 不内置模型权重；真实推理需单独配置验证 |
| 测量 | 标签体积、冠脉骨架/直径候选、来源与明确的失败原因 | 未实现经验证的狭窄分级或 FFR-CT |
| 参考解剖 | 19 个器官、细部结构、109 个参考靶点与教学模拟 | 参考模型和靶点不能代替患者解剖或操作导航 |
| 造影 | 共享冠脉参考模型、分段选择及投照控制 | 参考/合成演示，未实现真实 XA 处理 |
| 对比 | 同一受试者的早期检查选择、物理刚性配准及兼容性检查 | 不兼容时不显示差值；没有进展预测模型 |
| 报告 | 模板、可选 Claude 草稿、证据检查、不可变历史、修订与精确版本批准 | AI 失败明确回退到模板，未做临床验证 |
| 语言 | 英文/简体中文界面、生成时指定报告语言 | 切换界面语言不翻译已保存报告 |

健康状态区分已配置服务与已确认可用能力。最新本地验证**没有证明真实云端 AI
生成、TotalSegmentator 权重推理、真实公开病例外部验证或临床可用性**。
详见带日期的[验证记录](docs/README.md#validation-records)。

单时相 CTA 不提供 EF/SV；钙化积分需要合适的非增强序列；灌注/存活心肌和
FFR-CT 需要额外的有效输入及验证模型。不支持的项目保持 `not_computed`。

## 本地运行

准备 Node.js 22（CI 基线）、Python 3.11+、[uv](https://docs.astral.sh/uv/)。
在仓库根目录执行：

```sh
npm ci
uv sync --directory server --frozen --extra dev
cp .env.example server/.env
```

在两个终端分别启动：

```sh
npm run server:dev   # http://127.0.0.1:8000
npm run dev:api      # http://127.0.0.1:5183
```

进入检查工作台，生成合成 CCTA 检查，可以验证完整本地链路。上传真实 DICOM
不会自动启用真实分割模型。配置放在 `server/.env`，服务密钥仅保存在后端。
参见[架构](docs/architecture.zh-CN.md)及[公开数据导入](docs/public-data.md)。

离线合成/参考演示：

```sh
npm run dev
npm run build        # 单文件 dist/index.html
npm run build:cloud  # 静态资源包 dist-cloud/
```

`dev` 自动探测后端，API 不可用时使用演示；`dev:api` 明确选择 API 模式。
云端构建需要把同源 `/api` 代理到后端。多人共享部署仍需身份认证、机构权限、
备份及生产部署审查。

## 验证

```sh
npm run test:frontend
npm run test:server
npm run build
npm run build:cloud
```

CI 执行后端测试、前端测试和两种构建，浏览器交互单独记录。测试通过不代表
解剖准确、临床有效、外部模型已接通或已经完成生产部署。

## API 与报告约定

启动后端后访问 `http://127.0.0.1:8000/docs` 查看完整接口。核心入口包括
`/api/health`、`/api/studies`、`/api/public/import`、`/api/organs`、
`/api/models`、`/api/reports/{id}` 和检查对比接口。

- 生成请求支持 `?lang=en` / `?lang=zh`，省略默认英文。DICOM 流水线、公开数据
  导入和 AI 草稿均支持；其他值返回 400。`Accept-Language` 不改写报告。
- 新报告保存 `content.lang` 与 `provenance.lang`；读取时保留原文和旧格式，
  不因界面语言改变内容哈希。
- 已知 API 消息/标签使用 `{code, params}`；未知研究标签和具体失败原因保留
  来源原文，不退化成笼统提示。
- 编辑需要 `baseVersion`；批准还需要 `baseContentHash`。过时提交返回 409。
  已批准报告通过修订产生新版本并重新复核，详见[报告复核](docs/report-version-review-handoff.md)。

患者影像使用物理 LPS 坐标；参考器官使用声明的 RAS 参考坐标。原生标签用于
定量，下采样预览用于显示。参见[影像几何](docs/imaging-geometry.md)。

## 数据与授权

仓库代码采用 [MIT](LICENSE)。内置 BodyParts3D 和 HuBMAP HRA 解剖参考模型
适用独立署名和 CC BY 4.0 条款，见[资产署名](src/assets/organs/ATTRIBUTION.zh-CN.md)。
第三方数据集和模型权重遵守各自许可；公开可获取不等于可用于临床或商业用途。

参见[贡献流程](CONTRIBUTING.md)、[路线图](docs/roadmap.zh-CN.md)、
[临床边界](docs/clinical-boundaries.zh-CN.md)及[变更记录](CHANGELOG.md)。
