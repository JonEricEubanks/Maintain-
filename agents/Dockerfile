FROM python:3.12-slim

WORKDIR /app

# Ensure UTF-8 encoding everywhere (pip, Python, etc.)
ENV PYTHONIOENCODING=utf-8
ENV LANG=C.UTF-8
ENV LC_ALL=C.UTF-8
ENV PYTHONUTF8=1

# Install dependencies
COPY requirements.txt .
RUN PYTHONIOENCODING=utf-8 LANG=C.UTF-8 LC_ALL=C.UTF-8 pip install --no-cache-dir --quiet -r requirements.txt

# Copy agent code
COPY . .

# SECURITY: Run as non-root user
RUN useradd --create-home --shell /bin/bash appuser && \
    chown -R appuser:appuser /app
USER appuser

# Expose port
EXPOSE 8100

# Run the FastAPI server
CMD ["uvicorn", "api_server:app", "--host", "0.0.0.0", "--port", "8100"]
