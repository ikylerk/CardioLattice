from __future__ import annotations

import json

import pytest
from fastapi import HTTPException

from app.codes import CodedError, abort, as_coded, coded, http_error, store
from app.imaging.dicom import load_series


def test_code_parameter_round_trips_through_message_helpers():
    expected = {"code": "VOLUME", "params": {"code": "CORONARY_LEFT", "detail": "原始信息"}}
    assert coded("VOLUME", code="CORONARY_LEFT", detail="原始信息") == expected
    persisted = store("VOLUME", code="CORONARY_LEFT", detail="原始信息")
    assert json.loads(persisted) == expected
    assert as_coded(persisted) == expected
    assert store("STAGE_QUEUED") == "STAGE_QUEUED"
    with pytest.raises(HTTPException) as caught:
        abort("VOLUME", 422, code="CORONARY_LEFT", detail="原始信息")
    assert caught.value.status_code == 422
    assert caught.value.detail == expected


def test_coded_error_preserves_value_error_catch_and_structured_parameters():
    with pytest.raises(ValueError) as caught:
        raise CodedError("VOLUME_SIZE", status_code=422, code="LEFT", dims=[2, 3, 4])
    error = caught.value
    assert isinstance(error, CodedError)
    assert str(error) == "VOLUME_SIZE"
    expected = {"code": "VOLUME_SIZE", "params": {"code": "LEFT", "dims": [2, 3, 4]}}
    assert error.body() == expected
    assert as_coded(store(error.code, **error.params)) == expected
    assert http_error(error).status_code == 422
    assert http_error(error).detail == expected


def test_direct_dicom_validation_retains_value_error_compatibility():
    with pytest.raises(ValueError) as caught:
        load_series([])
    assert isinstance(caught.value, CodedError)
    assert caught.value.body() == {"code": "TOO_FEW_SLICES", "params": {}}
