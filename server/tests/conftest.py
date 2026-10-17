from __future__ import annotations

import os
import tempfile
from pathlib import Path

# Configure the app before any test module imports it.
_TEST_DIR = Path(tempfile.mkdtemp(prefix="cardioscope-tests-"))
os.environ["CARDIOSCOPE_VAR_DIR"] = str(_TEST_DIR)
os.environ["RUN_PIPELINE_SYNC"] = "1"
os.environ["SEGMENTATION_ADAPTER"] = "synthetic_ground_truth"
os.environ["DEID_SALT"] = "test-salt"
os.environ["MAX_VOXELS"] = "128"
