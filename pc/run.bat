@echo off
title PhoneDrive PC
cd /d "%~dp0"
echo Starting PhoneDrive PC...
python app.py
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo PhoneDrive PC stopped with an error.
    pause
)
