# ============================================================
#  EMERALD PEARLAND -- Phase 2 Pre-Deploy Validation Script
#  Run from: C:\My Web Sites\school\live.themewild.com\emerald
# ============================================================

param(
    [string]$ProjectRoot = $PSScriptRoot
)

$ErrorActionPreference = "SilentlyContinue"
Set-Location $ProjectRoot

$script:pass = 0
$script:fail = 0
$script:warn = 0

function Pass($msg)  { Write-Host "  [PASS] $msg" -ForegroundColor Green;  $script:pass++ }
function Fail($msg)  { Write-Host "  [FAIL] $msg" -ForegroundColor Red;    $script:fail++ }
function Warn($msg)  { Write-Host "  [WARN] $msg" -ForegroundColor Yellow; $script:warn++ }
function Head($msg)  { Write-Host "`n$msg" -ForegroundColor Cyan }

function FileExists($rel) {
    Test-Path (Join-Path $ProjectRoot $rel)
}

function FileContains($rel, $pattern) {
    $full = Join-Path $ProjectRoot $rel
    if (-not (Test-Path $full)) { return $false }
    $content = Get-Content $full -Raw -Encoding UTF8
    return ($content -match $pattern)
}

function FileNotContains($rel, $pattern) {
    $full = Join-Path $ProjectRoot $rel
    if (-not (Test-Path $full)) { return $true }
    $content = Get-Content $full -Raw -Encoding UTF8
    return (-not ($content -match $pattern))
}

# ============================================================
Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "   EMERALD PHASE 2 -- Pre-Deploy Validation" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Project root: $ProjectRoot"
# ============================================================

# ------------------------------------------------------------
Head "[ 1/6 ] PROMPT 1 -- BullMQ installed + config/queues.js"
# ------------------------------------------------------------

$pkg = Join-Path $ProjectRoot "package.json"
if (Test-Path $pkg) {
    $pkgJson = Get-Content $pkg -Raw | ConvertFrom-Json
    if ($pkgJson.dependencies.bullmq) {
        Pass "bullmq in package.json ($($pkgJson.dependencies.bullmq))"
    } else {
        Fail "bullmq NOT in package.json dependencies"
    }
} else {
    Fail "package.json not found"
}

if (Test-Path (Join-Path $ProjectRoot "node_modules\bullmq")) {
    Pass "bullmq present in node_modules"
} else {
    Warn "bullmq not in node_modules -- run npm install before deploying"
}

if (FileExists "config\queues.js") {
    Pass "config/queues.js exists"
} else {
    Fail "config/queues.js MISSING -- Prompt 1 incomplete"
}

foreach ($q in @("bookingQueue","paymentQueue","notificationQueue","syncQueue")) {
    if (FileContains "config\queues.js" $q) {
        Pass "config/queues.js declares $q"
    } else {
        Fail "config/queues.js missing $q"
    }
}

if (FileContains "config\queues.js" "REDIS_URL") {
    Pass "config/queues.js uses REDIS_URL env var"
} else {
    Fail "config/queues.js does not reference REDIS_URL"
}

if (FileContains "config\queues.js" "defaultJobOptions") {
    Pass "config/queues.js has defaultJobOptions"
} else {
    Fail "config/queues.js missing defaultJobOptions"
}

if (FileContains "config\queues.js" "attempts") {
    Pass "config/queues.js has retry attempts configured"
} else {
    Fail "config/queues.js missing retry attempts"
}

if (FileContains "config\queues.js" "module\.exports|export ") {
    Pass "config/queues.js has exports"
} else {
    Fail "config/queues.js has no exports"
}

# ------------------------------------------------------------
Head "[ 2/6 ] PROMPT 2 -- worker.js entry point"
# ------------------------------------------------------------

if (FileExists "worker.js") {
    Pass "worker.js exists at project root"
} else {
    Fail "worker.js MISSING -- Prompt 2 incomplete"
}

foreach ($w in @("bookingWorker","paymentWorker","notificationWorker","syncWorker")) {
    if (FileContains "worker.js" $w) {
        Pass "worker.js declares $w"
    } else {
        Fail "worker.js missing $w"
    }
}

if (FileContains "worker.js" "\.on\(.failed") {
    Pass "worker.js has .on('failed') error listeners"
} else {
    Fail "worker.js missing .on('failed') error listeners"
}

if (FileContains "worker.js" "SIGTERM") {
    Pass "worker.js handles SIGTERM graceful shutdown"
} else {
    Fail "worker.js missing SIGTERM graceful shutdown"
}

if (FileContains "worker.js" "All workers started") {
    Pass "worker.js logs startup message"
} else {
    Warn "worker.js missing 'All workers started' startup log"
}

# ------------------------------------------------------------
Head "[ 3/6 ] PROMPT 3 -- Booking confirmation moved to queue"
# ------------------------------------------------------------

$adminRoutes = $null
$adminRouteCandidates = @(
    "server\routes\adminRoutes.js",
    "routes\adminRoutes.js",
    "adminRoutes.js",
    "staff-system\controllers\adminController.js",
    "staff-system\controllers\adminFinanceController.js"
)
foreach ($candidate in $adminRouteCandidates) {
    if (FileExists $candidate) {
        $adminRoutes = $candidate
        break
    }
}

if ($adminRoutes -and (FileExists $adminRoutes)) {
    if (FileContains $adminRoutes "bookingQueue\.add") {
        Pass "$adminRoutes enqueues to bookingQueue"
    } else {
        Fail "$adminRoutes does not call bookingQueue.add"
    }

    if (FileNotContains $adminRoutes "syncToStaffPortal\(") {
        Pass "$adminRoutes no longer calls syncToStaffPortal directly"
    } else {
        Warn "$adminRoutes still calls syncToStaffPortal directly -- should be in worker"
    }

    if (FileNotContains $adminRoutes "sendConfirmationEmail\(") {
        Pass "$adminRoutes no longer calls sendConfirmationEmail directly"
    } else {
        Warn "$adminRoutes still calls sendConfirmationEmail directly -- should be in worker"
    }
} else {
    Warn "adminRoutes.js not found -- skipping booking confirmation checks"
}

if (FileContains "worker.js" "confirmed") {
    Pass "worker.js handles the confirmed booking job"
} else {
    Fail "worker.js missing handler for confirmed booking job"
}

foreach ($fn in @("syncToStaffPortal","sendConfirmationEmail","sendStaffNotifications")) {
    if (FileContains "worker.js" $fn) {
        Pass "worker.js calls $fn in bookingWorker"
    } else {
        Fail "worker.js missing $fn in bookingWorker"
    }
}

# ------------------------------------------------------------
Head "[ 4/6 ] PROMPT 4 -- M-Pesa callback moved to queue"
# ------------------------------------------------------------

$paymentSvc = $null
$paymentSvcCandidates = @(
    "staff-system\financials\services\eventPaymentService.js",
    "services\eventPaymentService.js",
    "eventPaymentService.js"
)
foreach ($candidate in $paymentSvcCandidates) {
    if (FileExists $candidate) {
        $paymentSvc = $candidate
        break
    }
}

$mpesaQueued = $false
if ($paymentSvc -and (FileExists $paymentSvc)) {
    if (FileContains $paymentSvc "paymentQueue\.add") {
        Pass "$paymentSvc enqueues M-Pesa callback"
        $mpesaQueued = $true
    }
}
if ((-not $mpesaQueued) -and (FileExists $adminRoutes)) {
    if (FileContains $adminRoutes "paymentQueue\.add") {
        Pass "paymentQueue.add found in adminRoutes"
        $mpesaQueued = $true
    }
}
if (-not $mpesaQueued) {
    $mpesaQueueCandidates = @(
        "staff-system\controllers\adminController.js",
        "staff-system\controllers\adminFinanceController.js",
        "server.js"
    )
    foreach ($candidate in $mpesaQueueCandidates) {
        if ((FileExists $candidate) -and (FileContains $candidate "paymentQueue\.add")) {
            Pass "paymentQueue.add found in $candidate"
            $mpesaQueued = $true
            break
        }
    }
}
if (-not $mpesaQueued) {
    Fail "paymentQueue.add not found -- M-Pesa callback not queued (Prompt 4 incomplete)"
}

if (FileContains "worker.js" "mpesa") {
    Pass "worker.js handles mpesa callback job"
} else {
    Fail "worker.js missing mpesa callback handler -- Prompt 4 incomplete"
}

if (FileContains "worker.js" "idempoten") {
    Pass "worker.js references idempotency in paymentWorker"
} else {
    Warn "worker.js may be missing idempotency check -- verify paymentWorker manually"
}

# ------------------------------------------------------------
Head "[ 5/6 ] PROMPT 5 -- Email moved to notificationQueue"
# ------------------------------------------------------------

if (FileContains "worker.js" "notificationWorker") {
    if (FileContains "worker.js" "email") {
        Pass "worker.js notificationWorker handles email jobs"
    } else {
        Fail "worker.js notificationWorker missing email job handling"
    }
} else {
    Fail "worker.js missing notificationWorker entirely"
}

$notifFound = $false
$jsFiles = Get-ChildItem -Path $ProjectRoot -Filter "*.js" -Recurse -Depth 4 -ErrorAction SilentlyContinue |
    Where-Object { ($_.FullName -notmatch "node_modules") -and ($_.Name -ne "worker.js") }

foreach ($f in $jsFiles) {
    $c = Get-Content $f.FullName -Raw -Encoding UTF8 -ErrorAction SilentlyContinue
    if ($c -match "notificationQueue\.add") {
        Pass "notificationQueue.add found in $($f.Name)"
        $notifFound = $true
        break
    }
}
if (-not $notifFound) {
    Fail "notificationQueue.add not found in any file -- email not queued (Prompt 5 incomplete)"
}

if (FileContains "worker.js" "switch|case ") {
    Pass "worker.js has switch/case routing for notification types"
} else {
    Warn "worker.js may be missing switch-on-type for email dispatch -- verify manually"
}

# ------------------------------------------------------------
Head "[ 6/6 ] GENERAL CHECKS"
# ------------------------------------------------------------

$envChecked = $false
foreach ($envFile in @(".env", ".env.example", ".env.production")) {
    $envPath = Join-Path $ProjectRoot $envFile
    if (Test-Path $envPath) {
        $envContent = Get-Content $envPath -Raw -Encoding UTF8
        if ($envContent -match "REDIS_URL") {
            Pass "$envFile contains REDIS_URL"
        } else {
            Warn "$envFile missing REDIS_URL -- confirm it is set in Render dashboard"
        }
        $envChecked = $true
        break
    }
}
if (-not $envChecked) {
    Warn "No .env file found -- confirm REDIS_URL is set in Render dashboard"
}

$gitignorePath = Join-Path $ProjectRoot ".gitignore"
if (Test-Path $gitignorePath) {
    $gi = Get-Content $gitignorePath -Raw -Encoding UTF8
    if ($gi -match "worker\.js") {
        Fail "worker.js appears in .gitignore -- Render will not see it"
    } else {
        Pass "worker.js is not gitignored"
    }
} else {
    Warn ".gitignore not found -- verify worker.js will be committed"
}

$nodeExe = Get-Command node -ErrorAction SilentlyContinue
if ($nodeExe) {
    foreach ($fileToCheck in @("worker.js", "config\queues.js")) {
        if (FileExists $fileToCheck) {
            $fullPath = Join-Path $ProjectRoot $fileToCheck
            $result = & node --check $fullPath 2>&1
            if ($LASTEXITCODE -eq 0) {
                Pass "$fileToCheck passes Node.js syntax check"
            } else {
                Fail "$fileToCheck has syntax errors: $result"
            }
        }
    }
} else {
    Warn "node not found in PATH -- skipping syntax checks"
}

# ------------------------------------------------------------
# SUMMARY
# ------------------------------------------------------------
Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  RESULTS" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ("  PASSED : " + $script:pass) -ForegroundColor Green

$failColor = if ($script:fail -gt 0) { "Red" } else { "Green" }
Write-Host ("  FAILED : " + $script:fail) -ForegroundColor $failColor

$warnColor = if ($script:warn -gt 0) { "Yellow" } else { "Green" }
Write-Host ("  WARNED : " + $script:warn) -ForegroundColor $warnColor

Write-Host ""
if ($script:fail -eq 0) {
    Write-Host "  OK  All checks passed. Safe to deploy to Render." -ForegroundColor Green
    Write-Host "  NOTE: Background Worker deploy is manual (Render dashboard)" -ForegroundColor Yellow
    Write-Host "  NOTE: Cron job service deferred -- post-revenue item." -ForegroundColor Yellow
} else {
    Write-Host ("  " + $script:fail + " check(s) failed. Fix above before deploying.") -ForegroundColor Red
}
Write-Host ""
