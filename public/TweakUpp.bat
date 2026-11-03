@echo off
title TweakUpp
net session >nul 2>&1
if %errorlevel% neq 0 (
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $s=(Invoke-WebRequest -UseBasicParsing 'https://tweaksupp.netlify.app/tweakupp.ps1').Content; if($s -is [byte[]]){$s=[Text.Encoding]::UTF8.GetString($s)}; & ([ScriptBlock]::Create($s))"
