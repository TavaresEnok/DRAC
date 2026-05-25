import os
import threading
from queue import Empty, Queue

import cv2
import numpy as np
import supervision as sv

from .base import Detection, Detector
from onnxruntime_session import inference_threading_status
from runtime_profiles import GENERAL_PROFILE


PERSON_CLASS_ID = 0


class ObjectDetector(Detector):
    event_type = "OBJECT_DETECTED"

    def __init__(self):
        self.input_size = int(GENERAL_PROFILE["imgsz"])
        self.model_name = str(GENERAL_PROFILE.get("model", "yolo26n")).strip().lower()
        self.requested_precision = str(GENERAL_PROFILE.get("precision", "fp32")).strip().lower()
        self.min_conf = float(GENERAL_PROFILE["confidence_person"])
        self.min_object_height = int(GENERAL_PROFILE["min_object_height_px"])
        self.track_buffer = int(GENERAL_PROFILE["track_buffer"])
        threading_plan = inference_threading_status()
        self.inference_threads = int(threading_plan["threads_per_worker"])
        self.inference_workers = int(threading_plan["effective_workers"])
        self.model = None
        self.output = None
        self.input = None
        self.loaded_model_path = ""
        self.loaded_precision = "fp32"
        self._infer_request_pool: Queue | None = None
        self._tracker_lock = threading.Lock()
        self._trackers: dict[str, sv.ByteTrack] = {}
        self._pool_busy_drops = 0
        self._input_size_override_supported: bool | None = None

    def _candidate_model_dirs(self) -> list[str]:
        base_dir = "/app/models"
        fp32_names = [
            f"{self.model_name}_openvino_model",
            f"{self.model_name}_fp32_openvino_model",
            f"{self.model_name}_openvino_fp32_model",
        ]
        int8_names = [
            f"{self.model_name}_int8_openvino_model",
            f"{self.model_name}_openvino_int8_model",
            f"{self.model_name}_openvino_model_int8",
        ]
        ordered_names = int8_names + fp32_names if self.requested_precision == "int8" else fp32_names + int8_names
        unique_names: list[str] = []
        for name in ordered_names:
            if name not in unique_names:
                unique_names.append(name)
        return [os.path.join(base_dir, name) for name in unique_names]

    def _resolve_model_xml(self) -> tuple[str, str]:
        searched: list[str] = []
        for candidate in self._candidate_model_dirs():
            searched.append(candidate)
            if not os.path.exists(candidate):
                continue
            if os.path.isfile(candidate) and candidate.endswith(".xml"):
                precision = "int8" if "int8" in os.path.basename(candidate).lower() else "fp32"
                return candidate, precision
            if os.path.isdir(candidate):
                xml_files = sorted([p for p in os.listdir(candidate) if p.endswith(".xml")])
                if not xml_files:
                    continue
                model_xml = os.path.join(candidate, xml_files[0])
                precision = "int8" if "int8" in os.path.basename(candidate).lower() else "fp32"
                return model_xml, precision
        joined = ", ".join(searched)
        raise RuntimeError(f"Modelo OpenVINO não encontrado. Diretórios testados: {joined}")

    def load(self) -> None:
        if self.model is not None:
            return
        try:
            import openvino as ov
        except Exception as exc:
            raise RuntimeError("Dependência openvino ausente para ObjectDetector.") from exc
        model_xml, loaded_precision = self._resolve_model_xml()
        self.loaded_model_path = model_xml
        self.loaded_precision = loaded_precision

        core = ov.Core()
        model = core.read_model(model_xml)
        # A single shared model serves every camera. The automatic server-side
        # budget prevents a 640px inference from monopolizing the host and
        # starving WebRTC/transcoding/API work.
        properties = {
            "PERFORMANCE_HINT": "LATENCY",
            "NUM_STREAMS": str(max(1, self.inference_workers)),
            "INFERENCE_NUM_THREADS": self.inference_threads,
        }
        try:
            self.model = core.compile_model(model, "CPU", properties)
        except Exception:
            self.model = core.compile_model(model, "CPU")
        self.input = self.model.input(0)
        self.output = self.model.output(0)
        worker_count = max(1, self.inference_workers)
        self._infer_request_pool = Queue(maxsize=worker_count)
        for _ in range(worker_count):
            self._infer_request_pool.put(self.model.create_infer_request())
        print(
            f"[ObjectDetector] Carregado model='{model_xml}' requested_precision='{self.requested_precision}' "
            f"active_precision='{self.loaded_precision}' classes='person' "
            f"inference_threads={self.inference_threads} infer_workers={worker_count}"
        )

    def _preprocess(self, frame, target_size: int | None = None):
        input_size = int(target_size or self.input_size)
        h, w = frame.shape[:2]
        scale = min(input_size / w, input_size / h)
        resized_w = int(round(w * scale))
        resized_h = int(round(h * scale))
        pad_x = (input_size - resized_w) // 2
        pad_y = (input_size - resized_h) // 2

        resized = cv2.resize(frame, (resized_w, resized_h), interpolation=cv2.INTER_LINEAR)
        canvas = np.full((input_size, input_size, 3), 114, dtype=np.uint8)
        canvas[pad_y:pad_y + resized_h, pad_x:pad_x + resized_w] = resized
        blob = canvas[:, :, ::-1].transpose(2, 0, 1).astype(np.float32) / 255.0
        return blob[None, ...], scale, pad_x, pad_y, w, h, input_size

    def _track_people(self, detections: list[Detection], context_key: str) -> list[Detection]:
        with self._tracker_lock:
            tracker = self._trackers.get(context_key)
            if tracker is None:
                tracker = sv.ByteTrack(
                    track_activation_threshold=self.min_conf,
                    lost_track_buffer=self.track_buffer,
                    frame_rate=int(GENERAL_PROFILE["detection_fps"]),
                    minimum_consecutive_frames=1,
                )
                self._trackers[context_key] = tracker
            if detections:
                values = sv.Detections(
                    xyxy=np.asarray([item.bbox for item in detections], dtype=np.float32),
                    confidence=np.asarray([item.confidence for item in detections], dtype=np.float32),
                    class_id=np.zeros(len(detections), dtype=int),
                )
            else:
                values = sv.Detections.empty()
            tracked = tracker.update_with_detections(values)

        output: list[Detection] = []
        tracker_ids = tracked.tracker_id if tracked.tracker_id is not None else []
        confidences = tracked.confidence if tracked.confidence is not None else []
        for bbox, score, track_id in zip(tracked.xyxy, confidences, tracker_ids):
            output.append(
                Detection(
                    label="pessoa",
                    confidence=float(score),
                    bbox=[int(value) for value in bbox.tolist()],
                    extra={
                        "classId": PERSON_CLASS_ID,
                        "overlayMode": GENERAL_PROFILE["overlay_mode"],
                        "trackId": int(track_id),
                    },
                )
            )
        return output

    def infer(self, frame, context_key: str | None = None, input_size_hint: int | None = None, **kwargs) -> list[Detection]:
        if self.model is None:
            self.load()

        requested_size = int(input_size_hint) if input_size_hint else self.input_size
        requested_size = max(128, min(self.input_size, requested_size))
        if self._input_size_override_supported is False:
            requested_size = self.input_size
        elif requested_size != self.input_size and self._input_size_override_supported is None:
            pass

        blob, scale, pad_x, pad_y, width, height, used_input_size = self._preprocess(frame, requested_size)
        pool = self._infer_request_pool
        if pool is None:
            return []
        # Latest-frame semantics: if no request is available now, drop this
        # frame and let the next loop consume the newest one from the camera queue.
        try:
            infer_request = pool.get_nowait()
        except Empty:
            self._pool_busy_drops += 1
            return []
        try:
            try:
                infer_request.infer({self.input: blob})
                raw = np.array(infer_request.get_output_tensor(0).data, copy=True)
                if used_input_size != self.input_size:
                    self._input_size_override_supported = True
            except Exception:
                if used_input_size == self.input_size:
                    raise
                self._input_size_override_supported = False
                blob, scale, pad_x, pad_y, width, height, _ = self._preprocess(frame, self.input_size)
                infer_request.infer({self.input: blob})
                raw = np.array(infer_request.get_output_tensor(0).data, copy=True)
        finally:
            pool.put(infer_request)
        rows = np.squeeze(raw, axis=0)

        detections: list[Detection] = []
        for row in rows:
            if len(row) < 6:
                continue
            x1, y1, x2, y2, score, cls_id = row[:6]
            if score < self.min_conf:
                continue
            cls = int(cls_id)
            if cls != PERSON_CLASS_ID:
                continue
            x1 = int(max(0, min(width, (float(x1) - pad_x) / scale)))
            y1 = int(max(0, min(height, (float(y1) - pad_y) / scale)))
            x2 = int(max(0, min(width, (float(x2) - pad_x) / scale)))
            y2 = int(max(0, min(height, (float(y2) - pad_y) / scale)))
            if x2 <= x1 or y2 <= y1 or (y2 - y1) < self.min_object_height:
                continue
            detections.append(
                Detection(
                    label="pessoa",
                    confidence=float(score),
                    bbox=[x1, y1, x2, y2],
                    extra={"classId": cls, "overlayMode": GENERAL_PROFILE["overlay_mode"]},
                )
            )
        if GENERAL_PROFILE["persistent_track_id"] and context_key:
            return self._track_people(detections, context_key)
        return detections

    def status(self) -> dict:
        return {
            "model": self.model_name,
            "requested_precision": self.requested_precision,
            "active_precision": self.loaded_precision,
            "inference_threads": self.inference_threads,
            "infer_workers": self.inference_workers,
            "pool_busy_drops": self._pool_busy_drops,
            "loaded_model_path": self.loaded_model_path,
            "input_size_override_supported": self._input_size_override_supported,
        }
