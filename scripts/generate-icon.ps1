param(
  [ValidateSet('centered', 'offset')]
  [string]$Variant = 'centered'
)

Add-Type -AssemblyName System.Drawing

$canvasSize = 1024
$bitmap = [System.Drawing.Bitmap]::new($canvasSize, $canvasSize, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$graphics.ScaleTransform(2, 2)

function New-RoundedRectanglePath([float]$x, [float]$y, [float]$width, [float]$height, [float]$radius) {
  $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $diameter = $radius * 2
  $path.AddArc($x, $y, $diameter, $diameter, 180, 90)
  $path.AddArc($x + $width - $diameter, $y, $diameter, $diameter, 270, 90)
  $path.AddArc($x + $width - $diameter, $y + $height - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($x, $y + $height - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}

$backgroundPath = New-RoundedRectanglePath 24 24 464 464 112
$backgroundBrush = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#50545A'))
$graphics.FillPath($backgroundBrush, $backgroundPath)

$borderPath = New-RoundedRectanglePath 25.5 25.5 461 461 110.5
$borderPen = [System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml('#777C84'), 3)
$graphics.DrawPath($borderPen, $borderPath)

$letterPath = [System.Drawing.Drawing2D.GraphicsPath]::new()
if ($Variant -eq 'offset') {
  $letterPath.StartFigure()
  $letterPath.AddLine(86, 268, 86, 152)
  $letterPath.StartFigure()
  $letterPath.AddLine(86, 185, 86, 268)
  $letterPath.AddBezier(86, 185, 98, 150, 136, 143, 156, 167)
  $letterPath.AddBezier(156, 167, 165, 177, 168, 192, 168, 210)
  $letterPath.AddLine(168, 210, 168, 268)
  $letterPath.StartFigure()
  $letterPath.AddLine(168, 185, 168, 268)
  $letterPath.AddBezier(168, 185, 180, 150, 218, 143, 238, 167)
  $letterPath.AddBezier(238, 167, 247, 177, 250, 192, 250, 210)
  $letterPath.AddLine(250, 210, 250, 268)
  $letterPath.StartFigure()
  $letterPath.AddLine(414, 224, 414, 384)
  $letterPath.StartFigure()
  $letterPath.AddBezier(414, 309, 404, 282, 382, 266, 354, 266)
  $letterPath.AddBezier(354, 266, 315, 266, 286, 294, 286, 329)
  $letterPath.AddBezier(286, 329, 286, 366, 315, 394, 354, 394)
  $letterPath.AddBezier(354, 394, 382, 394, 404, 378, 414, 351)
  $letterWidth = 32
} else {
  $letterPath.StartFigure()
  $letterPath.AddLine(108, 330, 108, 230)
  $letterPath.StartFigure()
  $letterPath.AddLine(108, 258, 108, 330)
  $letterPath.AddBezier(108, 258, 117, 230, 149, 222, 166, 243)
  $letterPath.AddBezier(166, 243, 174, 253, 175, 265, 175, 280)
  $letterPath.AddLine(175, 280, 175, 330)
  $letterPath.StartFigure()
  $letterPath.AddLine(175, 258, 175, 330)
  $letterPath.AddBezier(175, 258, 184, 230, 217, 223, 234, 244)
  $letterPath.AddBezier(234, 244, 242, 254, 243, 266, 243, 281)
  $letterPath.AddLine(243, 281, 243, 330)
  $letterPath.StartFigure()
  $letterPath.AddLine(404, 178, 404, 330)
  $letterPath.StartFigure()
  $letterPath.AddBezier(404, 261, 395, 239, 377, 226, 354, 226)
  $letterPath.AddBezier(354, 226, 321, 226, 296, 250, 296, 279)
  $letterPath.AddBezier(296, 279, 296, 310, 320, 334, 353, 334)
  $letterPath.AddBezier(353, 334, 377, 334, 395, 321, 404, 300)
  $letterWidth = 28
}

$letterPen = [System.Drawing.Pen]::new([System.Drawing.Color]::White, $letterWidth)
$letterPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$letterPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$letterPen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
$graphics.DrawPath($letterPen, $letterPath)
$graphics.Dispose()

$sizes = 16, 24, 32, 48, 64, 128, 256
$pngImages = [System.Collections.Generic.List[byte[]]]::new()
foreach ($size in $sizes) {
  $resized = [System.Drawing.Bitmap]::new($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $resizedGraphics = [System.Drawing.Graphics]::FromImage($resized)
  $resizedGraphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $resizedGraphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $resizedGraphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $resizedGraphics.DrawImage($bitmap, 0, 0, $size, $size)
  $imageStream = [System.IO.MemoryStream]::new()
  $resized.Save($imageStream, [System.Drawing.Imaging.ImageFormat]::Png)
  $pngImages.Add($imageStream.ToArray())
  $imageStream.Dispose()
  $resizedGraphics.Dispose()
  $resized.Dispose()
}
$bitmap.Dispose()
$letterPen.Dispose()
$letterPath.Dispose()
$borderPen.Dispose()
$borderPath.Dispose()
$backgroundBrush.Dispose()
$backgroundPath.Dispose()

$iconStream = [System.IO.MemoryStream]::new()
$writer = [System.IO.BinaryWriter]::new($iconStream)
$writer.Write([uint16]0)
$writer.Write([uint16]1)
$writer.Write([uint16]$sizes.Count)
$dataOffset = 6 + 16 * $sizes.Count
for ($index = 0; $index -lt $sizes.Count; $index++) {
  $size = $sizes[$index]
  $writer.Write([byte]($(if ($size -eq 256) { 0 } else { $size })))
  $writer.Write([byte]($(if ($size -eq 256) { 0 } else { $size })))
  $writer.Write([byte]0)
  $writer.Write([byte]0)
  $writer.Write([uint16]1)
  $writer.Write([uint16]32)
  $writer.Write([uint32]$pngImages[$index].Length)
  $writer.Write([uint32]$dataOffset)
  $dataOffset += $pngImages[$index].Length
}
foreach ($png in $pngImages) {
  $writer.Write($png)
}

$outputName = if ($Variant -eq 'offset') { 'icon-offset.ico' } else { 'icon.ico' }
$outputPath = Join-Path $PSScriptRoot "..\build\$outputName"
[System.IO.File]::WriteAllBytes($outputPath, $iconStream.ToArray())
$writer.Dispose()
$iconStream.Dispose()
