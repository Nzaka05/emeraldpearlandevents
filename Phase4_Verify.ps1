# =============================================================================
# EMERALD PEARLAND EVENTS — Phase 4 Verification Script
# Performance & Database Optimization
# Run from: VS Code terminal, in the root of your project repo
# Usage:    .\Phase4_Verify.ps1
#           .\Phase4_Verify.ps1 -ProjectRoot "C:\path\to\your\project"
# =============================================================================

param(
    [string]$ProjectRoot = (Get-Location).Path
)

# --- Colour helpers ----------------------------------------------------------
function Pass($msg)  { Write-Host "  [PASS] $msg" -ForegroundColor Green }
function Fail($msg)  { Write-Host "  [FAIL] $msg" -ForegroundColor Red }
function Warn($msg)  { Write-Host "  [WARN] $msg" -ForegroundColor Yellow }
function Head($msg)  { Write-Host "`n$msg" -ForegroundColor Cyan }
function Info($msg)  { Write-Host "        $msg" -ForegroundColor Gray }

$script:pass  = 0
$script:fail  = 0
$script:warns = 0

function Check($condition, $passMsg, $failMsg) {
    if ($condition) { Pass $passMsg; $script:pass = $script:pass + 1 }
    else            { Fail $failMsg; $script:fail = $script:fail + 1 }
}

function CheckWarn($condition, $passMsg, $warnMsg) {
    if ($condition) { Pass $passMsg; $script:pass = $script:pass + 1 }
    else            { Warn $warnMsg; $script:warns = $script:warns + 1 }
}

# --- File helpers -------------------------------------------------------------
function FindFile($pattern) {
    Get-ChildItem -Path $ProjectRoot -Recurse -Filter $pattern -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName -notmatch 'node_modules|\.git' } |
        Select-Object -First 1
}

function FindFiles($pattern) {
    Get-ChildItem -Path $ProjectRoot -Recurse -Filter $pattern -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName -notmatch 'node_modules|\.git' }
}

function FirstExistingPath($paths) {
    foreach ($candidate in $paths) {
        if ($candidate -is [System.Array]) {
            foreach ($path in $candidate) {
                $fullPath = Join-Path $ProjectRoot $path
                if (Test-Path $fullPath) { return $fullPath }
            }
        } else {
            $fullPath = Join-Path $ProjectRoot $candidate
            if (Test-Path $fullPath) { return $fullPath }
        }
    }
    return $null
}

function GrepFile($filePath, $searchString) {
    if (-not (Test-Path $filePath)) { return $false }
    $content = Get-Content $filePath -Raw -ErrorAction SilentlyContinue
    return ($content -match [regex]::Escape($searchString))
}

function GrepFileRegex($filePath, $pattern) {
    if (-not (Test-Path $filePath)) { return $false }
    $content = Get-Content $filePath -Raw -ErrorAction SilentlyContinue
    return ($content -match $pattern)
}

function GrepAnyFile($fileList, $searchString) {
    foreach ($f in $fileList) {
        if (GrepFile $f.FullName $searchString) { return $true }
    }
    return $false
}

function GrepAnyFileRegex($fileList, $pattern) {
    foreach ($f in $fileList) {
        if (GrepFileRegex $f.FullName $pattern) { return $true }
    }
    return $false
}

function GrepDir($dir, $searchString) {
    if (-not (Test-Path $dir)) { return $false }
    $results = Get-ChildItem -Path $dir -Recurse -Include "*.js" -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName -notmatch 'node_modules|\.git' } |
        Select-String -Pattern ([regex]::Escape($searchString)) -ErrorAction SilentlyContinue
    return ($null -ne $results -and $results.Count -gt 0)
}

function GrepDirRegex($dir, $pattern) {
    if (-not (Test-Path $dir)) { return $false }
    $results = Get-ChildItem -Path $dir -Recurse -Include "*.js" -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName -notmatch 'node_modules|\.git' } |
        Select-String -Pattern $pattern -ErrorAction SilentlyContinue
    return ($null -ne $results -and $results.Count -gt 0)
}

# =============================================================================
Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  EMERALD PEARLAND EVENTS — Phase 4 Verification" -ForegroundColor Cyan
Write-Host "  Project Root: $ProjectRoot" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

# =============================================================================
Head "[ 4.1 ] Remove Global Auto-Populate from Booking Model"
# =============================================================================

$bookingModel = FirstExistingPath @(
    "server/models/Booking.js",
    "models/Booking.js"
)

if ($null -eq $bookingModel) {
    Fail "Booking.js not found in project"
    $script:fail = $script:fail + 1
} else {
    Info "Found: $bookingModel"

    # Check global pre-find populate is GONE
    $hasGlobalPopulate = GrepFileRegex $bookingModel "pre\s*\(\s*['\""]find['\""]"
    Check (-not $hasGlobalPopulate) `
        "Global pre('find') populate middleware removed from Booking.js" `
        "Global pre('find') populate still exists in Booking.js - remove it"

    # Check that explicit .populate('customerId') exist elsewhere
    $explicitPopulate = GrepDirRegex $ProjectRoot "\.populate\s*\(\s*['\""]customerId['\""]"
    CheckWarn $explicitPopulate `
        "Explicit .populate('customerId') found in codebase (replacing global)" `
        "No explicit .populate('customerId') found - verify detail views still load customer data"
}

# =============================================================================
Head "[ 4.2 ] Compound Indexes Added to Booking Schema"
# =============================================================================

if ($null -ne $bookingModel) {
    # Check for compound index declarations
    $hasStatusEventDate  = GrepFileRegex $bookingModel "status\s*:\s*1\s*,\s*eventDate\s*:\s*-1|eventDate\s*:\s*-1\s*,\s*status\s*:\s*1"
    $hasCustomerIdStatus = GrepFileRegex $bookingModel "customerId\s*:\s*1\s*,\s*status\s*:\s*1|status\s*:\s*1\s*,\s*customerId\s*:\s*1"
    $hasSyncStatusIndex  = GrepFileRegex $bookingModel "syncStatus\s*:\s*1\s*,\s*lastSyncAttempt\s*:\s*1|lastSyncAttempt\s*:\s*1\s*,\s*syncStatus\s*:\s*1"
    $hasCreatedAtIndex   = GrepFileRegex $bookingModel "createdAt\s*:\s*-1"

    Check $hasStatusEventDate `
        "Compound index { status, eventDate } defined in Booking.js" `
        "Missing compound index { status: 1, eventDate: -1 } in Booking.js"

    Check $hasCustomerIdStatus `
        "Compound index { customerId, status } defined in Booking.js" `
        "Missing compound index { customerId: 1, status: 1 } in Booking.js"

    Check $hasSyncStatusIndex `
        "Compound index { syncStatus, lastSyncAttempt } defined in Booking.js" `
        "Missing compound index { syncStatus, lastSyncAttempt } — reconciliation job needs this"

    CheckWarn $hasCreatedAtIndex `
        "Index on createdAt defined in Booking.js" `
        "No createdAt index found — dashboard sort queries may be slow"
}

# Check Staff schema(s)
$staffModels = @(
    FirstExistingPath @("server/models/Staff.js"),
    FirstExistingPath @("staff-system/models/Staff.js")
) | Where-Object { $_ -ne $null }

if ($staffModels.Count -gt 0) {
    $staffHasIndex = $false
    foreach ($staffModel in $staffModels) {
        if (GrepFileRegex $staffModel "role\s*:\s*1\s*,\s*status\s*:\s*1|status\s*:\s*1\s*,\s*role\s*:\s*1|category\s*:\s*1\s*,\s*isAvailable\s*:\s*1|isAvailable\s*:\s*1\s*,\s*category\s*:\s*1") {
            $staffHasIndex = $true
        }
    }

    CheckWarn $staffHasIndex `
        "Staff schema index pattern found in current repo" `
        "Review staff schema indexes - repo uses role/status or category/isAvailable rather than prompt-named role/isActive"
}

# Check Payment schema
$paymentModel = FirstExistingPath @(
    "server/models/ClientPayment.js",
    "server/models/Payment.js",
    "models/Payment.js"
)
if ($null -ne $paymentModel) {
    $paymentHasIndex = GrepFileRegex $paymentModel "bookingId\s*:\s*1\s*,\s*status\s*:\s*1|status\s*:\s*1\s*,\s*bookingId\s*:\s*1"
    CheckWarn $paymentHasIndex `
        "Compound index { bookingId, status } defined in Payment schema" `
        "Consider adding compound index { bookingId: 1, status: 1 } to Payment schema"

    $idempotencyIndex = GrepFileRegex $paymentModel "idempotencyKey.*unique|unique.*idempotencyKey"
    Check $idempotencyIndex `
        "Unique index on idempotencyKey defined in Payment schema" `
        "Missing unique index on idempotencyKey in Payment schema"
}

# =============================================================================
Head "[ 4.3 ] Analytics In-Memory Aggregation Replaced with Pipelines"
# =============================================================================

# Check for MongoDB aggregation pipeline usage in analytics
$analyticsFile = FirstExistingPath @(
    "server/routes/adminRoutes.js",
    "server/controllers/adminCommandCenterController.js"
)

$hasPipeline = $false
if ($null -ne $analyticsFile) {
    $hasPipeline = GrepFileRegex $analyticsFile "\.aggregate\s*\(\s*\["
}
Check $hasPipeline `
    "MongoDB aggregation pipeline (.aggregate([...]) found in codebase" `
    "No aggregation pipelines found - analytics may still be using in-memory reduce"

# Check that in-memory pattern (reduce on full find) is reduced
$inMemoryPattern = GrepDirRegex $ProjectRoot "\.find\(.*\)[\s\S]{0,200}\.reduce\("
CheckWarn (-not $inMemoryPattern) `
    "No .find().reduce() in-memory aggregation pattern found in modules/" `
    "Possible in-memory aggregation still present in codebase - review analytics handler"

# Check analytics module or route exists
$analyticsFiles = @()
if ($null -ne $analyticsFile) { $analyticsFiles += $analyticsFile }
CheckWarn ($analyticsFiles.Count -gt 0) `
    "Analytics route/controller file found: $((($analyticsFiles | ForEach-Object { Split-Path $_ -Leaf }) -join ', '))" `
    "No analytics route/controller file found - verify analytics handler location"

# Check for $group aggregation stage (core pipeline indicator)
$hasGroupStage = GrepDirRegex $ProjectRoot '\$group'
Check $hasGroupStage `
    "MongoDB \$group aggregation stage found — revenue/count pipelines likely implemented" `
    "No \$group stage found - aggregation pipelines may not be implemented yet"

$hasMatchStage = GrepDirRegex $ProjectRoot '\$match'
CheckWarn $hasMatchStage `
    "MongoDB \$match stage found in pipelines" `
    "No \$match stage found - pipelines may not be filtering correctly"

# =============================================================================
Head "[ 4.4 ] Redis Caching Utility and Cache Layer"
# =============================================================================

# Check cache utility file exists
$cacheUtil = FirstExistingPath @("server/utils/cache.js")
Check ($null -ne $cacheUtil) `
    "Cache utility file (server/utils/cache.js) exists" `
    "server/utils/cache.js not found - create it with get/set/del/delPattern methods"

if ($null -ne $cacheUtil) {
    $hasCacheGet    = GrepFileRegex $cacheUtil "async function get\s*\(|function get\s*\(" 
    $hasCacheSet    = GrepFileRegex $cacheUtil "async function set\s*\(|function set\s*\(" 
    $hasCacheDel    = GrepFileRegex $cacheUtil "async function del\s*\(|function del\s*\(" 
    $hasCachePattern= GrepFileRegex $cacheUtil "async function delPattern\s*\(|function delPattern\s*\(|invalidatePattern|keys\("

    Check $hasCacheGet  "cache.get()  method defined in cache.js" "cache.get() method missing in cache.js"
    Check $hasCacheSet  "cache.set()  method defined in cache.js" "cache.set() method missing in cache.js"
    Check $hasCacheDel  "cache.del()  method defined in cache.js" "cache.del() method missing in cache.js"
    CheckWarn $hasCachePattern "cache.delPattern() method defined in cache.js" "cache.delPattern() missing — cache invalidation by pattern will not work"
}

# Check cache TTL constants used in handlers
$hasCacheUsage = GrepDirRegex $ProjectRoot "getCache\s*\(|setCache\s*\(|invalidateCache\s*\(|invalidatePattern\s*\("
Check $hasCacheUsage `
    "Cache usage found in route handlers" `
    "No cache usage found in handlers - caching not wired up"

# Check cache keys exist
$hasDashboardCache  = GrepDirRegex $ProjectRoot "cache:dashboard:overview"
$hasGalleryCache    = GrepDirRegex $ProjectRoot "cache:gallery:list"
$hasTestimonialCache = GrepDirRegex $ProjectRoot "cache:testimonials:list"
$hasSettingsCache   = GrepDirRegex $ProjectRoot "cache:settings"

Check $hasDashboardCache    "Dashboard cache key 'cache:dashboard:overview' used"   "Dashboard cache key not found - dashboard caching not implemented"
Check $hasGalleryCache      "Gallery cache key 'cache:gallery:list' used"       "Gallery cache key not found - gallery caching not implemented"
CheckWarn $hasTestimonialCache "Testimonials cache key 'cache:testimonials:list' used" "Testimonials cache key not found"
CheckWarn $hasSettingsCache    "Settings cache key 'cache:settings' used"        "Settings cache key not found"

# =============================================================================
Head "[ 4.5 ] Pagination on All List Endpoints"
# =============================================================================

# Check pagination query parameter parsing
$hasPageParam  = GrepDirRegex $ProjectRoot "req\.query\.page"
$hasLimitParam = GrepDirRegex $ProjectRoot "req\.query\.limit"
$hasSkipLogic  = GrepDirRegex $ProjectRoot "(page\s*-\s*1)\s*\*\s*limit|\.skip\s*\("

Check $hasPageParam  "req.query.page found - page parameter handled"  "No req.query.page found - pagination not implemented"
Check $hasLimitParam "req.query.limit found - limit parameter handled" "No req.query.limit found - pagination not implemented"
Check $hasSkipLogic  ".skip() used in queries - offset pagination implemented" "No .skip() found - list queries may return full datasets"

# Check X-Total-Count header is set
$hasTotalCountHeader = GrepDirRegex $ProjectRoot "X-Total-Count"
Check $hasTotalCountHeader `
    "X-Total-Count response header set in paginated endpoints" `
    "X-Total-Count header missing - frontend cannot show total page counts"

# Check meta wrapper in response
$hasMetaWrapper = GrepDirRegex $ProjectRoot "totalPages|total.*pages"
Check $hasMetaWrapper `
    "totalPages included in pagination meta response" `
    "No totalPages in response - pagination meta incomplete"

# Check max limit guard
$hasMaxLimitGuard = GrepDirRegex $ProjectRoot "Math\.min\s*\(\s*100|limit.*>\s*100"
Check $hasMaxLimitGuard `
    "Maximum limit guard (100) implemented - oversized requests rejected" `
    "No max limit guard found - clients could request limit=9999"

# Check cursor-based pagination for notification-style feeds
$hasCursorPagination = GrepDirRegex $ProjectRoot "lastId|nextCursor|\\\$lt.*_id"
CheckWarn $hasCursorPagination `
    "Cursor-based pagination found (lastId/nextCursor) for feed-style endpoints" `
    "No cursor pagination found - consider adding for notification/activity feeds"

# =============================================================================
Head "[ 4.6 ] Projection Defaults in Repository Functions"
# =============================================================================

# Check for projection objects in repository files
$repoFiles = FindFiles "*.repository.js"

if ($repoFiles.Count -eq 0) {
    Warn "No *.repository.js files found — verify Phase 3 modularization was completed"
    $warns++
} else {
    Info "Found $($repoFiles.Count) repository file(s)"
    
    $repoHasProjection = GrepAnyFileRegex $repoFiles "DEFAULT_LIST_PROJECTION|PAYMENT_LIST_PROJECTION|TRANSACTION_LIST_PROJECTION|\bsyncAttempts\s*:\s*0|\brawCallbackPayload\s*:\s*0|\b__v\s*:\s*0"
    Check $repoHasProjection `
        "Projection constants/objects found in repository files" `
        "No projections found in repository files - queries return full documents"

    $repoExcludesV = GrepAnyFileRegex $repoFiles "__v\s*:\s*0"
    CheckWarn $repoExcludesV `
        "Version key (__v: 0) excluded in repository projections" `
        "Consider excluding __v: 0 from list projections in repositories"

    $staffRepoFile = FirstExistingPath @(
        "modules/staff/staff.repository.js",
        "server/modules/staff/staff.repository.js"
    )
    if ($null -ne $staffRepoFile) {
        $staffRepoProjectionSafe = GrepFileRegex $staffRepoFile "passwordHash\s*:\s*0|resetToken\s*:\s*0|password\s*:\s*0"
        CheckWarn $staffRepoProjectionSafe `
            "Password fields excluded from staff repository list projections" `
            "Verify password/passwordHash fields are excluded from staff list projections"
    } else {
        Info "No staff.repository.js found - skipping staff-password projection check"
    }
}

# =============================================================================
Head "[ 4.x ] Supporting Infrastructure Checks"
# =============================================================================

# Redis/ioredis installed
$packageJson = Join-Path $ProjectRoot "package.json"
if (Test-Path $packageJson) {
    $pkg = Get-Content $packageJson -Raw
    $hasRedis   = $pkg -match '"ioredis"|"redis"'
    $hasBullMQ  = $pkg -match '"bullmq"'

    $queuesConfigPath = FirstExistingPath @("config/queues.js")
    $queuesUsesIoredis = $false
    if ($null -ne $queuesConfigPath) {
        $queuesUsesIoredis = GrepFileRegex $queuesConfigPath "ioredis|new\s+Redis\s*\("
    }
    $redisClientAvailable = $hasRedis -or $queuesUsesIoredis
    
    Check $redisClientAvailable "Redis client available via package.json or config/queues.js" "Redis client not detected in package.json or config/queues.js"
    Check $hasBullMQ "bullmq package in package.json (Phase 2 dependency)"           "BullMQ not found in package.json - Phase 2 may not be complete"
} else {
    Warn "package.json not found at project root"
    $script:warns = $script:warns + 1
}

# Phase 3 sanity — api/v1 prefix
$hasV1Prefix = GrepDirRegex $ProjectRoot "/api/v1"
Check $hasV1Prefix `
    "/api/v1 route prefix present (Phase 3 prerequisite)" `
    "No /api/v1 prefix found - confirm Phase 3 is complete before Phase 4"

# Check modules directory exists (Phase 3)
$modulesDir = Join-Path $ProjectRoot "modules"
if (-not (Test-Path $modulesDir)) {
    $modulesDir = Join-Path $ProjectRoot "server\modules"
}
CheckWarn (Test-Path $modulesDir) `
    "modules/ directory exists (Phase 3 structure)" `
    "modules/ directory not found - Phase 3 modularization may be incomplete"

# =============================================================================
Head "[ SUMMARY ]"
# =============================================================================

$pass = $script:pass
$fail = $script:fail
$warns = $script:warns
$total = $pass + $fail + $warns
Write-Host ""
Write-Host "  Results:" -ForegroundColor White
Write-Host "  Passed  : $pass" -ForegroundColor Green
Write-Host "  Failed  : $fail" -ForegroundColor Red
Write-Host "  Warnings: $warns" -ForegroundColor Yellow
Write-Host "  Total   : $total checks" -ForegroundColor White
Write-Host ""

if ($fail -eq 0 -and $warns -eq 0) {
    Write-Host "  Phase 4 is FULLY IMPLEMENTED - ready to start Phase 5" -ForegroundColor Green
} elseif ($fail -eq 0) {
    Write-Host "  All critical checks PASS - review warnings before Phase 5" -ForegroundColor Green
} elseif ($fail -le 3) {
    Write-Host "  Phase 4 is mostly done - address $fail failing item(s) before deploying" -ForegroundColor Yellow
} else {
    Write-Host "  Phase 4 is NOT complete - $fail critical items still need implementation" -ForegroundColor Red
}

Write-Host ""
Write-Host "  Run this script again after each prompt to track progress." -ForegroundColor Gray
Write-Host "  Full verification requires a running server - use curl smoke" -ForegroundColor Gray
Write-Host "  tests from Prompt 7 to verify runtime behaviour." -ForegroundColor Gray
Write-Host ""
