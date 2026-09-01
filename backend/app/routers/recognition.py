from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Request
from fastapi.concurrency import run_in_threadpool
import json
import time

router = APIRouter(tags=["recognition"])


@router.websocket("/ws/recognition")
async def recognition_websocket(websocket: WebSocket):
    """
    WebSocket endpoint for real-time sign recognition.

    Client sends:  {"frame": "<base64 JPEG>"}
    Server sends:  {"hand_detected": bool, "sign": str|null, "confidence": float, "landmarks": [...]}
    """
    await websocket.accept()
    recognizer = websocket.app.state.recognizer
    recognizer.reset_sequence()

    try:
        while True:
            raw = await websocket.receive_text()
            data = json.loads(raw)
            frame_b64 = data.get("frame", "")

            if not frame_b64:
                continue

            started = time.perf_counter()
            result = await run_in_threadpool(recognizer.predict_from_frame, frame_b64)
            result["processing_ms"] = round((time.perf_counter() - started) * 1000, 2)
            await websocket.send_json(result)

    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"[recognition websocket] {type(e).__name__}: {e}")
        try:
            await websocket.send_json({"error": str(e)})
        except Exception:
            pass


@router.get("/recognition/status")
async def recognition_status(request: Request):
    recognizer = request.app.state.recognizer
    sequence_labels = sorted(recognizer.sequences.keys())
    labels = sequence_labels or recognizer.labels
    return {
        "model_loaded": recognizer.is_ready(),
        "mode": "dtw" if sequence_labels else "tensorflow",
        "num_signs": len(labels),
        "signs": labels,
    }
