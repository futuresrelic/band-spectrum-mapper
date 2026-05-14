FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Python reads $PORT directly — no shell expansion needed
CMD ["python", "main.py"]
