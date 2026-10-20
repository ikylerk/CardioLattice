import builtins
import json
from types import SimpleNamespace

import pytest

from app import capabilities


def configure(monkeypatch, *, key="", adapter="synthetic_ground_truth"):
    monkeypatch.setattr(
        capabilities,
        "settings",
        SimpleNamespace(anthropic_api_key=key, segmentation_adapter=adapter),
    )


def test_default_reports_template_and_synthetic_without_probing_packages(monkeypatch):
    configure(monkeypatch)

    def unexpected_probe(*args):
        pytest.fail("inactive segmentation adapter must not probe packages")

    monkeypatch.setattr(capabilities.metadata, "version", unexpected_probe)
    result = capabilities.get_runtime_capabilities()
    assert result["reportDraft"]["status"] == "template_only"
    assert result["imageSegmentation"]["status"] == "synthetic_only"
    assert result["imageSegmentation"]["adapter"] == "synthetic_ground_truth"


@pytest.mark.parametrize(
    ("installed", "expected"),
    [(False, "dependency_missing"), (True, "configured_unverified")],
)
def test_totalsegmentator_checks_metadata_without_importing_models(monkeypatch, installed, expected):
    configure(monkeypatch, key="private-test-key", adapter="totalsegmentator")
    probes = []

    def version(package):
        probes.append(package)
        if not installed:
            raise capabilities.metadata.PackageNotFoundError(package)
        return "2.4.0"

    original_import = builtins.__import__

    def guarded_import(name, *args, **kwargs):
        if name.split(".")[0] in {"totalsegmentator", "torch", "anthropic", "SimpleITK"}:
            pytest.fail(f"capability declaration imported a model/SDK: {name}")
        return original_import(name, *args, **kwargs)

    monkeypatch.setattr(capabilities.metadata, "version", version)
    monkeypatch.setattr(builtins, "__import__", guarded_import)
    result = capabilities.get_runtime_capabilities()
    assert probes == ["totalsegmentator"]
    assert result["imageSegmentation"]["status"] == expected
    assert result["reportDraft"]["status"] == "configured_unverified"
    assert set(result) == {"reportDraft", "imageSegmentation"}
    assert set(result["reportDraft"]) == {"status", "reason"}
    assert set(result["imageSegmentation"]) == {"adapter", "status", "reason"}
    assert "private-test-key" not in json.dumps(result)


def test_unsupported_configuration_is_not_echoed_or_treated_as_available(monkeypatch):
    configure(monkeypatch, key="  ", adapter="https://private-gateway.invalid/secret-model")
    result = capabilities.get_runtime_capabilities()
    assert result["reportDraft"]["status"] == "template_only"
    assert result["imageSegmentation"]["status"] == "unsupported"
    assert result["imageSegmentation"]["adapter"] == "unsupported"
    public_json = json.dumps(result, ensure_ascii=False)
    assert "private-gateway" not in public_json
    assert "secret-model" not in public_json
    for capability in result.values():
        assert any("\u4e00" <= char <= "\u9fff" for char in capability["reason"])
