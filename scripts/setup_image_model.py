"""Explicit one-time download; deployment and inference never fetch model files."""
import hashlib
import io
import json
from pathlib import Path
import urllib.request
import zipfile

EXPECTED = "c15d8273adad2d0a92f014cc69ab2d6c311a06777a55545f2c4eb46f51911f0f"
root = Path(__file__).resolve().parents[1] / "backend" / "models"
target = root / "nudenet-320.onnx"
if target.exists():
    if hashlib.sha256(target.read_bytes()).hexdigest() != EXPECTED:
        raise SystemExit("Existing model checksum mismatch; refusing to overwrite.")
    print("Pinned local model already verified.")
else:
    metadata = json.load(urllib.request.urlopen("https://pypi.org/pypi/nudenet/3.4.2/json", timeout=30))
    artifact = next(item for item in metadata["urls"] if item["filename"] == "nudenet-3.4.2-py3-none-any.whl")
    print(f"Downloading {artifact['size'] / 1_000_000:.1f} MB package for the 12.2 MB CPU model.", flush=True)
    with urllib.request.urlopen(artifact["url"], timeout=60) as response:
        data = response.read(15_000_001)
    if len(data) != artifact["size"] or hashlib.sha256(data).hexdigest() != artifact["digests"]["sha256"]:
        raise SystemExit("Package verification failed.")
    archive = zipfile.ZipFile(io.BytesIO(data))
    model = archive.read("nudenet/320n.onnx")
    if hashlib.sha256(model).hexdigest() != EXPECTED:
        raise SystemExit("Model verification failed.")
    root.mkdir(exist_ok=True)
    (root / "NUDENET-LICENSE").write_bytes(archive.read("nudenet-3.4.2.dist-info/LICENSE"))
    partial = target.with_suffix(".partial")
    partial.write_bytes(model)
    partial.replace(target)
    print("Local model verified and ready. Runtime needs no internet.")
