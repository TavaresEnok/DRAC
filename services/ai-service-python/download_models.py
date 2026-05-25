"""
download_models.py — Baixa e valida todos os modelos necessários para /app/models.

Execução:
  python download_models.py

Variáveis de ambiente respeitadas:
  AI_MODELS_DIR    (default /app/models)
Mapeamento de packs:
  buffalo_s → SCRFD-500M (det leve)
  yolo26n_openvino_model → YOLO26n OpenVINO FP32
  yolo26n_int8_openvino_model → YOLO26n OpenVINO INT8
"""
import os
import shutil
from pathlib import Path
from runtime_profiles import FACE_PROFILE


MODELS_DIR = Path(os.getenv("AI_MODELS_DIR", "/app/models"))
MODELS_DIR.mkdir(parents=True, exist_ok=True)


# ──────────────────────────────────────────────────────────────
# InsightFace — packs buffalo (FaceAnalysis)
# ──────────────────────────────────────────────────────────────
def ensure_insightface_pack(pack_name: str) -> None:
    """Garante que um pack buffalo está baixado e inicializável."""
    try:
        from insightface.app import FaceAnalysis
    except ImportError:
        print("[models] insightface não instalado — pulando packs buffalo.")
        return

    det_size = int(FACE_PROFILE["detector_size"])
    app = FaceAnalysis(
        name=pack_name,
        root=str(MODELS_DIR),
        providers=["CPUExecutionProvider"],
    )
    app.prepare(ctx_id=-1, det_size=(det_size, det_size))
    print(f"[models] insightface pack '{pack_name}' OK.")



# ──────────────────────────────────────────────────────────────
# YOLO26n -> exportar para OpenVINO FP32 / INT8
# ──────────────────────────────────────────────────────────────
def _ensure_yolo_export(*, int8: bool, target_name: str, data: str | None = None) -> None:
    try:
        from ultralytics import YOLO
    except ImportError:
        print("[models] ultralytics não instalado — pulando YOLO.")
        return

    target = MODELS_DIR / target_name
    source_pt = Path("yolo26n.pt")
    if not target.exists() or not any(target.iterdir()):
        precision_label = "INT8" if int8 else "FP32"
        print(f"[models] Exportando YOLO26n para OpenVINO {precision_label}...")
        model = YOLO(str(source_pt))
        export_args = {"format": "openvino", "int8": int8}
        if data:
            export_args["data"] = data
        exported = Path(model.export(**export_args))
        if exported.resolve() != target.resolve():
            if target.exists():
                shutil.rmtree(target)
            shutil.move(str(exported), str(target))
    if source_pt.exists():
        source_pt.unlink()
    precision_label = "INT8" if int8 else "FP32"
    print(f"[models] YOLO26n OpenVINO {precision_label} OK.")


def ensure_yolo_fp32() -> None:
    _ensure_yolo_export(int8=False, target_name="yolo26n_openvino_model")


def ensure_yolo_int8() -> None:
    # Ultralytics usa quantização pós-treino e requer dataset de calibração.
    # coco8.yaml é leve e atende para gerar artefato INT8 inicial em CPU.
    try:
        _ensure_yolo_export(int8=True, target_name="yolo26n_int8_openvino_model", data="coco8.yaml")
    except Exception as exc:
        print(f"[models] Falha ao exportar YOLO26n INT8: {exc}")
        print("[models] Seguindo com FP32 disponível.")


# ──────────────────────────────────────────────────────────────
# Entry point
# ──────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print(f"[models] Diretório: {MODELS_DIR}")

    # Packs buffalo:
    #   buffalo_s → SCRFD-500M det  (leve / CPU)
    for pack in {"buffalo_s"}:
        ensure_insightface_pack(pack)

    # YOLO26n OpenVINO INT8 + FP32 (fallback)
    ensure_yolo_int8()
    ensure_yolo_fp32()

    print("[models] Todos os modelos verificados.")
