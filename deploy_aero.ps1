# Aero Finance Deployment Script for Google Cloud Run

$PROJECT_ID = gcloud config get-value project
if (-not $PROJECT_ID) {
    Write-Error "No Google Cloud project configured. Please run 'gcloud auth login' and 'gcloud config set project YOUR_PROJECT_ID'."
    exit 1
}

$SERVICE_NAME = "aero-finance"
$REGION = "us-central1"

Write-Host "Deploying $SERVICE_NAME to Google Cloud Run in $REGION..." -ForegroundColor Cyan

# Deploy to Cloud Run
# This will build the image using Google Cloud Build and then deploy it
gcloud run deploy $SERVICE_NAME `
    --source . `
    --region $REGION `
    --platform managed `
    --allow-unauthenticated `
    --set-env-vars="GEMINI_API_KEY=AIzaSyBN3i2QNiuRcfaGwE85BYFlIWs2zqF2OJg,GEMINI_MODEL=gemini-3.5-flash,SECRET_KEY=aero_finance_cloud_2026"

Write-Host "Deployment initiated. Check the URL provided by gcloud above." -ForegroundColor Green
