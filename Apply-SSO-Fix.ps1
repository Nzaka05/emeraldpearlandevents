# ============================================================
#  EMERALD PEARLAND - Phase 0.7 SSO Patch Script
#  Replaces query-string token SSO with POST nonce exchange
# ============================================================

$root          = "C:\My Web Sites\school\live.themewild.com\emerald"
$serverProd    = "$root\server-prod.js"
$staffServer   = "$root\staff-system\server.js"

function PatchFile($label, $filePath, $oldText, $newText) {
    if (-not (Test-Path $filePath)) {
        Write-Host "  [ERROR] File not found: $filePath" -ForegroundColor Red
        return $false
    }
    $content = Get-Content $filePath -Raw -Encoding UTF8
    if (-not $content.Contains($oldText)) {
        Write-Host "  [WARN]  Pattern not found in $label - may already be patched or file changed" -ForegroundColor Yellow
        return $false
    }
    $patched = $content.Replace($oldText, $newText)
    Set-Content $filePath -Value $patched -Encoding UTF8 -NoNewline
    Write-Host "  [DONE]  $label patched successfully" -ForegroundColor Green
    return $true
}

Write-Host ""
Write-Host "  EMERALD PEARLAND - Phase 0.7 SSO Patch" -ForegroundColor White
Write-Host "  Replacing query-string token with POST nonce exchange"
Write-Host ""

# ── Patch 1: server-prod.js ──────────────────────────────────
Write-Host "Patching server-prod.js..." -ForegroundColor Cyan

$oldServerProd = @'
// SSO Bridge — generates short-lived token for Staff Operations access
app.get('/admin/staff-operations-sso', verifyAdminPage, async (req, res) => {
    try {
        const ssoSecret = process.env.SSO_JWT_SECRET || process.env.JWT_SECRET;
        const adminId = req.admin.adminId;
        const email = req.admin.email;

        const Admin = require('./server/models/Admin');
        const adminDoc = await Admin.findById(adminId).select('role').lean();
        const role = adminDoc?.role || 'admin';

        // Admin model uses: super_admin, admin, manager
        if (!['super_admin', 'admin'].includes(role)) {
            return res.status(403).send('Access denied');
        }

        // Map to Staff-style role for token (Staff only has 'Admin')
        const tokenRole = role === 'super_admin' ? 'Super Admin' : 'Admin';

        const ssoToken = jwt.sign(
            { sub: adminId.toString(), email, role: tokenRole, type: 'staff-ops-sso' },
            ssoSecret,
            { expiresIn: '2m' }
        );

        return res.redirect(
            `${STAFF_SYSTEM_BASE_URL}/staff-admin/sso-login?token=${encodeURIComponent(ssoToken)}`
        );
    } catch (err) {
        console.error('SSO generation error:', err.message);
        return res.redirect('/admin/login');
    }
});
'@

$newServerProd = @'
// SSO nonce store — short-lived, single-use, server-side only
const ssoNonceStore = new Map();

// Clean up expired nonces every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [nonce, entry] of ssoNonceStore.entries()) {
        if (now > entry.expiresAt) ssoNonceStore.delete(nonce);
    }
}, 5 * 60 * 1000);

// SSO Bridge — stores token server-side, redirects with nonce only
app.get('/admin/staff-operations-sso', verifyAdminPage, async (req, res) => {
    try {
        const ssoSecret = process.env.SSO_JWT_SECRET || process.env.JWT_SECRET;
        const adminId = req.admin.adminId;
        const email = req.admin.email;

        const Admin = require('./server/models/Admin');
        const adminDoc = await Admin.findById(adminId).select('role').lean();
        const role = adminDoc?.role || 'admin';

        if (!['super_admin', 'admin'].includes(role)) {
            return res.status(403).send('Access denied');
        }

        const tokenRole = role === 'super_admin' ? 'Super Admin' : 'Admin';

        const ssoToken = jwt.sign(
            { sub: adminId.toString(), email, role: tokenRole, type: 'staff-ops-sso' },
            ssoSecret,
            { expiresIn: '2m' }
        );

        // Store token server-side — only nonce goes in the URL
        const nonce = require('crypto').randomBytes(32).toString('hex');
        ssoNonceStore.set(nonce, { token: ssoToken, expiresAt: Date.now() + 60_000 });

        return res.redirect(
            `${STAFF_SYSTEM_BASE_URL}/staff-admin/sso-handoff?nonce=${nonce}`
        );
    } catch (err) {
        console.error('SSO generation error:', err.message);
        return res.redirect('/admin/login');
    }
});

// SSO exchange endpoint — staff system POSTs nonce here to get the real token
app.post('/admin/sso-exchange', express.json(), (req, res) => {
    const { nonce } = req.body;
    if (!nonce) return res.status(400).json({ error: 'Nonce required' });

    const entry = ssoNonceStore.get(nonce);
    if (!entry || Date.now() > entry.expiresAt) {
        ssoNonceStore.delete(nonce);
        return res.status(401).json({ error: 'Invalid or expired nonce' });
    }

    // Single-use — delete immediately after exchange
    ssoNonceStore.delete(nonce);
    return res.json({ token: entry.token });
});
'@

PatchFile "server-prod.js" $serverProd $oldServerProd $newServerProd

# ── Patch 2: staff-system/server.js ─────────────────────────
Write-Host ""
Write-Host "Patching staff-system/server.js..." -ForegroundColor Cyan

$oldStaffServer = @'
// SSO Login — accepts short-lived token from Main Admin (port 3000)
app.get('/staff-admin/sso-login', async (req, res) => {
    const { token } = req.query;
    const ssoSecret = process.env.SSO_JWT_SECRET || process.env.JWT_SECRET;
    const loginRedirect = '/portal/auth/login?error=sso_failed';

    if (!token) return res.redirect(loginRedirect);

    let payload;
    try {
        payload = jwt.verify(token, ssoSecret);
    } catch (err) {
        console.warn('SSO token verification failed:', err.message);
        return res.redirect(loginRedirect);
    }

    if (payload.type !== 'staff-ops-sso' || !payload.email) return res.redirect(loginRedirect);
    if (!['Admin', 'Super Admin'].includes(payload.role)) return res.redirect(loginRedirect);

    try {
        const user = await Staff.findOne({
            email: payload.email,
            role: 'Admin'
        });

        if (!user) {
            console.warn('SSO: no matching admin found for email:', payload.email);
            return res.redirect(loginRedirect);
        }

        const sessionToken = jwt.sign(
            { id: user._id },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRE || '30d' }
        );

        res.cookie('portal_token', sessionToken, {
            expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            httpOnly: true
        });

        await AuditLog.create({
            actionType: 'SSO_LOGIN',
            targetModel: 'Staff',
            targetId: user._id,
            performedBy: user._id,
            details: { source: 'MAIN_ADMIN', email: payload.email, role: payload.role },
            ipAddress: req.ip || req.headers['x-forwarded-for'] || 'unknown',
            timestamp: new Date()
        });

        return res.redirect('/staff-admin/dashboard');
    } catch (err) {
        console.error('SSO login error:', err.message);
        return res.redirect(loginRedirect);
    }
});
'@

$newStaffServer = @'
// SSO Handoff — receives nonce from Main Admin, POSTs back to exchange for real token
app.get('/staff-admin/sso-handoff', async (req, res) => {
    const { nonce } = req.query;
    const loginRedirect = '/portal/auth/login?error=sso_failed';

    if (!nonce) return res.redirect(loginRedirect);

    let token;
    try {
        const fetch = require('node-fetch');
        const exchangeRes = await fetch(
            `${process.env.ADMIN_SERVER_URL}/admin/sso-exchange`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nonce })
            }
        );
        if (!exchangeRes.ok) {
            console.warn('SSO exchange failed: status', exchangeRes.status);
            return res.redirect(loginRedirect);
        }
        const data = await exchangeRes.json();
        token = data.token;
    } catch (err) {
        console.error('SSO exchange request error:', err.message);
        return res.redirect(loginRedirect);
    }

    const ssoSecret = process.env.SSO_JWT_SECRET || process.env.JWT_SECRET;
    let payload;
    try {
        payload = jwt.verify(token, ssoSecret);
    } catch (err) {
        console.warn('SSO token verification failed:', err.message);
        return res.redirect(loginRedirect);
    }

    if (payload.type !== 'staff-ops-sso' || !payload.email) return res.redirect(loginRedirect);
    if (!['Admin', 'Super Admin'].includes(payload.role)) return res.redirect(loginRedirect);

    try {
        const user = await Staff.findOne({ email: payload.email, role: 'Admin' });

        if (!user) {
            console.warn('SSO: no matching admin found for email:', payload.email);
            return res.redirect(loginRedirect);
        }

        const sessionToken = jwt.sign(
            { id: user._id },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRE || '30d' }
        );

        res.cookie('portal_token', sessionToken, {
            expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            httpOnly: true
        });

        await AuditLog.create({
            actionType: 'SSO_LOGIN',
            targetModel: 'Staff',
            targetId: user._id,
            performedBy: user._id,
            details: { source: 'MAIN_ADMIN', email: payload.email, role: payload.role },
            ipAddress: req.ip || req.headers['x-forwarded-for'] || 'unknown',
            timestamp: new Date()
        });

        return res.redirect('/staff-admin/dashboard');
    } catch (err) {
        console.error('SSO login error:', err.message);
        return res.redirect(loginRedirect);
    }
});
'@

PatchFile "staff-system/server.js" $staffServer $oldStaffServer $newStaffServer

# ── Summary ──────────────────────────────────────────────────
Write-Host ""
Write-Host "------------------------------------------------" -ForegroundColor White
Write-Host "  Next steps:" -ForegroundColor White
Write-Host "  1. Run: git add server-prod.js staff-system/server.js" -ForegroundColor Yellow
Write-Host "  2. Run: git commit -m 'fix(auth): Phase 0.7 - replace SSO query token with POST nonce exchange'" -ForegroundColor Yellow
Write-Host "  3. Run: git push" -ForegroundColor Yellow
Write-Host "  4. In Render > emerald-staff-system > Environment add:" -ForegroundColor Yellow
Write-Host "     ADMIN_SERVER_URL = https://emeraldpearlandevents.onrender.com" -ForegroundColor Yellow
Write-Host "  5. Test SSO by clicking Staff Operations in the admin panel" -ForegroundColor Yellow
Write-Host ""
