$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if (-not (Test-Path -LiteralPath '.env')) {
    Copy-Item -LiteralPath '.env.example' -Destination '.env'
    $configuration = [IO.File]::ReadAllText((Join-Path $PSScriptRoot '.env'))
    $configuration = $configuration.Replace('SESSION_SECRET=replace-with-at-least-32-random-characters', 'SESSION_SECRET=' + [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)))
    $configuration = $configuration.Replace('INTEGRATION_ENCRYPTION_KEY=replace-with-at-least-32-random-characters', 'INTEGRATION_ENCRYPTION_KEY=' + [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)))
    [IO.File]::WriteAllText((Join-Path $PSScriptRoot '.env'), $configuration)
}
npm ci
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed' }
npm run build
if ($LASTEXITCODE -ne 0) { throw 'Build failed' }
Write-Host 'Ready. Configure PTERODACTYL_CLIENT_API_KEY in .env, then run npm start.'
Write-Host 'With the app running, run npm run bootstrap in another terminal to create the owner.'
