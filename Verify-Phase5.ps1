# =============================================================================
#  EMERALD PEARLAND EVENTS — PHASE 5 VERIFICATION SCRIPT
#  Run from the ROOT of your project repository in VS Code terminal
#  Usage: .\Verify-Phase5.ps1
#  Usage (with test run): .\Verify-Phase5.ps1 -RunTests
# =============================================================================

param(
    [switch]$RunTests
)

# ── Colour helpers ─────────────────────────────────────────────────────────────
function Pass  { Write-Host "  [PASS] $args" -ForegroundColor Green  }
function Fail  { Write-Host "  [FAIL] $args" -ForegroundColor Red    }
function Warn  { Write-Host "  [WARN] $args" -ForegroundColor Yellow }
function Head  { Write-Host "`n$args" -ForegroundColor Cyan          }
function Divider { Write-Host ("─" * 65) -ForegroundColor DarkGray  }

$pass  = 0
$fail  = 0
$warn  = 0

function Check-File {
    param([string]$Path, [string]$Label)
    if (Test-Path $Path) {
        Pass $Label
        $script:pass++
    } else {
        Fail "$Label — NOT FOUND: $Path"
        $script:fail++
    }
}

function Check-FileContains {
    param([string]$Path, [string]$Pattern, [string]$Label)
    if (Test-Path $Path) {
        $content = Get-Content $Path -Raw
        if ($content -match $Pattern) {
            Pass $Label
            $script:pass++
        } else {
            Fail "$Label — pattern not found in $Path"
            $script:fail++
        }
    } else {
        Fail "$Label — file missing: $Path"
        $script:fail++
    }
}

function Check-NoPattern {
    param([string]$SearchPath, [string]$Pattern, [string]$Label)
    if (Test-Path $SearchPath) {
        $results = Get-ChildItem $SearchPath -Recurse -Filter "*.js" -ErrorAction SilentlyContinue |
            Select-String -Pattern $Pattern -ErrorAction SilentlyContinue
        if ($results) {
            $count = ($results | Measure-Object).Count
            Fail "$Label — found $count occurrence(s):"
            $results | ForEach-Object { Write-Host "       $($_.Filename):$($_.LineNumber)  $($_.Line.Trim())" -ForegroundColor DarkRed }
            $script:fail++
        } else {
            Pass $Label
            $script:pass++
        }
    } else {
        Warn "$Label — directory not found: $SearchPath (skipped)"
        $script:warn++
    }
}

function Check-PackageJson {
    param([string]$Dep, [string]$Label, [switch]$Dev)
    if (Test-Path "package.json") {
        $pkg = Get-Content "package.json" -Raw | ConvertFrom-Json
        $found = $false
        if ($Dev) {
            if ($pkg.devDependencies -and $pkg.devDependencies.$Dep) { $found = $true }
        } else {
            if ($pkg.dependencies -and $pkg.dependencies.$Dep) { $found = $true }
        }
        if ($found) { Pass $Label; $script:pass++ }
        else        { Fail "$Label — '$Dep' not in $(if($Dev){'devDependencies'}else{'dependencies'})"; $script:fail++ }
    } else {
        Fail "package.json not found in current directory"
        $script:fail++
    }
}

function Check-RouteEndpoint {
    param([string]$RoutesFile, [string]$HttpMethod, [string]$PathPattern, [string]$Label)
    if (Test-Path $RoutesFile) {
        $content = Get-Content $RoutesFile -Raw
        $pattern = "router\.$HttpMethod\s*\(\s*['""]$PathPattern"
        if ($content -match $pattern) {
            Pass $Label
            $script:pass++
        } else {
            Fail "$Label — $HttpMethod '$PathPattern' not found in $RoutesFile"
            $script:fail++
        }
    } else {
        Fail "$Label — routes file missing: $RoutesFile"
        $script:fail++
    }
}

# =============================================================================
Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   EMERALD PEARLAND EVENTS — PHASE 5 VERIFICATION            ║" -ForegroundColor Cyan
Write-Host "║   Observability · Testing · Long-Term Resilience             ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

$root = Get-Location
Write-Host "  Project root: $root" -ForegroundColor DarkGray
Write-Host ""

# =============================================================================
Head "5.1 — STRUCTURED LOGGING"
Divider

Check-File "server/utils/logger.js"                          "logger.js exists"
Check-FileContains "server/utils/logger.js" "pino"           "logger.js uses pino"
Check-FileContains "server/utils/logger.js" "service"        "logger.js sets service base field"
Check-File "server/middleware/requestLogger.js"              "requestLogger middleware exists"
Check-FileContains "server/middleware/requestLogger.js" "requestId|randomUUID" "requestLogger attaches requestId"
Check-FileContains "server/middleware/requestLogger.js" "pino-http|pinoHttp"   "requestLogger uses pino-http"
Check-FileContains "server-prod.js" "requestLogger|request.logger"             "requestLogger wired into server-prod.js"

Check-PackageJson  "pino"        "pino in dependencies"
Check-PackageJson  "pino-http"   "pino-http in dependencies"
Check-PackageJson  "pino-pretty" "pino-pretty in dependencies"

# No bare console.log remaining in source dirs
Check-NoPattern "server/modules"  "console\.log\s*\("  "No bare console.log in server/modules/"
Check-NoPattern "server/jobs"     "console\.log\s*\("  "No bare console.log in server/jobs/"

# =============================================================================
Head "5.2 — HEALTH ENDPOINTS"
Divider

$healthFile = if (Test-Path "server/routes/health.routes.js") { "server/routes/health.routes.js" }
              elseif (Test-Path "routes/health.routes.js")     { "routes/health.routes.js" }
              else                                              { $null }

if ($healthFile) {
    Pass "health.routes.js exists at: $healthFile"
    $pass++
    Check-FileContains $healthFile "\/health\/live"           "GET /health/live defined"
    Check-FileContains $healthFile "\/health\/ready"          "GET /health/ready defined"
    Check-FileContains $healthFile "503"                       "/health/ready returns 503 on failure"
    Check-FileContains $healthFile "mongo|mongoose|db\.admin" "/health/ready checks MongoDB"
    Check-FileContains $healthFile "redis|Redis"              "/health/ready checks Redis"
} else {
    Fail "health.routes.js not found (checked server/routes/ and routes/)"
    $fail += 5
}

# Confirm health is mounted WITHOUT auth in server-prod.js
if (Test-Path "server-prod.js") {
    $spContent = Get-Content "server-prod.js" -Raw
    if ($spContent -match "health") {
        Pass "Health routes mounted in server-prod.js"
        $pass++
    } else {
        Fail "Health routes NOT mounted in server-prod.js"
        $fail++
    }
}

# =============================================================================
Head "5.3 — JEST TESTING INFRASTRUCTURE"
Divider

Check-PackageJson "jest"              "jest in devDependencies"       -Dev
Check-PackageJson "supertest"         "supertest in devDependencies"  -Dev
Check-PackageJson "@jest/globals"     "@jest/globals in devDependencies" -Dev

Check-File "tests/setup.js"                          "tests/setup.js exists"
Check-FileContains "tests/setup.js" "MongoMemoryServer|mongodb-memory-server" "setup.js uses in-memory MongoDB"
Check-FileContains "tests/setup.js" "beforeAll|afterAll"  "setup.js has lifecycle hooks"

Check-File "tests/helpers/auth.helper.js"            "tests/helpers/auth.helper.js exists"
Check-FileContains "tests/helpers/auth.helper.js" "createAdminToken|sign" "auth helper creates admin token"

Check-File ".env.test"                               ".env.test file exists"

# Verify jest config in package.json
if (Test-Path "package.json") {
    $pkg = Get-Content "package.json" -Raw | ConvertFrom-Json
    if ($pkg.jest -or $pkg.scripts.test -match "jest") {
        Pass "Jest configured in package.json"
        $pass++
    } else {
        Fail "Jest config missing from package.json"
        $fail++
    }
    if ($pkg.scripts.test -match "jest") {
        Pass "npm test script points to jest"
        $pass++
    } else {
        Fail "npm test script does not run jest"
        $fail++
    }
}

# =============================================================================
Head "5.4 — TEST FILES"
Divider

Check-File "tests/bookings/booking.lifecycle.test.js"  "Booking lifecycle test exists"
Check-File "tests/payments/payment.flow.test.js"       "Payment flow test exists"
Check-File "tests/api/bookings.api.test.js"            "Bookings API contract test exists"

# Check test content quality
Check-FileContains "tests/bookings/booking.lifecycle.test.js" "syncStatus"       "Lifecycle test covers syncStatus"
Check-FileContains "tests/bookings/booking.lifecycle.test.js" "confirmed|cancelled" "Lifecycle test covers status transitions"
Check-FileContains "tests/payments/payment.flow.test.js"    "idempotencyKey"    "Payment test covers idempotency"
Check-FileContains "tests/payments/payment.flow.test.js"    "duplicate|existing" "Payment test covers duplicate callback"
Check-FileContains "tests/api/bookings.api.test.js"         "supertest|request" "API test uses supertest"
Check-FileContains "tests/api/bookings.api.test.js"         "401"               "API test checks 401 unauthorized"
Check-FileContains "tests/api/bookings.api.test.js"         "success.*true\|data\." "API test checks response envelope"

# =============================================================================
Head "5.5 — ADMIN SECURITY CENTER"
Divider

# Model
Check-File "server/models/SecurityEvent.js"                 "SecurityEvent model exists"
Check-FileContains "server/models/SecurityEvent.js" "eventType" "SecurityEvent has eventType field"
Check-FileContains "server/models/SecurityEvent.js" "login_failed|login_success" "SecurityEvent has event type enums"

# Logger utility
Check-File "server/utils/securityLogger.js"                 "securityLogger.js exists"
Check-FileContains "server/utils/securityLogger.js" "logSecurityEvent" "securityLogger exports logSecurityEvent"

# Routes
$secFile = if (Test-Path "server/routes/security.routes.js") { "server/routes/security.routes.js" }
           elseif (Test-Path "routes/security.routes.js")    { "routes/security.routes.js" }
           else                                               { $null }

if ($secFile) {
    Pass "security.routes.js found at: $secFile"
    $pass++
    Check-FileContains $secFile "\/events"         "Security route: /events"
    Check-FileContains $secFile "\/sync-status"    "Security route: /sync-status"
    Check-FileContains $secFile "\/sync-retry"     "Security route: /sync-retry/:id"
    Check-FileContains $secFile "\/queue-health"   "Security route: /queue-health"
    Check-FileContains $secFile "\/env-check"      "Security route: /env-check"
    Check-FileContains $secFile "authorize|Admin"  "Security routes require Admin role"
} else {
    Fail "security.routes.js not found"
    $fail += 6
}

# Frontend page
$secHtml = if (Test-Path "admin/security-center.html") { "admin/security-center.html" }
           elseif (Test-Path "public/security-center.html") { "public/security-center.html" }
           else { $null }

if ($secHtml) {
    Pass "security-center.html found at: $secHtml"
    $pass++
    Check-FileContains $secHtml "sync-status|syncStatus"  "UI has sync status panel"
    Check-FileContains $secHtml "queue-health|queueHealth" "UI has queue health panel"
    Check-FileContains $secHtml "env-check|envCheck"       "UI has env integrity panel"
    Check-FileContains $secHtml "fetch\s*\("               "UI makes fetch() calls"
} else {
    Fail "security-center.html not found (checked admin/ and public/)"
    $fail += 4
}

# =============================================================================
Head "5.6 — CI/CD PIPELINE"
Divider

Check-File ".github/workflows/ci.yml"                            "GitHub Actions ci.yml exists"
Check-FileContains ".github/workflows/ci.yml" "npm.*test\|jest"  "CI runs tests"
Check-FileContains ".github/workflows/ci.yml" "npm.*audit"       "CI runs npm audit"
Check-FileContains ".github/workflows/ci.yml" "eslint"           "CI runs ESLint"
Check-FileContains ".github/workflows/ci.yml" "trufflehog\|secret.*scan\|gitleaks" "CI runs secret scanning"
Check-FileContains ".github/workflows/ci.yml" "mongo.*service\|services.*mongo"    "CI uses MongoDB service"
Check-FileContains ".github/workflows/ci.yml" "redis.*service\|services.*redis"    "CI uses Redis service"
Check-FileContains ".github/workflows/ci.yml" "pull_request"     "CI triggers on pull_request"

Check-File ".eslintrc.js"                                         ".eslintrc.js exists"
Check-FileContains ".eslintrc.js" "no-console"                   "ESLint warns on console usage"

# =============================================================================
Head "5.7 — DISASTER RECOVERY RUNBOOKS"
Divider

Check-File "docs/runbooks/01-database-restore.md"        "Runbook 01: Database restore"
Check-File "docs/runbooks/02-rollback-deployment.md"     "Runbook 02: Rollback deployment"
Check-File "docs/runbooks/03-secret-rotation-incident.md" "Runbook 03: Secret rotation"
Check-File "docs/runbooks/04-mpesa-reconciliation.md"    "Runbook 04: M-Pesa reconciliation"

Check-FileContains "docs/runbooks/01-database-restore.md" "RPO\|RTO\|point-in-time" "DB restore runbook mentions RPO/RTO"
Check-FileContains "docs/runbooks/04-mpesa-reconciliation.md" "dead-letter\|reconcil" "M-Pesa runbook covers dead-letter queue"

# =============================================================================
if ($RunTests) {
    Head "5.8 — RUNNING npm test"
    Divider
    Write-Host "  Running: npm test ..." -ForegroundColor DarkGray
    Write-Host ""
    $testResult = & npm test 2>&1
    $testResult | ForEach-Object { Write-Host "  $_" }
    Write-Host ""
    if ($LASTEXITCODE -eq 0) {
        Pass "npm test — ALL TESTS PASSED"
        $pass++
    } else {
        Fail "npm test — SOME TESTS FAILED (exit code: $LASTEXITCODE)"
        $fail++
    }
} else {
    Write-Host ""
    Warn "Test run skipped. Use: .\Verify-Phase5.ps1 -RunTests to include npm test"
    $warn++
}

# =============================================================================
Head "PHASE 5 SUMMARY"
Divider
Write-Host ""
Write-Host "  PASSED : $pass checks" -ForegroundColor Green
Write-Host "  FAILED : $fail checks" -ForegroundColor Red
Write-Host "  WARNED : $warn checks" -ForegroundColor Yellow
Write-Host ""

$total = $pass + $fail
$pct   = if ($total -gt 0) { [math]::Round(($pass / $total) * 100, 1) } else { 0 }

if ($fail -eq 0) {
    Write-Host "  ✅  PHASE 5 COMPLETE — $pct% checks passed" -ForegroundColor Green
    Write-Host "  All Phase 5 items are implemented." -ForegroundColor Green
} elseif ($pct -ge 80) {
    Write-Host "  🟡  MOSTLY DONE — $pct% checks passed ($fail remaining)" -ForegroundColor Yellow
    Write-Host "  Fix the FAILED items above, then re-run this script." -ForegroundColor Yellow
} else {
    Write-Host "  🔴  INCOMPLETE — $pct% checks passed ($fail remaining)" -ForegroundColor Red
    Write-Host "  Work through the failed items in order, then re-run." -ForegroundColor Red
}

Write-Host ""
Divider
Write-Host "  Emerald Pearland Events — Master Blueprint Phase 5 Verification" -ForegroundColor DarkGray
Write-Host ""
