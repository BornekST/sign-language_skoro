from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Request
from fastapi.concurrency import run_in_threadpool
import json

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

    try:
        while True:
            raw = await websocket.receive_text()
            data = json.loads(raw)
            frame_b64 = data.get("frame", "")

            if not frame_b64:
                continue

            result = await run_in_threadpool(recognizer.predict_from_frame, frame_b64)
            await websocket.send_json(result)

    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await websocket.send_json({"error": str(e)})
        except Exception:
            pass


@router.get("/recognition/status")
async def recognition_status(request: Request):
    recognizer = request.app.state.recognizer
    return {
        "model_loaded": recognizer.is_ready(),
        "num_signs": len(recognizer.labels),
        "signs": recognizer.labels,
    }
