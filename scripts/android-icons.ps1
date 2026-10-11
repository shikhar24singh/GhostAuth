$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$taskRoot = Split-Path $PSScriptRoot -Parent
$source = [System.Drawing.Image]::FromFile((Join-Path $taskRoot 'public/assets/ghostauth-logo.png'))
$resourceRoot = Join-Path $taskRoot 'android/app/src/main/res'
$densities = @{'mdpi'=1; 'hdpi'=1.5; 'xhdpi'=2; 'xxhdpi'=3; 'xxxhdpi'=4}
try {
    foreach ($density in $densities.Keys) {
        $folder = Join-Path $resourceRoot "mipmap-$density"
        foreach ($entry in @(@('ic_launcher',48), @('ic_launcher_round',48), @('ic_launcher_foreground',108))) {
            $size = [int]($entry[1] * $densities[$density])
            $bitmap = [System.Drawing.Bitmap]::new($size, $size)
            $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
            try {
                $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml('#F5F4F0'))
                $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
                # Resample the approved square mark, preserving its existing padding and colors.
                $graphics.DrawImage($source, [System.Drawing.Rectangle]::new(0,0,$size,$size))
                $bitmap.Save((Join-Path $folder ($entry[0] + '.png')), [System.Drawing.Imaging.ImageFormat]::Png)
            } finally { $graphics.Dispose(); $bitmap.Dispose() }
        }
    }
} finally { $source.Dispose() }
Write-Output 'GhostAuth launcher assets generated from the approved original mark.'
