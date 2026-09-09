#Requires -Version 7.0
<#
.SYNOPSIS
Bumps a named plugin's release version and matching npm lockfile metadata.
.EXAMPLE
./bump-plugin-version.ps1 geist minor
.EXAMPLE
./bump-plugin-version.ps1 -PluginName geist -Bump patch -WhatIf
#>
[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory, Position = 0)]
    [ValidatePattern('^[a-z0-9]+(?:-[a-z0-9]+)*$')]
    [string] $PluginName,

    [Parameter(Mandatory, Position = 1)]
    [Alias('Part', 'Increment')]
    [ValidateSet('major', 'minor', 'patch')]
    [string] $Bump
)

$ErrorActionPreference = 'Stop'
$pluginRoot = Join-Path $PSScriptRoot "plugins/$PluginName"
if (-not (Test-Path -LiteralPath $pluginRoot -PathType Container)) {
    throw "Plugin not found: $PluginName"
}

$updates = [System.Collections.Generic.List[object]]::new()
function Read-VersionDocument([string] $Path) {
    # Updating a linked file could change another plugin or an external checkout.
    $item = Get-Item -LiteralPath $Path
    while ($item.FullName -ne $PSScriptRoot) {
        if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
            throw "Version files must not traverse links: $Path"
        }
        $item = Get-Item -LiteralPath (Split-Path -Parent $item.FullName)
    }
    return Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json -AsHashtable
}

foreach ($relative in @('plugin.json', '.codex-plugin/plugin.json', '.github/plugin/plugin.json', '.claude-plugin/plugin.json', 'package.json')) {
    $path = Join-Path $pluginRoot $relative
    if (-not (Test-Path -LiteralPath $path)) { continue }
    $document = Read-VersionDocument $path
    if ($document.name -cne $PluginName) { throw "Plugin name mismatch in $path" }
    $updates.Add(@{ Path = $path; Document = $document; Targets = @($document) })
}
if ($updates.Count -eq 0) { throw "No version manifests found for $PluginName" }
$currentVersion = $updates[0].Document.version
if ($currentVersion -isnot [string] -or $currentVersion -cnotmatch '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$') {
    throw "Expected a stable major.minor.patch version, found '$currentVersion'"
}
$major, $minor, $patch = $currentVersion.Split('.') | ForEach-Object { [bigint]::Parse($_) }
switch ($Bump.ToLowerInvariant()) {
    'major' { $major += 1; $minor = 0; $patch = 0 }
    'minor' { $minor += 1; $patch = 0 }
    'patch' { $patch += 1 }
}
$nextVersion = "$major.$minor.$patch"

foreach ($filename in @('package-lock.json', 'npm-shrinkwrap.json')) {
    $path = Join-Path $pluginRoot $filename
    if (Test-Path -LiteralPath $path) {
        $document = Read-VersionDocument $path
        if ($document.name -and $document.name -cne $PluginName) { throw "Plugin name mismatch in $path" }
        $targets = @($document)
        if ($document.packages -and $document.packages.Contains('')) { $targets += $document.packages[''] }
        $updates.Add(@{ Path = $path; Document = $document; Targets = $targets })
    }

    # The repository's own version stays unchanged; only this workspace entry moves.
    $path = Join-Path $PSScriptRoot $filename
    if (Test-Path -LiteralPath $path) {
        $document = Read-VersionDocument $path
        $key = "plugins/$PluginName"
        if ($document.packages -and $document.packages.Contains($key)) {
            $updates.Add(@{ Path = $path; Document = $document; Targets = @($document.packages[$key]) })
        }
    }
}

# Validate and serialize every change before writing any files.
foreach ($update in $updates) {
    foreach ($target in $update.Targets) {
        if ($target.version -cne $currentVersion) {
            throw "Version mismatch in $($update.Path): expected $currentVersion, found '$($target.version)'"
        }
        $target.version = $nextVersion
    }
    $update.Content = (($update.Document | ConvertTo-Json -Depth 100) + "`n").Replace("`r`n", "`n")
}
if ($PSCmdlet.ShouldProcess($pluginRoot, "Bump $currentVersion -> $nextVersion in $($updates.Count) files")) {
    foreach ($update in $updates) {
        [IO.File]::WriteAllText($update.Path, $update.Content, [Text.UTF8Encoding]::new($false))
    }
    Write-Output "${PluginName}: $currentVersion -> $nextVersion"
}
