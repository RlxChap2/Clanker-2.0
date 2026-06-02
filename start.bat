@echo off
chcp 65001 >nul
title Clanker 2.0 Launcher

:: ─────────────────────────────────────────
::  Check if Node.js is installed
:: ─────────────────────────────────────────
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo  [ERROR] Node.js is not installed or not in PATH.
    echo  Download it from: https://nodejs.org
    echo.
    pause
    exit /b 1
)

:: ─────────────────────────────────────────
::  Check if npm packages are installed
:: ─────────────────────────────────────────
if not exist "node_modules\discord.js" (
    echo.
    echo  [SETUP] Installing dependencies...
    echo.
    npm install
    if %errorlevel% neq 0 (
        echo.
        echo  [ERROR] npm install failed. Check your internet connection.
        pause
        exit /b 1
    )
    echo.
)

:: ─────────────────────────────────────────
::  Check if a token was passed as argument
::  Usage: start.bat YOUR_TOKEN_HERE
:: ─────────────────────────────────────────
if not "%~1"=="" (
    echo.
    echo  [INFO] Token passed via argument — saving to .env
    echo TOKEN=%~1> .env
    echo.
)

:: ─────────────────────────────────────────
::  Launch CLI
:: ─────────────────────────────────────────
node cli.js

:: ─────────────────────────────────────────
::  On exit
:: ─────────────────────────────────────────
if %errorlevel% neq 0 (
    echo.
    echo  [EXIT] Bot stopped with error code: %errorlevel%
    echo.
    pause
)
