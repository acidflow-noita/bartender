# Define paths relative to the script's location
$urlsFile = Join-Path -Path $PSScriptRoot -ChildPath "status_effects_images_urls_list.txt"
$resultsFile = Join-Path -Path $PSScriptRoot -ChildPath "STATUS_EFFECTS_RAW_IMAGES_URLS_RESPONSES.txt"

# Read each URL from the status_effects_images_urls_list.txt file
$urls = Get-Content $urlsFile

# Loop through each URL and make the request with a 2-second delay between requests
foreach ($url in $urls) {
    # Perform the curl request (use Invoke-RestMethod if curl is unavailable)
    try {
        Start-Sleep -Seconds 2
        
        $response = Invoke-RestMethod -Uri $url -Method Get

        # Append the JSON response to STATUS_EFFECTS_RAW_IMAGES_URLS_RESPONSES.txt with increased depth
        $response | ConvertTo-Json -Depth 5 | Out-File -Append -FilePath $resultsFile

        # Optionally, add a separator to clearly distinguish different responses
        "`n`n--- End of Response ---`n" | Out-File -Append -FilePath $resultsFile
    } catch {
        Write-Error ("Failed to fetch data from $($url): $_")
    }
}
