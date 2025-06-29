$jsonPath = "..\jsons\status_effects_images.json"
$outputPath = "..\images\status_effects"

# Create output directory if it doesn't exist
New-Item -ItemType Directory -Force -Path $outputPath

# Read and parse JSON file
$images = Get-Content $jsonPath | ConvertFrom-Json

foreach ($image in $images) {
    $outFile = Join-Path $outputPath $image.name
    
    # Skip if file already exists
    if (Test-Path $outFile) {
        Write-Host "Skipping existing file: $($image.name)"
        continue
    }

    Write-Host "Downloading: $($image.name)"
    try {
        Invoke-WebRequest -Uri $image.url -OutFile $outFile
        # Add small delay to be nice to the server
        Start-Sleep -Milliseconds 200
    }
    catch {
        Write-Host "Failed to download: $($image.name)" -ForegroundColor Red
    }
}

Write-Host "Download complete!" -ForegroundColor Green