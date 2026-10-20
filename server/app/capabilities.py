"""Public capability declarations, not runtime/model health probes."""

from importlib import metadata

from .config import settings


def get_runtime_capabilities() -> dict:
    """Read configuration and distribution metadata only; never load a model.

    The result is safe for the public health endpoint. Unknown adapter values
    are not echoed because configuration strings may contain private details.
    """
    if settings.anthropic_api_key.strip():
        report = {
            "status": "configured_unverified",
            "reason": "已配置报告生成服务凭据，尚未验证连通性或生成结果，不代表服务实际可用。",
        }
    else:
        report = {
            "status": "template_only",
            "reason": "未配置报告生成服务凭据，当前仅生成确定性模板草稿。",
        }

    adapter = settings.segmentation_adapter
    if adapter == "synthetic_ground_truth":
        segmentation = {
            "adapter": adapter,
            "status": "synthetic_only",
            "reason": "当前仅启用合成数据真值流程，未启用真实原始影像自动分割。",
        }
    elif adapter == "totalsegmentator":
        try:
            metadata.version("totalsegmentator")
        except metadata.PackageNotFoundError:
            segmentation = {
                "adapter": adapter,
                "status": "dependency_missing",
                "reason": "已选择 TotalSegmentator，但当前环境未安装该依赖，原始影像自动分割不可用。",
            }
        else:
            segmentation = {
                "adapter": adapter,
                "status": "configured_unverified",
                "reason": "已选择 TotalSegmentator 且检测到安装信息；未检查权重、执行推理或验证运行能力。",
            }
    else:
        segmentation = {
            "adapter": "unsupported",
            "status": "unsupported",
            "reason": "配置的原始影像分割适配器不受支持，无法据此启用自动分割。",
        }
    return {"reportDraft": report, "imageSegmentation": segmentation}
