param([string]$Destination)
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if (-not $Destination) { $Destination = Join-Path ([IO.Path]::GetDirectoryName($projectRoot)) 'GOD-SUBCONSOLE-UPDATED-2026-10-17.zip' }
$Destination = [IO.Path]::GetFullPath($Destination)
if (Test-Path -LiteralPath $Destination) { throw 'Destination already exists. Choose a new ZIP filename.' }
$sources = @('src','server','shared','migrations','scripts','tests','docs','dist','package.json','package-lock.json','tsconfig.json','vite.config.ts','render.yaml','index.html','README.md','setup.ps1','.env.example','.gitignore','.dockerignore')
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$stream = [IO.File]::Open($Destination, [IO.FileMode]::CreateNew)
$archive = [IO.Compression.ZipArchive]::new($stream, [IO.Compression.ZipArchiveMode]::Create, $false)
try {
    foreach ($source in $sources) {
        $sourcePath = Join-Path $projectRoot $source
        $item = Get-Item -LiteralPath $sourcePath
        $files = if ($item.PSIsContainer) { Get-ChildItem -LiteralPath $sourcePath -File -Recurse } else { @($item) }
        foreach ($file in $files) {
            $relative = [IO.Path]::GetRelativePath($projectRoot, $file.FullName).Replace('\','/')
            if ($relative -match '(^|/)(\.env|\.data|node_modules)(/|$)' -or $relative -match 'qa-(browser|seed)') { throw 'Unexpected private file in package source' }
            [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $file.FullName, 'god-subconsole/' + $relative, [IO.Compression.CompressionLevel]::Optimal) | Out-Null
        }
    }
} finally { $archive.Dispose(); $stream.Dispose() }
Write-Output $Destination
