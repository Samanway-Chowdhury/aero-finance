# Use the official Python slim image
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Copy requirements and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application code
COPY . .

# Expose the port (handled by Cloud Run internally via PORT env var)
# The application logic must listen on 0.0.0.0 and $PORT
ENV PORT 8080

# Command to run the application
# Cloud Run injects the $PORT environment variable
CMD ["sh", "-c", "uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8080}"]
