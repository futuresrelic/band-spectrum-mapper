FROM python:3.11-slim

# ffmpeg: required by yt-dlp for audio extraction/conversion
# nodejs: required by yt-dlp as a JavaScript runtime for modern YouTube extraction
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Python reads $PORT directly — no shell expansion needed
CMD ["python", "main.py"]
