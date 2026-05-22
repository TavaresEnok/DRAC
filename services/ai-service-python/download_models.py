import os
import shutil
from pathlib import Path


MODELS_DIR = Path(os.getenv("AI_MODELS_DIR", "/app/models"))


def ensure_insightface() -> None:
    from insightface.app import FaceAnalysis

    for pack in {os.getenv("AI_FACE_PACK", "buffalo_s"), os.getenv("AI_FACE_PACK_REC", "buffalo_l")}:
        app = FaceAnalysis(name=pack, root=str(MODELS_DIR), providers=["CPUExecutionProvider"])
        app.prepare(ctx_id=-1, det_size=(int(os.getenv("AI_FACE_DET_SIZE", "640")), int(os.getenv("AI_FACE_DET_SIZE", "640"))))
        print(f"[models] insightface pack '{pack}' pronto.")


def ensure_yolo() -> None:
    from ultralytics import YOLO

    target = MODELS_DIR / "yolo11n_openvino_model"
    if target.exists():
        print("[models] YOLO11n OpenVINO já existe.")
        return
    model = YOLO("yolo11n.pt")
    exported = Path(model.export(format="openvino"))
    if exported.resolve() != target.resolve():
        if target.exists():
            shutil.rmtree(target)
        shutil.move(str(exported), str(target))
    print("[models] YOLO11n OpenVINO exportado.")


if __name__ == "__main__":
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    ensure_insightface()
    ensure_yolo()
