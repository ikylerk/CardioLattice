FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    CARDIOSCOPE_VAR_DIR=/data

WORKDIR /app

RUN pip install --no-cache-dir uv

COPY server/pyproject.toml server/uv.lock ./
RUN uv sync --frozen --no-dev

COPY server/app ./app
COPY server/scripts ./scripts
COPY shared ./shared

RUN mkdir -p /data
EXPOSE 8000

CMD ["uv", "run", "--frozen", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
