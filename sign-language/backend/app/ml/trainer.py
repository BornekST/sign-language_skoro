import os
import json
import asyncio
import numpy as np
from typing import Callable, Optional

_tf = None


def _get_tf():
    global _tf
    if _tf is None:
        import tensorflow as tf
        _tf = tf
    return _tf


def build_model(num_classes: int, input_dim: int = 126):
    tf = _get_tf()
    model = tf.keras.Sequential(
        [
            tf.keras.layers.Input(shape=(input_dim,)),
            tf.keras.layers.Dense(128, activation="relu"),
            tf.keras.layers.BatchNormalization(),
            tf.keras.layers.Dropout(0.3),
            tf.keras.layers.Dense(64, activation="relu"),
            tf.keras.layers.BatchNormalization(),
            tf.keras.layers.Dropout(0.3),
            tf.keras.layers.Dense(num_classes, activation="softmax"),
        ]
    )
    model.compile(
        optimizer="adam",
        loss="sparse_categorical_crossentropy",
        metrics=["accuracy"],
    )
    return model


def train_model(
    samples: list[dict],  # [{"label": str, "features": list[float]}]
    model_path: str,
    epochs: int = 50,
    progress_cb: Optional[Callable[[int, int, float], None]] = None,
) -> dict:
    """
    Train a sign classifier from collected feature samples.
    Returns {"success": bool, "accuracy": float, "num_classes": int}.
    """
    tf = _get_tf()

    if len(samples) < 2:
        return {"success": False, "error": "Need at least 2 samples"}

    labels_set = sorted(set(s["label"] for s in samples))
    label_to_idx = {lbl: i for i, lbl in enumerate(labels_set)}

    X = np.array([s["features"] for s in samples], dtype=np.float32)
    y = np.array([label_to_idx[s["label"]] for s in samples], dtype=np.int32)

    # Shuffle
    idx = np.random.permutation(len(X))
    X, y = X[idx], y[idx]

    model = build_model(num_classes=len(labels_set))

    class ProgressCallback(tf.keras.callbacks.Callback):
        def on_epoch_end(self, epoch, logs=None):
            if progress_cb:
                acc = float((logs or {}).get("accuracy", 0.0))
                progress_cb(epoch + 1, epochs, acc)

    model.fit(
        X,
        y,
        epochs=epochs,
        batch_size=32,
        validation_split=0.15 if len(X) > 20 else 0.0,
        callbacks=[ProgressCallback()],
        verbose=0,
    )

    os.makedirs(model_path, exist_ok=True)
    model.save(os.path.join(model_path, "sign_model.keras"))
    with open(os.path.join(model_path, "labels.json"), "w") as f:
        json.dump(labels_set, f)

    _, acc = model.evaluate(X, y, verbose=0)
    return {"success": True, "accuracy": float(acc), "num_classes": len(labels_set)}


async def train_model_async(
    samples: list[dict],
    model_path: str,
    epochs: int = 50,
    progress_cb: Optional[Callable[[int, int, float], None]] = None,
) -> dict:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        None, lambda: train_model(samples, model_path, epochs, progress_cb)
    )
