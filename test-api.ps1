$demande = "passe dans la vue 3D du dessus"

$body = @{
    type_agent   = "navigateur"
    titre        = "test"
    demande_brute = $demande
} | ConvertTo-Json -Compress

$body | Set-Content -Encoding utf8 body.json

$response = curl.exe -s http://127.0.0.1:8001/api/taches `
    -H "Content-Type: application/json" `
    --data-binary "@body.json"

Write-Host ""
Write-Host "=== DEMANDE ===" -ForegroundColor Cyan
Write-Host $demande
Write-Host ""
Write-Host "=== REPONSE ===" -ForegroundColor Green
Write-Host $response