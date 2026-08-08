import mediapipe as mp
import cv2
import numpy as np
import base64
from typing import Optional


mp_hands = mp.solutions.hands

# Feature vector size: 21 landmarks × 3 coords × 2 hands
FEATURE_DIM = 126


class HandDetector:
    """
    Detects up to 2 hand landmarks from video frames using MediaPipe.
    Supports both jednoručna (one-handed) and dvoručna (two-handed) signs.
    """

    def __init__(
        self,
        max_num_hands: int = 2,
        min_detection_confidence: float = 0.7,
        min_tracking_confidence: float = 0.5,
    ):
        self.hands = mp_hands.Hands(
            static_image_mode=False,
            max_num_hands=max_num_hands,
            min_detection_confidence=min_detection_confidence,
            min_tracking_confidence=min_tracking_confidence,
        )

    def process_base64_frame(self, frame_b64: str) -> Optional[dict]:
        """
        Decode a base64 JPEG frame and extract hand landmarks.

        Returns dict with:
          - "right": list of 21 [x,y,z] or None
          - "left":  list of 21 [x,y,z] or None
          - "any":   True if at least one hand found

        MediaPipe handedness labels are from the camera's perspective
        (mirrored), so we flip them to match real left/right.
        """
        try:
            img_bytes = base64.b64decode(frame_b64)
            img_array = np.frombuffer(img_bytes, dtype=np.uint8)
            img = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
            if img is None:
                return None

            rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
            results = self.hands.process(rgb)

            if not results.multi_hand_landmarks:
                return {"right": None, "left": None, "any": False}

            right_lm = None
            left_lm = None

            for hand_landmarks, handedness in zip(
                results.multi_hand_landmarks, results.multi_handedness
            ):
                # MediaPipe labels from camera POV; flip for real world
                label = handedness.classification[0].label  # "Left" or "Right"
                real_label = "left" if label == "Right" else "right"

                lm_list = [[lm.x, lm.y, lm.z] for lm in hand_landmarks.landmark]

                if real_label == "right" and right_lm is None:
                    right_lm = lm_list
                elif real_label == "left" and left_lm is None:
                    left_lm = lm_list

            return {
                "right": right_lm,
                "left": left_lm,
                "any": right_lm is not None or left_lm is not None,
            }

        except Exception:
            return None

    def close(self):
        self.hands.close()
