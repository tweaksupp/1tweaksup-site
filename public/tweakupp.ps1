# TweakUpp - Optimisation Windows
# Lance par TweakUpp.bat (en administrateur). Demande une cle, la verifie
# sur le serveur TweakUpp, cree un point de restauration puis applique l'optimisation.

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$Api = 'https://tweakupp.pages.dev/api/activate'

Add-Type -AssemblyName System.Windows.Forms, System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

function Show-Msg($text, $icon = 'Information', $buttons = 'OK') {
  [System.Windows.Forms.MessageBox]::Show($text, 'TweakUpp', $buttons, $icon)
}

# --- Droits administrateur ---
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { Show-Msg "Lance TweakUpp en tant qu'administrateur (clic droit > Executer en tant qu'administrateur)." 'Warning'; exit 1 }

# --- Fenetre de saisie de la cle ---
function Ask-Key {
  $f = New-Object System.Windows.Forms.Form
  $f.Text = 'TweakUpp - Optimisation Windows'; $f.Size = New-Object System.Drawing.Size(460, 230)
  $f.StartPosition = 'CenterScreen'; $f.FormBorderStyle = 'FixedDialog'; $f.MaximizeBox = $false; $f.MinimizeBox = $false
  $f.BackColor = [System.Drawing.Color]::FromArgb(13, 10, 20); $f.ForeColor = [System.Drawing.Color]::FromArgb(242, 236, 250)

  $t = New-Object System.Windows.Forms.Label
  $t.Text = 'Entre ta cle TweakUpp'; $t.Font = New-Object System.Drawing.Font('Segoe UI', 13, [System.Drawing.FontStyle]::Bold)
  $t.Location = New-Object System.Drawing.Point(24, 18); $t.AutoSize = $true; $f.Controls.Add($t)

  $s = New-Object System.Windows.Forms.Label
  $s.Text = 'Format : TWK-XXXX-XXXX-XXXX (recue dans ton ticket Discord)'; $s.ForeColor = [System.Drawing.Color]::FromArgb(169, 156, 191)
  $s.Location = New-Object System.Drawing.Point(26, 52); $s.AutoSize = $true; $f.Controls.Add($s)

  $box = New-Object System.Windows.Forms.TextBox
  $box.Location = New-Object System.Drawing.Point(26, 82); $box.Size = New-Object System.Drawing.Size(392, 30)
  $box.Font = New-Object System.Drawing.Font('Consolas', 13); $box.CharacterCasing = 'Upper'; $box.MaxLength = 18
  $f.Controls.Add($box)

  $ok = New-Object System.Windows.Forms.Button
  $ok.Text = 'Valider'; $ok.Location = New-Object System.Drawing.Point(238, 130); $ok.Size = New-Object System.Drawing.Size(180, 36)
  $ok.FlatStyle = 'Flat'; $ok.BackColor = [System.Drawing.Color]::FromArgb(166, 120, 255); $ok.ForeColor = [System.Drawing.Color]::FromArgb(22, 12, 34)
  $ok.DialogResult = 'OK'; $f.Controls.Add($ok); $f.AcceptButton = $ok

  $cancel = New-Object System.Windows.Forms.Button
  $cancel.Text = 'Annuler'; $cancel.Location = New-Object System.Drawing.Point(26, 130); $cancel.Size = New-Object System.Drawing.Size(120, 36)
  $cancel.FlatStyle = 'Flat'; $cancel.DialogResult = 'Cancel'; $f.Controls.Add($cancel); $f.CancelButton = $cancel

  $f.Add_Shown({ $box.Focus() })
  if ($f.ShowDialog() -ne 'OK') { return $null }
  return $box.Text.Trim()
}

# --- Identifiant unique du PC (carte mere + processeur + UUID), hache ---
function Get-Hwid {
  $parts = @(
    (Get-CimInstance Win32_BaseBoard).SerialNumber,
    (Get-CimInstance Win32_Processor | Select-Object -First 1).ProcessorId,
    (Get-CimInstance Win32_ComputerSystemProduct).UUID
  ) -join '|'
  $sha = [Security.Cryptography.SHA256]::Create()
  ($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($parts)) | ForEach-Object { $_.ToString('x2') }) -join ''
}

$key = Ask-Key
if (-not $key) { exit 0 }
if ($key -notmatch '^TWK-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$') { Show-Msg 'Format de cle invalide. Verifie ta cle et relance TweakUpp.' 'Error'; exit 1 }

# --- Verification de la cle ---
try {
  $body = @{ key = $key; hwid = (Get-Hwid) } | ConvertTo-Json
  $res = Invoke-RestMethod -Uri $Api -Method Post -ContentType 'application/json; charset=utf-8' -Body $body -TimeoutSec 30
} catch {
  $msg = 'Impossible de verifier la cle. Verifie ta connexion internet et reessaie.'
  try { $err = $_.ErrorDetails.Message | ConvertFrom-Json; if ($err.error) { $msg = $err.error } } catch {}
  Show-Msg $msg 'Error'; exit 1
}

if (-not $res.script -or -not $res.script.Trim()) {
  Show-Msg "Cle valide, mais aucune optimisation n'est encore configuree. Contacte TweakUpp sur Discord." 'Warning'; exit 0
}

if ((Show-Msg "Cle valide.`n`nTweakUpp va creer un point de restauration puis optimiser ton PC. Ferme tes jeux et applications avant de continuer.`n`nContinuer ?" 'Question' 'OKCancel') -ne 'OK') { exit 0 }

# --- Point de restauration ---
$log = Join-Path ([Environment]::GetFolderPath('Desktop')) ("TweakUpp-rapport-{0:yyyy-MM-dd_HH-mm}.txt" -f (Get-Date))
Start-Transcript -Path $log -Force | Out-Null
try {
  Enable-ComputerRestore -Drive "$env:SystemDrive\" -ErrorAction SilentlyContinue
  New-ItemProperty -Path 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\SystemRestore' -Name SystemRestorePointCreationFrequency -PropertyType DWord -Value 0 -Force | Out-Null
  Checkpoint-Computer -Description 'Avant TweakUpp' -RestorePointType MODIFY_SETTINGS
  Write-Host '[OK] Point de restauration cree : Avant TweakUpp'
} catch {
  Write-Host "[!] Point de restauration impossible : $($_.Exception.Message)"
  if ((Show-Msg "Le point de restauration n'a pas pu etre cree.`nContinuer quand meme ?" 'Warning' 'YesNo') -ne 'Yes') { Stop-Transcript | Out-Null; exit 1 }
}

# --- Optimisation ---
$ok = $true
try {
  & ([ScriptBlock]::Create($res.script))
} catch {
  $ok = $false
  Write-Host "[ERREUR] $($_.Exception.Message)"
}
Stop-Transcript | Out-Null

if ($ok) {
  if ((Show-Msg "Optimisation terminee.`nUn rapport a ete enregistre sur ton Bureau.`n`nRedemarrer maintenant ?" 'Information' 'YesNo') -eq 'Yes') { Restart-Computer -Force }
} else {
  Show-Msg "Une erreur est survenue pendant l'optimisation.`nEnvoie le rapport (sur ton Bureau) dans ton ticket Discord." 'Error'
}
