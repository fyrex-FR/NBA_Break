FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PORT=3001

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the backend package as a sub-directory so relative imports resolve
COPY . ./backend/

EXPOSE 3001

CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "3001"]
