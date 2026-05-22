import os
import time

import numpy as np
import requests


class Gallery:
    def __init__(self):
        self.api = os.getenv("API_URL", "http://api:3000").rstrip("/")
        self.token = os.getenv("INTERNAL_SERVICE_TOKEN", "")
        self.ttl = int(os.getenv("AI_GALLERY_TTL", "300"))
        self.names: list[str] = []
        self.person_ids: list[str] = []
        self.matrix = None
        self.loaded_at = 0.0

    def refresh(self, force: bool = False) -> None:
        if not force and time.time() - self.loaded_at < self.ttl:
            return

        response = requests.get(
            f"{self.api}/faces/internal/gallery",
            headers={"X-Service-Token": self.token},
            timeout=5,
        )
        response.raise_for_status()
        data = response.json()
        self.names = [item["name"] for item in data]
        self.person_ids = [item["personId"] for item in data]
        self.matrix = (
            np.array([item["embedding"] for item in data], dtype=np.float32)
            if data
            else None
        )
        if self.matrix is not None:
            norms = np.linalg.norm(self.matrix, axis=1, keepdims=True)
            self.matrix = self.matrix / np.maximum(norms, 1e-12)
        self.loaded_at = time.time()

    def match(self, embedding, threshold: float):
        self.refresh()
        if self.matrix is None or len(self.names) == 0:
            return None, None, 0.0

        emb = np.asarray(embedding, dtype=np.float32)
        emb = emb / max(float(np.linalg.norm(emb)), 1e-12)
        similarities = self.matrix @ emb
        index = int(np.argmax(similarities))
        score = float(similarities[index])
        if score < threshold:
            return None, None, score
        return self.person_ids[index], self.names[index], score
