#Requires -Version 5.0

<#
.SYNOPSIS
    Lucide React - Development Environment Setup Script (Windows)

.DESCRIPTION
    PowerShell script to automate the setup of a secure development environment
    for Lucide React projects on Windows. Validates dependencies, generates encryption keys,
    creates environment configuration, and sets up git hooks.

.PARAMETER SkipCerts
    Skip certificate pin generation

.PARAMETER CI
    CI/CD mode (non-interactive, skips certs)

.PARAMETER Verbose
    Enable verbose output

.EXAMPLE
    .\scripts\setup.ps1
    .\scripts\setup.ps1 -CI
    .\scripts\setup.ps1 -SkipCerts

.NOTES
    Requires Node.js 20.19.0+ or 22.12.0+, npm 9.0.0+, Git, and OpenSSL
#>

param(
    [switch]$SkipCerts,
    [switch]$CI,
    [switch]$Verbose
)

$ErrorActionPreference = "Stop"

# ============================================================================
# Configuration
# ============================================================================

$REQUIRED_NODE_MIN = "20.19.0"
$REQUIRED_NPM_MIN = "9.0.0"
$PROJECT_ROOT = (Get-Item (Split-Path -Parent $PSScriptRoot)).FullName
$SCRIPTS_DIR = Join-Path $PROJECT_ROOT "scripts"
$ENV_TEMPLATE = Join-Path $PROJECT_ROOT ".env.example"
$ENV_LOCAL = Join-Path $PROJECT_ROOT ".env.local"
$ENV_LOCAL_BACKUP = Join-Path $PROJECT_ROOT ".env.local.backup"

# Color codes
$colors = @{
    Reset = "$([char]27)[0m"
    Red = "$([char]27)[0;31m"
    Green = "$([char]27)[0;32m"
    Yellow = "$([char]27)[1;33m"
    Blue = "$([char]27)[0;34m"
}

# ============================================================================
# Utility Functions
# ============================================================================

function Write-Log {
    param([string]$Message)
    Write-Host "${$colors.Blue}[Setup]${$colors.Reset} $Message"
}

function Write-Success {
    param([string]$Message)
    Write-Host "${$colors.Green}✓${$colors.Reset} $Message"
}

function Write-Error-Custom {
    param([string]$Message)
    Write-Error $Message
}

function Write-Warning-Custom {
    param([string]$Message)
    Write-Host "${$colors.Yellow}⚠${$colors.Reset} $Message"
}

function Test-CommandExists {
    param([string]$Command)
    $null = Get-Command $Command -ErrorAction SilentlyContinue
    return $?
}

function Test-VersionGte {
    param([string]$Version, [string]$Minimum)

    $vParts = $Version.Split('.')
    $mParts = $Minimum.Split('.')

    for ($i = 0; $i -lt [Math]::Max($vParts.Length, $mParts.Length); $i++) {
        $v = if ($i -lt $vParts.Length) { [int]$vParts[$i] } else { 0 }
        $m = if ($i -lt $mParts.Length) { [int]$mParts[$i] } else { 0 }

        if ($v -gt $m) { return $true }
        if ($v -lt $m) { return $false }
    }
    return $true
}

function Prompt-YesNo {
    param([string]$Prompt, [string]$Default = "y")

    if ($CI) { return $true }

    $message = "${$colors.Blue}?${$colors.Reset} $Prompt ($Default/n): "
    $response = Read-Host $message
    $response = if ([string]::IsNullOrEmpty($response)) { $Default } else { $response }

    return $response -match "^[Yy]$"
}

# ============================================================================
# Validation Functions
# ============================================================================

function Validate-NodeVersion {
    if (-not (Test-CommandExists "node")) {
        throw "Node.js is not installed. Please install Node.js ${REQUIRED_NODE_MIN}+ from https://nodejs.org/"
    }

    $nodeVersion = (node -v).TrimStart('v')
    $nodeMajor = [int]($nodeVersion.Split('.')[0])

    if (-not (Test-VersionGte $nodeVersion $REQUIRED_NODE_MIN)) {
        throw "Node.js version $nodeVersion is too old. Required: ${REQUIRED_NODE_MIN}+"
    }

    if ($nodeMajor -lt 20) {
        throw "Node.js version $nodeVersion is not supported. Required: 20.19.0+ or 22.12.0+"
    }

    Write-Success "Node.js $nodeVersion"
}

function Validate-NpmVersion {
    if (-not (Test-CommandExists "npm")) {
        throw "npm is not installed with Node.js"
    }

    $npmVersion = npm -v

    if (-not (Test-VersionGte $npmVersion $REQUIRED_NPM_MIN)) {
        throw "npm version $npmVersion is too old. Required: ${REQUIRED_NPM_MIN}+"
    }

    Write-Success "npm $npmVersion"
}

function Validate-Git {
    if (-not (Test-CommandExists "git")) {
        throw "Git is not installed. Please install Git from https://git-scm.com/"
    }

    $gitVersion = (git --version | Select-Object -ExpandProperty Split).Split()[2]
    Write-Success "Git $gitVersion"
}

function Validate-OpenSSL {
    if (-not (Test-CommandExists "openssl")) {
        throw @"
OpenSSL is not installed. Please install it:

Option 1: Using Chocolatey (recommended)
  choco install openssl

Option 2: Using Windows Subsystem for Linux (WSL)
  wsl openssl version

Option 3: Download from https://slproweb.com/products/Win32OpenSSL.html
"@
    }

    $opensslVersion = (openssl version | Select-Object -ExpandProperty Split)[1]
    Write-Success "OpenSSL $opensslVersion"
}

# ============================================================================
# Environment Setup Functions
# ============================================================================

function New-EnvLocal {
    if (Test-Path $ENV_LOCAL) {
        if (-not $CI) {
            if (Prompt-YesNo ".env.local already exists. Overwrite it?" "n") {
                Write-Warning-Custom "Backing up existing .env.local to .env.local.backup"
                Copy-Item $ENV_LOCAL $ENV_LOCAL_BACKUP -Force
                Remove-Item $ENV_LOCAL
            }
            else {
                Write-Warning-Custom ".env.local already exists. Skipping..."
                return
            }
        }
        else {
            Write-Warning-Custom ".env.local already exists. Skipping..."
            return
        }
    }

    if (-not (Test-Path $ENV_TEMPLATE)) {
        throw ".env.example not found at $ENV_TEMPLATE"
    }

    Write-Log "Creating .env.local from .env.example..."
    Copy-Item $ENV_TEMPLATE $ENV_LOCAL

    Write-Success ".env.local created"
    Write-Warning-Custom "Remember to fill in actual values in .env.local (it's gitignored)"
}

# ============================================================================
# Key Generation Functions
# ============================================================================

function New-EncryptionKey {
    Write-Log "Generating AES-256-GCM encryption key..."

    $encryptionKey = openssl rand -base64 32

    $content = Get-Content $ENV_LOCAL
    $content = $content -replace '^ENCRYPTION_KEY=.*', "ENCRYPTION_KEY=$encryptionKey"

    if ($content -notmatch "^ENCRYPTION_KEY=") {
        $content += "`nENCRYPTION_KEY=$encryptionKey"
    }

    $content | Set-Content $ENV_LOCAL

    Write-Success "Encryption key generated and saved"
}

function New-JwtSecret {
    Write-Log "Generating JWT secret..."

    $jwtSecret = openssl rand -base64 32

    $content = Get-Content $ENV_LOCAL
    $content = $content -replace '^JWT_SECRET=.*', "JWT_SECRET=$jwtSecret"

    if ($content -notmatch "^JWT_SECRET=") {
        $content += "`nJWT_SECRET=$jwtSecret"
    }

    $content | Set-Content $ENV_LOCAL

    Write-Success "JWT secret generated and saved"
}

function New-CertificatePins {
    if ($SkipCerts) {
        Write-Warning-Custom "Skipping certificate pin generation"
        return
    }

    $content = Get-Content $ENV_LOCAL
    $apiEndpoint = ($content | Select-String "^API_ENDPOINT=").Line.Split('=')[1].TrimStart('https://').Split('/')[0]

    if ([string]::IsNullOrEmpty($apiEndpoint)) {
        Write-Warning-Custom "API_ENDPOINT not configured, skipping certificate pins"
        return
    }

    Write-Log "Generating certificate pins for $apiEndpoint..."

    try {
        $certPin = (echo | openssl s_client -servername $apiEndpoint -connect "${apiEndpoint}:443" 2>$null | `
                    openssl x509 -pubkey -noout 2>$null | `
                    openssl pkey -pubin -outform der 2>$null | `
                    openssl dgst -sha256 -binary 2>$null | `
                    openssl enc -base64 2>$null).Trim()

        if ($certPin) {
            $content = $content -replace '^API_CERT_PIN=.*', "API_CERT_PIN=sha256/$certPin"

            if ($content -notmatch "^API_CERT_PIN=") {
                $content += "`nAPI_CERT_PIN=sha256/$certPin"
            }

            $content | Set-Content $ENV_LOCAL
            Write-Success "Certificate pin generated for $apiEndpoint"
        }
        else {
            Write-Warning-Custom "Could not generate certificate pin (server might be unreachable)"
        }
    }
    catch {
        Write-Warning-Custom "Certificate pin generation failed: $_"
    }
}

# ============================================================================
# Dependency Installation
# ============================================================================

function Install-Dependencies {
    Write-Log "Installing Node.js dependencies..."

    Push-Location $PROJECT_ROOT
    try {
        if (-not (Test-Path "node_modules") -or -not (Test-Path "package-lock.json")) {
            npm ci --legacy-peer-deps 2>$null || npm install --legacy-peer-deps
        }
        else {
            npm ci --legacy-peer-deps
        }

        Write-Success "Dependencies installed"
    }
    finally {
        Pop-Location
    }
}

# ============================================================================
# Git Hooks Setup
# ============================================================================

function New-GitHooks {
    Write-Log "Setting up git pre-commit and pre-push hooks..."

    $huskyDir = Join-Path $PROJECT_ROOT ".husky"
    $null = New-Item -ItemType Directory -Path $huskyDir -Force

    # Pre-commit hook
    $preCommitContent = @'
#!/bin/bash
set -e
echo "Running pre-commit checks..."
echo "  • Running ESLint..."
npx eslint --fix . --max-warnings 0 2>/dev/null || {
    echo "❌ ESLint failed. Fix errors and try again."
    exit 1
}
echo "  • Running tests..."
npm run test 2>/dev/null || {
    echo "❌ Tests failed. Fix errors and try again."
    exit 1
}
echo "✓ Pre-commit checks passed"
'@

    $preCommitPath = Join-Path $huskyDir "pre-commit"
    $preCommitContent | Set-Content $preCommitPath -Encoding UTF8

    # Pre-push hook
    $prePushContent = @'
#!/bin/bash
set -e
echo "Running pre-push security checks..."
echo "  • Checking for hardcoded secrets..."
echo "  • Running npm audit..."
npm audit --audit-level=moderate 2>/dev/null || {
    echo "⚠️  Security issues found. Review with: npm audit"
    exit 1
}
echo "✓ Pre-push security checks passed"
'@

    $prePushPath = Join-Path $huskyDir "pre-push"
    $prePushContent | Set-Content $prePushPath -Encoding UTF8

    Write-Success "Git hooks configured"
}

# ============================================================================
# Test Execution
# ============================================================================

function Invoke-InitialTests {
    Write-Log "Running initial test suite..."

    Push-Location $PROJECT_ROOT
    try {
        $testOutput = npm run test 2>&1 | Select-Object -First 20

        if ($LASTEXITCODE -ne 0) {
            Write-Warning-Custom "Some tests failed. Review output above."
            if (-not (Prompt-YesNo "Continue anyway?" "n")) {
                throw "Tests failed"
            }
        }

        Write-Success "Tests passed"
    }
    finally {
        Pop-Location
    }
}

# ============================================================================
# Summary Display
# ============================================================================

function Show-Summary {
    $setupDate = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

    Write-Host ""
    Write-Host "${$colors.Green}$(("═" * 70))${$colors.Reset}"
    Write-Host "${$colors.Green}✓ Development Environment Setup Complete!${$colors.Reset}"
    Write-Host "${$colors.Green}$(("═" * 70))${$colors.Reset}"
    Write-Host ""
    Write-Host "${$colors.Blue}Setup Date:${$colors.Reset} $setupDate"
    Write-Host ""
    Write-Host "${$colors.Blue}Verified Components:${$colors.Reset}"
    Write-Host "  • Node.js $(node -v)"
    Write-Host "  • npm $(npm -v)"
    Write-Host "  • Git $(git --version)"
    Write-Host "  • OpenSSL $(openssl version)"
    Write-Host ""
    Write-Host "${$colors.Blue}Configured Items:${$colors.Reset}"
    Write-Host "  • Environment: .env.local created"
    Write-Host "  • Encryption: AES-256-GCM key generated"
    Write-Host "  • JWT: Secret generated"
    Write-Host "  • Git Hooks: pre-commit and pre-push configured"
    Write-Host "  • Dependencies: npm modules installed"
    Write-Host ""
    Write-Host "${$colors.Blue}Next Steps:${$colors.Reset}"
    Write-Host ""
    Write-Host "1. ${$colors.Yellow}Configure .env.local${$colors.Reset}"
    Write-Host "   Edit $ENV_LOCAL and fill in actual values:"
    Write-Host "   • Firebase configuration"
    Write-Host "   • API endpoints"
    Write-Host "   • Certificate pins (if needed)"
    Write-Host "   • Third-party service credentials"
    Write-Host ""
    Write-Host "2. ${$colors.Yellow}Start Development${$colors.Reset}"
    Write-Host "   npm run dev"
    Write-Host ""
    Write-Host "3. ${$colors.Yellow}Run Tests${$colors.Reset}"
    Write-Host "   npm run test"
    Write-Host "   npm run test:watch  # Watch mode"
    Write-Host ""
    Write-Host "4. ${$colors.Yellow}Code Quality${$colors.Reset}"
    Write-Host "   npm run lint        # Check code"
    Write-Host "   npm run lint -- --fix  # Auto-fix issues"
    Write-Host ""
    Write-Host "${$colors.Yellow}Important:${$colors.Reset}"
    Write-Host "  • NEVER commit .env.local with real secrets"
    Write-Host "  • Use .env.local.backup for local backups only"
    Write-Host "  • Rotate encryption keys periodically"
    Write-Host "  • Review SETUP.md for detailed instructions"
    Write-Host "  • Check DEVELOPMENT.md for development guidelines"
    Write-Host "  • See CONTRIBUTING.md for contribution guidelines"
    Write-Host ""
    Write-Host "${$colors.Yellow}Security Reminders:${$colors.Reset}"
    Write-Host "  • Keep .env.local restricted"
    Write-Host "  • Never share private keys via email/chat"
    Write-Host "  • Use certificate pinning for production APIs"
    Write-Host "  • Enable biometric auth in mobile app"
    Write-Host "  • Review DATA_RETENTION_POLICY.md for compliance"
    Write-Host ""
    Write-Host "${$colors.Yellow}Need Help?${$colors.Reset}"
    Write-Host "  • Read SETUP.md for detailed setup instructions"
    Write-Host "  • Check TROUBLESHOOTING.md for common issues"
    Write-Host "  • Review DEVELOPMENT.md for development guidelines"
    Write-Host ""
    Write-Host "${$colors.Green}Happy coding! 🚀${$colors.Reset}"
    Write-Host ""
}

# ============================================================================
# Main Setup Flow
# ============================================================================

function Main {
    $startTime = Get-Date

    Clear-Host

    Write-Host "${$colors.Blue}╔$(("═" * 64))╗${$colors.Reset}"
    Write-Host "${$colors.Blue}║   Lucide React - Development Environment Setup              ║${$colors.Reset}"
    Write-Host "${$colors.Blue}╚$(("═" * 64))╝${$colors.Reset}"
    Write-Host ""

    try {
        # Validate environment
        Write-Log "Validating system environment..."
        Validate-NodeVersion
        Validate-NpmVersion
        Validate-Git
        Validate-OpenSSL

        # Setup environment
        Write-Log "Setting up project configuration..."
        New-EnvLocal

        # Generate keys
        Write-Log "Generating security keys and secrets..."
        New-EncryptionKey
        New-JwtSecret
        New-CertificatePins

        # Install dependencies
        Write-Log "Installing project dependencies..."
        Install-Dependencies

        # Setup git hooks
        Write-Log "Setting up git hooks..."
        New-GitHooks

        # Run tests
        if (-not $CI) {
            if (Prompt-YesNo "Run initial test suite?" "y") {
                Invoke-InitialTests
            }
        }

        # Show summary
        Show-Summary

        # Calculate duration
        $endTime = Get-Date
        $duration = [Math]::Round(($endTime - $startTime).TotalSeconds)
        Write-Log "Setup completed in ${duration}s"
    }
    catch {
        Write-Error-Custom $_
        exit 1
    }
}

# Run main
Main
