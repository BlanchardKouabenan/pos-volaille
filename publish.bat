@echo off
REM ============================================================
REM  Publication KB POS (auto-update GitHub)
REM
REM  USAGE:
REM    publish.bat 1.1.0     -> build + publie la version 1.1.0
REM
REM  PREALABLE (une seule fois):
REM    1. Cree un Personal Access Token GitHub (scopes: repo)
REM    2. setx GH_TOKEN "ghp_xxxxxxxxxxxxxxxxxxxx"
REM    3. Relance ce terminal
REM ============================================================
setlocal

if "%1"=="" (
  echo Usage: publish.bat VERSION   ex: publish.bat 1.1.0
  exit /b 1
)

if "%GH_TOKEN%"=="" (
  echo ERREUR: variable GH_TOKEN non definie.
  echo Cree un token GitHub, puis: setx GH_TOKEN "ton_token"
  exit /b 1
)

set NEW_VERSION=%1

echo.
echo === Publication KB POS version %NEW_VERSION% ===
echo.

REM 1. Mettre a jour la version dans package.json (et creer le tag git)
call npm version %NEW_VERSION% --no-git-tag-version
if errorlevel 1 goto :err

REM 1b. Commit de la nouvelle version
git add package.json package-lock.json
git commit -m "Version %NEW_VERSION%"
if errorlevel 1 goto :err

REM 2. Creer le tag (pour retrouver la release dans git)
git tag "v%NEW_VERSION%"
if errorlevel 1 goto :err

REM 3. Build renderer + electron
call npm run build
if errorlevel 1 goto :err

REM 4. Pousser le code et le tag
git push
if errorlevel 1 goto :err
git push origin "v%NEW_VERSION%"
if errorlevel 1 goto :err

REM 5. Builder + publier la release GitHub (auto-update)
call node_modules\.bin\electron-builder.cmd --win --x64 --publish always
if errorlevel 1 goto :err

echo.
echo === Publication terminee ! Les postes se mettront a jour au demarrage ===
echo.
exit /b 0

:err
echo.
echo ERREUR lors de la publication. Voir les messages ci-dessus.
exit /b 1
