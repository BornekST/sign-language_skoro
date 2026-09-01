import numpy as np
from typing import Optional

# 21 landmarks × 3 coords × 2 hands
FEATURE_DIM = 126


def _normalize_single(landmarks: list[list[float]], preserve_wrist: bool = False) -> Optional[np.ndarray]:
    """
    Normalize one hand's 21 landmarks:
    - Translate so wrist (index 0) is at origin.
    - Scale by distance wrist → middle finger MCP (index 9).
    Returns flat (63,) array or None.
    """
    pts = np.array(landmarks, dtype=np.float32)
    wrist_position = pts[0].copy()
    pts -= pts[0]
    scale = float(np.linalg.norm(pts[9]))
    if scale < 1e-6:
        return None
    pts /= scale
    # The wrist slot would otherwise always be zero. Keeping its camera-space
    # position lets a time-sequence model observe the hand's movement path.
    if preserve_wrist:
        pts[0] = wrist_position
    return pts.flatten()


def normalize_landmarks(hand_data: dict, preserve_wrist: bool = False) -> Optional[np.ndarray]:
    """
    Build a 126-dim feature vector from detected hands.
    Layout: [right_hand(63)] + [left_hand(63)]
    Missing hand → zeros (allows jednoručna + dvoručna in same model).
    Returns None only if no hand was detected at all.
    """
    if not hand_data or not hand_data.get("any"):
        return None

    right_features = np.zeros(63, dtype=np.float32)
    left_features = np.zeros(63, dtype=np.float32)

    if hand_data["right"] is not None:
        r = _normalize_single(hand_data["right"], preserve_wrist)
        if r is not None:
            right_features = r

    if hand_data["left"] is not None:
        lf = _normalize_single(hand_data["left"], preserve_wrist)
        if lf is not None:
            left_features = lf

    return np.concatenate([right_features, left_features])
