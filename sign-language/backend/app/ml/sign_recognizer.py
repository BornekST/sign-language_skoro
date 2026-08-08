import os
import json
import numpy as np
from typing import Optional
from app.ml.hand_detector import HandDetector
from app.ml.preprocessor import normalize_landmarks
from app.config import get_settings

settings = get_settings()

_tf = None


def _get_tf():
    global _tf
    if _tf is None:
        import tensorflow as tf
        _tf = tf
    return _tf


def _compact_landmarks(landmarks: Optional[list[list[float]]]) -> list[list[float]]:
    """
    Keep only (x, y) with reduced precision for websocket payload efficiency.
    """
    if not landmarks:
        return []
    return [[round(float(lm[0]), 4), round(float(lm[1]), 4)] for lm in landmarks]


class SignRecognizer:
    """
    Full pipeline: base64 JPEG → MediaPipe (both hands) → normalize → TF classify.
    Supports jednoručna (one-handed) and dvoručna (two-handed) Croatian sign language.
    """

    MODEL_FILE = "sign_model.keras"
    LABELS_FILE = "labels.json"

    def __init__(self, model_path: str):
        self.model_path = model_path
        self.model = None
        self.labels: list[str] = []
        self.detector = HandDetector(
            max_num_hands=settings.max_num_hands,
            min_detection_confidence=settings.min_detection_confidence,
            min_tracking_confidence=settings.min_tracking_confidence,
        )
        self.classification_stride = max(1, int(settings.classification_stride))
        self._classify_counter = 0
        self._last_prediction: tuple[Optional[str], float] = (None, 0.0)
        self._load()

    def _load(self):
        tf = _get_tf()
        model_file = os.path.join(self.model_path, self.MODEL_FILE)
        labels_file = os.path.join(self.model_path, self.LABELS_FILE)

        if os.path.exists(model_file) and os.path.exists(labels_file):
            try:
                self.model = tf.keras.models.load_model(model_file)
                with open(labels_file, "r") as f:
                    self.labels = json.load(f)
            except Exception as e:
                print(f"[SignRecognizer] Could not load model: {e}")
                self.model = None
                self.labels = []

    def reload(self):
        self._load()

    def is_ready(self) -> bool:
        return self.model is not None and len(self.labels) > 0

    def predict_from_frame(self, frame_b64: str) -> dict:
        """
        Returns:
          hand_detected: bool
          hands: {"right": bool, "left": bool}
          sign: str | null
          confidence: float
          landmarks: {"right": [...] | null, "left": [...] | null}
        """
        hand_data = self.detector.process_base64_frame(frame_b64)

        if not hand_data or not hand_data["any"]:
            self._classify_counter = 0
            self._last_prediction = (None, 0.0)
            return {
                "hand_detected": False,
                "hands": {"right": False, "left": False},
                "sign": None,
                "confidence": 0.0,
                "landmarks": {"right": [], "left": []},
            }

        features = normalize_landmarks(hand_data)

        result = {
            "hand_detected": True,
            "hands": {
                "right": hand_data["right"] is not None,
                "left": hand_data["left"] is not None,
            },
            "landmarks": {
                "right": _compact_landmarks(hand_data["right"]),
                "left": _compact_landmarks(hand_data["left"]),
            },
            "sign": None,
            "confidence": 0.0,
        }

        if features is not None and self.is_ready():
            self._classify_counter += 1
            should_classify = (
                self._last_prediction[0] is None
                or self._classify_counter % self.classification_stride == 0
            )
            if should_classify:
                self._last_prediction = self._classify(features)

            sign, confidence = self._last_prediction
            result["sign"] = sign
            result["confidence"] = confidence

        return result

    def _classify(self, features: np.ndarray) -> tuple[Optional[str], float]:
        probs = self.model.predict(features.reshape(1, -1), verbose=0)[0]
        idx = int(np.argmax(probs))
        return self.labels[idx], float(probs[idx])
