<# 
.SYNOPSIS
  Deploy InfraWatch AI agent backend to Azure Container Apps
  using the existing procert-ai-rg resource group.

.DESCRIPTION
  Builds the Docker image, pushes to infrawatchacr, and updates
  the infrawatch-agents Container App in procert-ai-rg.

.NOTES
  Prerequisites:
    - Azure CLI (az) installed and logged in
    - Docker Desktop running
    - .env file with secrets (never committed)

.EXAMPLE
  .\deploy-aca.ps1
  .\deploy-aca.ps1 -SkipBuild   # redeploy existing image
#>

param(
    [switch]$SkipBuild,
    [string]$Tag = "latest",
    [Parameter(Mandatory=$true)][string]$ResourceGroup,
    [string]$ContainerApp = "infrawatch-agents",
    [string]$ContainerEnv = "infrawatch-env",
    [Parameter(Mandatory=$true)][string]$AcrName,
    [string]$Location = "eastus"
)

# ============================================
# Configuration
# ============================================
$AcrLoginServer = "$AcrName.azurecr.io"
$ImageName = "infrawatch-agents"
$FullImage = "$AcrLoginServer/${ImageName}:$Tag"

Write-Host "======================================" -ForegroundColor Cyan
Write-Host "  InfraWatch AI — ACA Deployment"      -ForegroundColor Cyan
Write-Host "  Resource Group: $ResourceGroup"       -ForegroundColor Cyan
Write-Host "  Container App:  $ContainerApp"        -ForegroundColor Cyan
Write-Host "  ACR:            $AcrLoginServer"      -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan

# ============================================
# Step 1: Verify Azure login
# ============================================
Write-Host "`n[1/5] Checking Azure login..." -ForegroundColor Yellow
$account = az account show --query "name" -o tsv 2>$null
if (-not $account) {
    Write-Host "Not logged in. Running az login..." -ForegroundColor Red
    az login
}
Write-Host "  Subscription: $account" -ForegroundColor Green

# Verify resource group exists
$rgExists = az group exists --name $ResourceGroup
if ($rgExists -ne "true") {
    Write-Error "Resource group '$ResourceGroup' not found. Please check your subscription."
    exit 1
}
Write-Host "  Resource group '$ResourceGroup' confirmed." -ForegroundColor Green

# ============================================
# Step 2: Login to ACR
# ============================================
Write-Host "`n[2/5] Logging into Container Registry..." -ForegroundColor Yellow
az acr login --name $AcrName
if ($LASTEXITCODE -ne 0) {
    Write-Error "ACR login failed. Make sure Docker Desktop is running."
    exit 1
}
Write-Host "  ACR login successful." -ForegroundColor Green

# ============================================
# Step 3: Build Docker image
# ============================================
if (-not $SkipBuild) {
    Write-Host "`n[3/5] Building Docker image..." -ForegroundColor Yellow
    Push-Location $PSScriptRoot  # agents/ directory
    docker build -t $FullImage .
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Docker build failed."
        Pop-Location
        exit 1
    }
    Pop-Location
    Write-Host "  Image built: $FullImage" -ForegroundColor Green

    # Step 4: Push to ACR
    Write-Host "`n[4/5] Pushing image to ACR..." -ForegroundColor Yellow
    docker push $FullImage
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Docker push failed."
        exit 1
    }
    Write-Host "  Image pushed." -ForegroundColor Green
} else {
    Write-Host "`n[3/5] Skipping build (-SkipBuild)." -ForegroundColor DarkGray
    Write-Host "[4/5] Skipping push." -ForegroundColor DarkGray
}

# ============================================
# Step 5: Update Container App
# ============================================
Write-Host "`n[5/5] Updating Container App '$ContainerApp'..." -ForegroundColor Yellow

# Check if the container app already exists
$appExists = az containerapp show `
    --name $ContainerApp `
    --resource-group $ResourceGroup `
    --query "name" -o tsv 2>$null

if ($appExists) {
    # Update existing app with new image
    az containerapp update `
        --name $ContainerApp `
        --resource-group $ResourceGroup `
        --image $FullImage
} else {
    # Create new container app
    Write-Host "  Container App not found — creating '$ContainerApp'..." -ForegroundColor Yellow
    az containerapp create `
        --name $ContainerApp `
        --resource-group $ResourceGroup `
        --environment $ContainerEnv `
        --image $FullImage `
        --registry-server $AcrLoginServer `
        --target-port 8100 `
        --ingress external `
        --cpu 0.5 `
        --memory 1.0Gi `
        --min-replicas 0 `
        --max-replicas 3 `
        --env-vars `
        "AZURE_OPENAI_ENDPOINT=secretref:azure-openai-endpoint" `
        "AZURE_AI_API_KEY=secretref:azure-ai-api-key" `
        "AZURE_CONTENT_SAFETY_ENDPOINT=secretref:content-safety-endpoint" `
        "AZURE_CONTENT_SAFETY_KEY=secretref:content-safety-key" `
        "INFRAWATCH_MCP_ENDPOINT=secretref:mcp-endpoint" `
        "AZURE_STORAGE_CONNECTION_STRING=secretref:storage-connection" `
        "APPLICATIONINSIGHTS_CONNECTION_STRING=secretref:appinsights-connection"
}

if ($LASTEXITCODE -ne 0) {
    Write-Error "Container App update failed."
    exit 1
}

# Get the app URL
$fqdn = az containerapp show `
    --name $ContainerApp `
    --resource-group $ResourceGroup `
    --query "properties.configuration.ingress.fqdn" -o tsv

Write-Host "`n======================================" -ForegroundColor Green
Write-Host "  Deployment complete!" -ForegroundColor Green
Write-Host "  Agent API: https://$fqdn" -ForegroundColor Green
Write-Host "  Health:    https://$fqdn/health" -ForegroundColor Green
Write-Host "======================================" -ForegroundColor Green

Write-Host "`nNext steps:" -ForegroundColor Yellow
Write-Host "  1. Set secrets:  az containerapp secret set --name $ContainerApp -g $ResourceGroup --secrets <key>=<value>"
Write-Host "  2. Update .env:  REACT_APP_AGENT_API_URL=https://$fqdn"
Write-Host "  3. Rebuild UI:   npm run build && pac code push"
