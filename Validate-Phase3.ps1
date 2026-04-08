# ============================================================
#  Validate-Phase3.ps1  --  Emerald Pearland Events
#  Modularization & API Contracts (Phase 3)
#  Run from the ROOT of your booking-system repo
# ============================================================

$ErrorActionPreference = "Continue"
$pass  = 0
$fail  = 0
$warns = 0

function Pass  { param($msg) Write-Host "  [PASS] $msg" -ForegroundColor Green;  $global:pass++  }
function Fail  { param($msg) Write-Host "  [FAIL] $msg" -ForegroundColor Red;    $global:fail++  }
function Warn  { param($msg) Write-Host "  [WARN] $msg" -ForegroundColor Yellow; $global:warns++ }
function Title { param($msg) Write-Host "`n== $msg ==" -ForegroundColor Cyan }

function FileExists { param($p) Test-Path $p -PathType Leaf }
function DirExists  { param($p) Test-Path $p -PathType Container }

function FileContains {
    param($file, $pattern)
    if (-not (FileExists $file)) { return $false }
    (Get-Content $file -Raw) -match $pattern
}

function FileNotContains {
    param($file, $pattern)
    if (-not (FileExists $file)) { return $true }
    -not ((Get-Content $file -Raw) -match $pattern)
}

function AnyFileContains {
    param($glob, $pattern)
    $files = Get-ChildItem $glob -Recurse -ErrorAction SilentlyContinue |
             Where-Object { $_.FullName -notmatch "\\node_modules\\" }
    foreach ($f in $files) {
        $c = Get-Content $f.FullName -Raw -ErrorAction SilentlyContinue
        if ($c -and ($c -match $pattern)) { return $true }
    }
    return $false
}

# =============================================================================
Title "PROMPT 1 -- Bookings Domain Module"
# =============================================================================

$bookingFiles = @(
    "modules/bookings/bookings.routes.js",
    "modules/bookings/bookings.controller.js",
    "modules/bookings/bookings.service.js",
    "modules/bookings/bookings.repository.js"
)

foreach ($f in $bookingFiles) {
    if (FileExists $f) { Pass "Exists: $f" } else { Fail "Missing: $f" }
}

if (FileExists "modules/bookings/bookings.routes.js") {
    $routesRaw = Get-Content "modules/bookings/bookings.routes.js" -Raw

    if ($routesRaw -match "router\.(get|post|put|patch|delete)\s*\(") {
        Pass "bookings.routes.js contains route definitions"
    } else {
        Fail "bookings.routes.js has no route definitions"
    }

    $forbiddenInRoutes = @("await", "\.find\(", "\.save\(", "\.create\(", "mongoose")
    foreach ($kw in $forbiddenInRoutes) {
        if ($routesRaw -match $kw) {
            Warn "bookings.routes.js contains '$kw' -- business logic may have leaked into routes"
        }
    }
}

if (FileExists "modules/bookings/bookings.service.js") {
    if (FileNotContains "modules/bookings/bookings.service.js" "\breq\b|\bres\b") {
        Pass "bookings.service.js has no req/res objects"
    } else {
        Fail "bookings.service.js contains req or res -- service layer must be HTTP-agnostic"
    }
}

if (FileExists "modules/bookings/bookings.repository.js") {
    if (FileContains "modules/bookings/bookings.repository.js" "require.*Booking|models/Booking") {
        Pass "bookings.repository.js imports Booking model"
    } else {
        Warn "bookings.repository.js does not appear to import the Booking model"
    }
}

if (FileContains "modules/bookings/bookings.controller.js" "require.*Booking|models/Booking") {
    Fail "bookings.controller.js imports Booking model directly -- only repository should"
}
if (FileContains "modules/bookings/bookings.service.js" "require.*Booking|models/Booking") {
    Fail "bookings.service.js imports Booking model directly -- only repository should"
}
if (FileContains "modules/bookings/bookings.routes.js" "require.*Booking|models/Booking") {
    Fail "bookings.routes.js imports Booking model directly -- only repository should"
}

$adminExists = (FileExists "routes/adminRoutes.js") -or (FileExists "adminRoutes.js")
$adminFile   = if (FileExists "routes/adminRoutes.js") { "routes/adminRoutes.js" } else { "adminRoutes.js" }

if ($adminExists) {
    if (FileContains $adminFile "require.*modules/bookings/bookings\.routes") {
        Pass "adminRoutes.js mounts modules/bookings/bookings.routes"
    } else {
        Fail "adminRoutes.js does not mount the new bookings router"
    }
} else {
    Warn "Could not locate adminRoutes.js -- skipping mount check"
}

# =============================================================================
Title "PROMPT 2 -- Payments Domain Module"
# =============================================================================

$paymentFiles = @(
    "modules/payments/payments.routes.js",
    "modules/payments/payments.controller.js",
    "modules/payments/payments.service.js",
    "modules/payments/payments.repository.js"
)

foreach ($f in $paymentFiles) {
    if (FileExists $f) { Pass "Exists: $f" } else { Fail "Missing: $f" }
}

if (FileExists "modules/payments/payments.service.js") {
    if (FileNotContains "modules/payments/payments.service.js" "\breq\b|\bres\b") {
        Pass "payments.service.js has no req/res objects"
    } else {
        Fail "payments.service.js contains req or res -- service layer must be HTTP-agnostic"
    }
}

$paymentModelPattern = "require.*(Payment|Transaction)|models/(Payment|Transaction)"
if (FileContains "modules/payments/payments.controller.js" $paymentModelPattern) {
    Fail "payments.controller.js imports Payment/Transaction model -- only repository should"
}
if (FileContains "modules/payments/payments.service.js" $paymentModelPattern) {
    Fail "payments.service.js imports Payment/Transaction model -- only repository should"
}

if ($adminExists) {
    if (FileContains $adminFile "require.*modules/payments/payments\.routes") {
        Pass "adminRoutes.js mounts modules/payments/payments.routes"
    } else {
        Fail "adminRoutes.js does not mount the new payments router"
    }
}

if (FileExists "modules/payments/payments.controller.js") {
    if (FileContains "modules/payments/payments.controller.js" "paymentQueue\.add") {
        Pass "paymentQueue.add() is in payments.controller.js (correct layer)"
    } else {
        Warn "paymentQueue.add() not found in payments.controller.js -- verify it has not moved to service"
    }
}

# =============================================================================
Title "PROMPT 3 -- Cross-Boundary Decoupling (Client Portal)"
# =============================================================================

$clientRoutes = @(
    "routes/clientPortalRoutes.js",
    "clientPortalRoutes.js"
) | Where-Object { FileExists $_ } | Select-Object -First 1

$clientCtrl = @(
    "controllers/clientPortalController.js",
    "clientPortalController.js"
) | Where-Object { FileExists $_ } | Select-Object -First 1

if ($clientRoutes) {
    $staffImportPattern = "require.*staff[- _]?(system|portal|routes|controller|service|model)"
    if (FileNotContains $clientRoutes $staffImportPattern) {
        Pass "clientPortalRoutes.js has no direct staff-system imports"
    } else {
        Fail "clientPortalRoutes.js still imports from the staff system -- coupling remains"
    }
} else {
    Warn "Could not locate clientPortalRoutes.js -- skipping cross-boundary check"
}

if ($clientCtrl) {
    $staffImportPattern = "require.*staff[- _]?(system|portal|routes|controller|service|model)"
    if (FileNotContains $clientCtrl $staffImportPattern) {
        Pass "clientPortalController.js has no direct staff-system imports"
    } else {
        Fail "clientPortalController.js still imports from the staff system -- coupling remains"
    }

    $ctrlRaw = Get-Content $clientCtrl -Raw
    if ($ctrlRaw -match "(?i)(data contract|expected.*staff|staff.*response|shape)") {
        Pass "clientPortalController.js has a data-contract comment block"
    } else {
        Warn "clientPortalController.js is missing the data-contract comment block"
    }
} else {
    Warn "Could not locate clientPortalController.js -- skipping cross-boundary check"
}

if (DirExists "shared/repositories") {
    Pass "shared/repositories/ directory exists"
} else {
    Warn "shared/repositories/ not found -- create if using shared-repo approach for cross-boundary reads"
}

# =============================================================================
Title "PROMPT 4 -- Standardized API Response Envelope"
# =============================================================================

$respondFile = @("utils/respond.js", "helpers/respond.js", "lib/respond.js") |
    Where-Object { FileExists $_ } | Select-Object -First 1

if ($respondFile) {
    Pass "respond.js found at: $respondFile"
    $respondRaw = Get-Content $respondFile -Raw

    $checks = @{
        "Accepts (res, status, data, meta) signature" = "function respond\s*\(\s*res\s*,\s*status\s*,\s*data"
        "Sets success based on status < 400"          = "status\s*<\s*400"
        "Has data field"                              = "\bdata\s*:"
        "Has error field"                             = "\berror\s*:"
        "Has meta + timestamp"                        = "timestamp"
        "Uses module.exports"                         = "module\.exports\s*="
    }

    foreach ($label in $checks.Keys) {
        if ($respondRaw -match $checks[$label]) {
            Pass "respond.js: $label"
        } else {
            Fail "respond.js missing: $label"
        }
    }
} else {
    Fail "respond.js not found in utils/, helpers/, or lib/ -- create utils/respond.js"
}

$controllersToCheck = @(
    "modules/bookings/bookings.controller.js",
    "modules/payments/payments.controller.js",
    "controllers/authController.js",
    "authController.js"
)

foreach ($ctrl in $controllersToCheck) {
    if (-not (FileExists $ctrl)) { continue }
    $raw = Get-Content $ctrl -Raw
    $lbl = $ctrl

    if ($raw -match "\brespond\s*\(") {
        Pass "$lbl uses respond()"
    } else {
        Fail "$lbl does not call respond() -- standardize the response envelope"
    }

    $rawJsonCount = ([regex]::Matches($raw, "res\.(status\(\d+\)\.)?json\(")).Count
    if ($rawJsonCount -gt 0) {
        Warn "$lbl still has $rawJsonCount raw res.json() call(s) -- replace with respond()"
    }
}

# =============================================================================
Title "PROMPT 5 -- /api/v1 Prefix and Version Freeze"
# =============================================================================

$serverFile = @("server-prod.js", "server.js", "app.js") |
    Where-Object { FileExists $_ } | Select-Object -First 1

if ($serverFile) {
    Pass "Server entry point found: $serverFile"
    $serverRaw = Get-Content $serverFile -Raw

    $q = "[`'`"]"
    $routeDomains = @("bookings", "payments", "auth", "staff", "admin", "client")
    foreach ($domain in $routeDomains) {
        if ($serverRaw -match "use\s*\(\s*$q.*$domain") {
            if ($serverRaw -match "use\s*\(\s*$q/api/v1/$domain") {
                Pass "/$domain is mounted under /api/v1/"
            } else {
                Fail "/$domain is mounted but NOT under /api/v1/ -- update the mount path"
            }
        }
    }

    foreach ($domain in @("bookings", "payments")) {
        $barePattern = "use\s*\(\s*$q/$domain$q"
        if ($serverRaw -match $barePattern) {
            Fail "Found bare route mount for /$domain -- should be /api/v1/$domain"
        }
    }
} else {
    Warn "Could not locate server entry point (server-prod.js / server.js / app.js)"
}

if (FileExists "netlify.toml") {
    $netlifyRaw = Get-Content "netlify.toml" -Raw
    if ($netlifyRaw -match "/api/v1") {
        Pass "netlify.toml redirects include /api/v1 in target path"
    } else {
        Fail "netlify.toml does not proxy to /api/v1 -- update [[redirects]] targets"
    }
} else {
    Warn "netlify.toml not found in repo root -- skipping Netlify proxy check"
}

$frontendDirs = @("public", "frontend", "client", "src")
$staleFound = $false

foreach ($dir in $frontendDirs) {
    if (-not (DirExists $dir)) { continue }
    $files = Get-ChildItem "$dir" -Filter "*.js" -Recurse -ErrorAction SilentlyContinue
    foreach ($f in $files) {
        $content = Get-Content $f.FullName -Raw -ErrorAction SilentlyContinue
        if (-not $content) { continue }
        $q2 = "[`'`"]"
        $hasStale = ($content -match "fetch\s*\(\s*$q2/api/(?!v1)") -or
                    ($content -match "axios\.(get|post|put|patch|delete)\s*\(\s*$q2/api/(?!v1)")
        if ($hasStale) {
            Fail "Stale /api/ (non-v1) call in: $($f.FullName)"
            $staleFound = $true
        }
    }
}
if (-not $staleFound) {
    Pass "No stale /api/ (non-v1) fetch/axios calls found in frontend files"
}

if (FileExists "docs/api-v1.md") {
    $docRaw    = Get-Content "docs/api-v1.md" -Raw
    $lineCount = ($docRaw -split "`n").Count

    if ($lineCount -ge 20) {
        Pass "docs/api-v1.md exists and has content ($lineCount lines)"
    } else {
        Warn "docs/api-v1.md looks thin ($lineCount lines) -- ensure all endpoints are listed"
    }

    $docChecks = @{
        "Lists endpoint method+path"    = "(GET|POST|PUT|PATCH|DELETE)\s+/api/v1/"
        "Has request body section"      = "(?i)(request body|body|payload)"
        "Has response envelope section" = "(?i)(response|envelope|success|error)"
    }
    foreach ($label in $docChecks.Keys) {
        if ($docRaw -match $docChecks[$label]) {
            Pass "docs/api-v1.md: $label"
        } else {
            Warn "docs/api-v1.md may be missing: $label"
        }
    }
} else {
    Fail "docs/api-v1.md not found -- create it to freeze the v1 contract"
}

$v2Found = AnyFileContains "*.js" "/api/v2"
if (-not $v2Found) {
    Pass "No /api/v2 references found (correct -- v2 comes later)"
} else {
    Warn "/api/v2 references detected -- Phase 3 says freeze v1 only"
}

# =============================================================================
Title "SUMMARY"
# =============================================================================

$total = $pass + $fail + $warns
Write-Host ""
Write-Host "  Passed  : $pass" -ForegroundColor Green
Write-Host "  Failed  : $fail" -ForegroundColor Red
Write-Host "  Warnings: $warns" -ForegroundColor Yellow
Write-Host "  Total   : $total"
Write-Host ""

if ($fail -eq 0 -and $warns -eq 0) {
    Write-Host "  Phase 3 complete. Ready to proceed to Phase 4." -ForegroundColor Green
} elseif ($fail -eq 0) {
    Write-Host "  All hard checks pass. Review warnings before Phase 4." -ForegroundColor Yellow
} else {
    Write-Host "  $fail check(s) failed. Fix all FAILs before moving to Phase 4." -ForegroundColor Red
}
