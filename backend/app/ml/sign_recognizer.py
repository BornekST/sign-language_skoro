import os
import json
import numpy as np
import threading
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
    Reduce precision while retaining (x, y, z), which training also needs.
    """
    if not landmarks:
        return []
    return [[round(float(v), 4) for v in lm[:3]] for lm in landmarks]


class SignRecognizer:
    """
    Full pipeline: base64 JPEG → MediaPipe → normalize → DTW sequence match.
    A previously trained TensorFlow frame classifier remains available as fallback.
    Supports jednoručna (one-handed) and dvoručna (two-handed) Croatian sign language.
    """

    MODEL_FILE = "sign_model.keras"
    LABELS_FILE = "labels.json"
    SEQUENCES_FILE = "sign_sequences.json"

    def __init__(self, model_path: str):
        self.model_path = model_path
        self.model = None
        self.labels: list[str] = []
        self.sequences: dict[str, list[np.ndarray]] = {}
        self._sequence_buffer: list[np.ndarray] = []
        # MediaPipe Hands is stateful and must not process frames concurrently.
        self._predict_lock = threading.Lock()
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
        model_file = os.path.join(self.model_path, self.MODEL_FILE)
        labels_file = os.path.join(self.model_path, self.LABELS_FILE)
        sequences_file = os.path.join(self.model_path, self.SEQUENCES_FILE)

        self.sequences = {}
        if os.path.exists(sequences_file):
            try:
                with open(sequences_file, "r", encoding="utf-8") as f:
                    raw = json.load(f)
                self.sequences = {
                    label: [np.asarray(seq, dtype=np.float32) for seq in examples]
                    for label, examples in raw.items()
                    if examples
                }
            except Exception as e:
                print(f"[SignRecognizer] Could not load DTW sequences: {e}")

        if os.path.exists(model_file) and os.path.exists(labels_file):
            try:
                tf = _get_tf()
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
        return bool(self.sequences) or (self.model is not None and len(self.labels) > 0)

    def reset_sequence(self):
        self._sequence_buffer = []
        self._last_prediction = (None, 0.0)

    @staticmethod
    def _dtw_distance(query: np.ndarray, reference: np.ndarray) -> float:
        """Length-normalized DTW distance with a small Sakoe-Chiba window."""
        n, m = len(query), len(reference)
        window = max(abs(n - m), int(max(n, m) * 0.25), 2)
        previous = np.full(m + 1, np.inf, dtype=np.float32)
        previous[0] = 0.0
        for i in range(1, n + 1):
            current = np.full(m + 1, np.inf, dtype=np.float32)
            for j in range(max(1, i - window), min(m, i + window) + 1):
                cost = float(np.mean(np.abs(query[i - 1] - reference[j - 1])))
                current[j] = cost + min(current[j - 1], previous[j], previous[j - 1])
            previous = current
        return float(previous[m] / max(n, m))

    def _classify_sequence(self) -> tuple[Optional[str], float]:
        if len(self._sequence_buffer) < settings.sequence_min_frames:
            return None, 0.0
        query = np.asarray(self._sequence_buffer, dtype=np.float32)
        scores: list[tuple[float, str]] = []
        for label, examples in self.sequences.items():
            distances = sorted(self._dtw_distance(query, ref) for ref in examples)
            # More than one reference makes an accidental nearest match less likely.
            score = float(np.mean(distances[:min(3, len(distances))]))
            scores.append((score, label))
        if not scores:
            return None, 0.0
        distance, label = min(scores)
        confidence = max(0.0, min(1.0, 1.0 - distance / settings.dtw_acceptance_distance))
        return (label, confidence) if confidence >= 0.45 else (None, confidence)

    def predict_from_frame(self, frame_b64: str) -> dict:
        with self._predict_lock:
            return self._predict_from_frame_unlocked(frame_b64)

    def _predict_from_frame_unlocked(self, frame_b64: str) -> dict:
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
            self._sequence_buffer = []
            return {
                "hand_detected": False,
                "hands": {"right": False, "left": False},
                "sign": None,
                "confidence": 0.0,
                "landmarks": {"right": [], "left": []},
            }

        features = normalize_landmarks(hand_data, preserve_wrist=bool(self.sequences))

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
            if self.sequences:
                self._sequence_buffer.append(features)
                self._sequence_buffer = self._sequence_buffer[-settings.sequence_max_frames:]
                self._classify_counter += 1
                if self._classify_counter % self.classification_stride == 0:
                    self._last_prediction = self._classify_sequence()
                sign, confidence = self._last_prediction
                result["sign"] = sign
                result["confidence"] = confidence
                result["mode"] = "dtw"
                return result

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
