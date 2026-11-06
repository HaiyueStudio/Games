FROM python:3.11-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 MAHJONG_WEIGHTS=/models
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt && useradd --uid 10001 --create-home mahjong
COPY adapter.py runtime.py server.py models.lock.json ./
COPY vendor ./vendor
USER mahjong
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8787/health', timeout=3)"
CMD ["python", "server.py", "--host", "0.0.0.0", "--port", "8787"]
