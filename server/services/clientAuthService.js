const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const ClientAccount = require('../models/ClientAccount');
const ClientSession = require('../models/ClientSession');
const ClientAuditLog = require('../models/ClientAuditLog');
const ClientEmailLog = require('../models/ClientEmailLog');
const Customer = require('../models/Customer');
const clientNotificationService = require('./clientNotificationService');

const logAudit = async (clientId, eventType, reqData, metadata = {}) => {
    try {
        await ClientAuditLog.create({
            client_id: clientId,
            event_type: eventType,
            ip_address: reqData.ip_address,
            user_agent: reqData.user_agent,
            device_name: reqData.device_name || (reqData.user_agent ? reqData.user_agent.substring(0, 50) : 'Unknown'),
            metadata
        });
    } catch (e) {
        console.error('Audit Log Error:', e.message);
    }
};

const validatePasswordRules = (password) => {
    if (password.length < 8) return "Password must be at least 8 characters long";
    if (!/[A-Z]/.test(password)) return "Password must contain at least one uppercase letter";
    if (!/[0-9]/.test(password)) return "Password must contain at least one number";
    if (!/[!@#$%^&*]/.test(password)) return "Password must contain at least one special character from !@#$%^&*";
    return null;
};

exports.registerClient = async (clientId, email, password) => {
    const errorMsg = validatePasswordRules(password);
    if (errorMsg) throw new Error(errorMsg);

    const existing = await ClientAccount.findOne({ $or: [{ client_id: clientId }, { email: email.toLowerCase() }] });
    if (existing) throw new Error("Client account already exists for this ID or Email");

    const salt = await bcrypt.genSalt(12);
    const password_hash = await bcrypt.hash(password, salt);

    const newAccount = await ClientAccount.create({
        client_id: clientId,
        email: email.toLowerCase(),
        password_hash
    });

    await logAudit(clientId, 'password_change', { ip_address: 'System', user_agent: 'System' }, { note: 'Initial Registration' });
    
    // Return created account without password
    const accountObj = newAccount.toObject();
    delete accountObj.password_hash;
    return accountObj;
};

exports.registerNewClient = async (name, email, phone, password, ipAddress, userAgent) => {
    const errorMsg = validatePasswordRules(password);
    if (errorMsg) throw new Error(errorMsg);

    // Check if account already exists
    const existingAccount = await ClientAccount.findOne({ email: email.toLowerCase() });
    if (existingAccount) throw new Error("An account already exists with this email.");

    // Find or create Customer
    let customer = await Customer.findOne({ email: email.toLowerCase() });
    if (!customer) {
        customer = await Customer.create({
            name,
            email: email.toLowerCase(),
            phone,
            status: 'active'
        });
    }

    const salt = await bcrypt.genSalt(12);
    const password_hash = await bcrypt.hash(password, salt);

    const newAccount = await ClientAccount.create({
        client_id: customer._id,
        email: email.toLowerCase(),
        password_hash,
        provider: 'local'
    });

    await logAudit(customer._id, 'registration_success', { ip_address: ipAddress, user_agent: userAgent });
    
    return {
        _id: newAccount._id,
        email: newAccount.email,
        name: customer.name
    };
};

exports.findOrCreateGoogleClient = async (profile, ipAddress, userAgent) => {
    const email = profile.emails[0].value.toLowerCase();
    const googleId = profile.id;
    const name = profile.displayName;

    let account = await ClientAccount.findOne({ $or: [{ googleId }, { email }] });

    if (!account) {
        // Find or create Customer
        let customer = await Customer.findOne({ email });
        if (!customer) {
            customer = await Customer.create({
                name,
                email,
                phone: 'Not Provided', // Will need to update later
                status: 'active'
            });
        }

        account = await ClientAccount.create({
            client_id: customer._id,
            email,
            googleId,
            provider: 'google',
            portal_access_enabled: true
        });
        await logAudit(customer._id, 'registration_google', { ip_address: ipAddress, user_agent: userAgent });
    } else if (!account.googleId) {
        // Link existing local account to google
        account.googleId = googleId;
        account.provider = 'google';
        await account.save();
        await logAudit(account.client_id, 'link_google', { ip_address: ipAddress, user_agent: userAgent });
    }

    // Success - generate session tokens
    return await this.generateDeviceSession(account, ipAddress, userAgent);
};

exports.generateDeviceSession = async (account, ipAddress, userAgent) => {
    account.login_attempts = 0;
    account.locked_until = null;
    account.last_login = new Date();
    account.last_active = new Date();
    await account.save();

    const accessToken = jwt.sign(
        { client_id: account.client_id, email: account.email },
        process.env.CLIENT_JWT_SECRET,
        { expiresIn: process.env.CLIENT_JWT_EXPIRY || '15m' }
    );

    const rawRefreshToken = crypto.randomBytes(64).toString('hex');
    const refreshSalt = await bcrypt.genSalt(10);
    const refresh_token_hash = await bcrypt.hash(rawRefreshToken, refreshSalt);

    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 30);

    await ClientSession.create({
        client_id: account.client_id,
        refresh_token_hash,
        ip_address: ipAddress,
        user_agent: userAgent,
        device_name: userAgent ? userAgent.split(' ')[0] : 'Unknown Device',
        expires_at: expiryDate
    });

    return {
        accessToken,
        refreshToken: rawRefreshToken
    };
};

exports.loginClient = async (email, password, ipAddress, userAgent) => {
    const account = await ClientAccount.findOne({ email: email.toLowerCase() });
    if (!account) throw new Error('Invalid credentials');

    if (!account.portal_access_enabled) {
        throw new Error('403:Portal access disabled by administrator');
    }

    if (account.locked_until && account.locked_until > new Date()) {
        const mins = Math.ceil((account.locked_until - new Date()) / 60000);
        throw new Error(`423:Account locked. Please try again in ${mins} minutes`);
    }

    const isMatch = await bcrypt.compare(password, account.password_hash);
    
    if (!isMatch) {
        account.login_attempts += 1;
        await logAudit(account.client_id, 'login_failure', { ip_address: ipAddress, user_agent: userAgent });
        if (account.login_attempts >= 5) {
            account.locked_until = new Date(Date.now() + 30 * 60000); // 30 mins
            await clientNotificationService.sendLockoutNotification(account);
        }
        await account.save();
        throw new Error('Invalid credentials');
    }

    await logAudit(account.client_id, 'login_success', { ip_address: ipAddress, user_agent: userAgent });

    return await this.generateDeviceSession(account, ipAddress, userAgent);
};

exports.refreshToken = async (rawRefreshToken, ipAddress, userAgent) => {
    // Find all active sessions across all clients
    const activeSessions = await ClientSession.find({ is_active: true });
    
    let validSession = null;
    for (const session of activeSessions) {
        if (await bcrypt.compare(rawRefreshToken, session.refresh_token_hash)) {
            validSession = session;
            break;
        }
    }

    if (!validSession) throw new Error('401:Invalid or expired refresh token');

    if (validSession.expires_at < new Date()) {
        validSession.is_active = false;
        await validSession.save();
        throw new Error('401:Refresh token expired');
    }

    const account = await ClientAccount.findOne({ client_id: validSession.client_id });
    if (!account || !account.portal_access_enabled) {
        throw new Error('401:Account disabled');
    }

    // Update last_active on Session and Account
    validSession.last_active = new Date();
    await validSession.save();
    
    account.last_active = new Date();
    await account.save();

    const newAccessToken = jwt.sign(
        { client_id: account.client_id, email: account.email },
        process.env.CLIENT_JWT_SECRET,
        { expiresIn: process.env.CLIENT_JWT_EXPIRY || '15m' }
    );

    return newAccessToken;
};

exports.logoutClient = async (clientId, sessionId) => {
    const session = await ClientSession.findOneAndUpdate(
        { _id: sessionId, client_id: clientId },
        { is_active: false },
        { new: true }
    );
    await logAudit(clientId, 'logout', { ip_address: 'System', user_agent: 'System' });
    return !!session;
};

exports.logoutAllDevices = async (clientId) => {
    const result = await ClientSession.updateMany(
        { client_id: clientId, is_active: true },
        { is_active: false }
    );
    await logAudit(clientId, 'session_revoked', { ip_address: 'System', user_agent: 'System' });
    return result.modifiedCount;
};

exports.requestPasswordReset = async (email, ipAddress) => {
    const account = await ClientAccount.findOne({ email: email.toLowerCase() });
    if (!account) return true; // Fail silently to prevent email enumeration

    const token = crypto.randomBytes(32).toString('hex');
    const salt = await bcrypt.genSalt(10);
    account.reset_token = await bcrypt.hash(token, salt);
    account.reset_token_expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hr
    await account.save();

    await logAudit(account.client_id, 'password_reset_request', { ip_address: ipAddress, user_agent: 'System' });
    await clientNotificationService.sendPasswordResetEmail(account, token);
    return true;
};

exports.resetPassword = async (token, newPassword) => {
    const errorMsg = validatePasswordRules(newPassword);
    if (errorMsg) throw new Error(errorMsg);

    // Find accounts with valid future expiry
    const accounts = await ClientAccount.find({ reset_token_expiry: { $gt: new Date() } });
    
    let targetAccount = null;
    for (const acc of accounts) {
        if (acc.reset_token && await bcrypt.compare(token, acc.reset_token)) {
            targetAccount = acc;
            break;
        }
    }

    if (!targetAccount) throw new Error('Invalid or expired password reset token');

    const salt = await bcrypt.genSalt(12);
    targetAccount.password_hash = await bcrypt.hash(newPassword, salt);
    targetAccount.reset_token = null;
    targetAccount.reset_token_expiry = null;
    await targetAccount.save();

    // Invalidate sessions
    await ClientSession.updateMany({ client_id: targetAccount.client_id }, { is_active: false });

    await logAudit(targetAccount.client_id, 'password_reset_complete', { ip_address: 'System', user_agent: 'System' });
    await clientNotificationService.sendPasswordChangedConfirmation(targetAccount);
    return true;
};

exports.verifyClientToken = (token) => {
    try {
        const decoded = jwt.verify(token, process.env.CLIENT_JWT_SECRET);
        return decoded;
    } catch (e) {
        throw new Error('401:Invalid or expired access token');
    }
};

exports.disablePortalAccess = async (clientId, adminId) => {
    const account = await ClientAccount.findOneAndUpdate(
        { client_id: clientId },
        { portal_access_enabled: false },
        { new: true }
    );
    if (!account) throw new Error('Client account not found');
    await ClientSession.updateMany({ client_id: clientId }, { is_active: false });
    await logAudit(clientId, 'access_disabled', { ip_address: 'System', user_agent: 'Admin' }, { adminId });
    return true;
};
