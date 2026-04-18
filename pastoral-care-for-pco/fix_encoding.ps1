$files = @(
  'components\MessagingModule.tsx',
  'types.ts'
)
$enc = [Text.Encoding]::GetEncoding(1252)
foreach ($rel in $files) {
  $f = Join-Path (Get-Location) $rel
  $src = [IO.File]::ReadAllText($f, [Text.Encoding]::UTF8)
  $buf = [Collections.Generic.List[byte]]::new()
  foreach ($ch in $src.ToCharArray()) {
    $cp = [int]$ch
    if ($cp -lt 128) {
      $buf.Add([byte]$cp)
    } else {
      try {
        foreach ($b in $enc.GetBytes([string]$ch)) { $buf.Add($b) }
      } catch {
        if ($cp -le 255) { $buf.Add([byte]$cp) }
        else { foreach ($b in ([Text.Encoding]::UTF8.GetBytes([string]$ch))) { $buf.Add($b) } }
      }
    }
  }
  $fixed = [Text.Encoding]::UTF8.GetString($buf.ToArray())
  [IO.File]::WriteAllText($f, $fixed, [Text.Encoding]::UTF8)
  Write-Host "Fixed $rel : $($src.Length) -> $($fixed.Length) chars"
}
Write-Host "Done."
