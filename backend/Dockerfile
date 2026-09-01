FROM python:3.11-slim

# System dependencies for OpenCV and MediaPipe
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    espeak-ng \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .

# Install heavy ML packages first (separate layer = cached if unchanged)
RUN pip install --no-cache-dir --timeout=300 --retries=5 \
    tensorflow-cpu==2.18.0 \
    mediapipe==0.10.18 \
    opencv-python-headless==4.10.0.84

# Install remaining dependencies
RUN pip install --no-cache-dir --timeout=120 --retries=3 \
    -r requirements.txt

COPY . .

RUN mkdir -p app/ml/saved_models

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
