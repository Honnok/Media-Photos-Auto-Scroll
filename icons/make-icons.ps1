Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$src = Join-Path $root "source.jpg"

function Save-Png([System.Drawing.Bitmap]$bmp, [string]$name) {
  $path = Join-Path $root $name
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
}

function Draw-SimpleIcon([int]$size) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([System.Drawing.Color]::Transparent)

  $bg = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 18, 20, 26))
  $pad = [Math]::Max(1, [int]($size * 0.06))
  $rect = New-Object System.Drawing.Rectangle $pad, $pad, ($size - 2 * $pad), ($size - 2 * $pad)
  $radius = [Math]::Max(3, [int]($size * 0.22))
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $radius * 2
  $path.AddArc($rect.X, $rect.Y, $d, $d, 180, 90)
  $path.AddArc($rect.Right - $d, $rect.Y, $d, $d, 270, 90)
  $path.AddArc($rect.Right - $d, $rect.Bottom - $d, $d, $d, 0, 90)
  $path.AddArc($rect.X, $rect.Bottom - $d, $d, $d, 90, 90)
  $path.CloseFigure()
  $g.FillPath($bg, $path)

  $green = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 132, 204, 22))
  $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 132, 204, 22), [Math]::Max(2, $size / 8.0))
  $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  $cx = $size / 2.0
  $top = $size * 0.38
  $bot = $size * 0.70
  $spread = $size * 0.22
  $g.DrawLines($pen, @(
    (New-Object System.Drawing.PointF ($cx - $spread), $top),
    (New-Object System.Drawing.PointF $cx, $bot),
    (New-Object System.Drawing.PointF ($cx + $spread), $top)
  ))

  $g.Dispose()
  $pen.Dispose()
  $green.Dispose()
  $bg.Dispose()
  $path.Dispose()
  return $bmp
}

if (Test-Path $src) {
  $img = [System.Drawing.Image]::FromFile($src)
  foreach ($s in @(128, 48)) {
    $bmp = New-Object System.Drawing.Bitmap $s, $s
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)
    $g.DrawImage($img, 0, 0, $s, $s)
    $g.Dispose()
    Save-Png $bmp "icon$s.png"
    $bmp.Dispose()
  }
  $img.Dispose()
} else {
  foreach ($s in @(128, 48)) {
    $bmp = Draw-SimpleIcon $s
    Save-Png $bmp "icon$s.png"
    $bmp.Dispose()
  }
}

foreach ($s in @(16, 32)) {
  $bmp = Draw-SimpleIcon $s
  Save-Png $bmp "icon$s.png"
  $bmp.Dispose()
}

Write-Output "icons ok"
