const {
    generateRegistrationOptions,
    verifyRegistrationResponse,
    generateAuthenticationOptions,
    verifyAuthenticationResponse
} = require('@simplewebauthn/server');

const crypto = require('crypto');
const Admin = require('../models/Admin');
const WebAuthnChallenge = require('../models/WebAuthnChallenge');
const AdminWebAuthnCredential = require('../models/AdminWebAuthnCredential');

const rpName = 'Emerald Pearl Events';
const getRpID = () => process.env.RP_ID || 'localhost';
const getOrigin = () => process.env.RP_ORIGIN || `http://localhost:${process.env.PORT || 3000}`;

/**
 * Normalizes base-64-url string handling for compatibility across environments
 */
const bufferToBase64url = (buffer) => {
    return Buffer.from(buffer).toString('base64url');
};

const base64urlToBuffer = (base64urlString) => {
    return Buffer.from(base64urlString, 'base64url');
};

/**
 * Generate WebAuthn registration options for a specific Admin device.
 */
exports.generateRegistrationOptions = async (adminId) => {
    const admin = await Admin.findById(adminId);
    if (!admin) throw new Error('Admin not found');

    const adminCredentials = await AdminWebAuthnCredential.find({ admin_id: adminId });

    const options = await generateRegistrationOptions({
        rpName,
        rpID: getRpID(),
        userID: adminId.toString(),
        userName: admin.email,
        attestationType: 'none',
        excludeCredentials: adminCredentials.map(cred => ({
            id: base64urlToBuffer(cred.credential_id),
            type: 'public-key',
        })),
        authenticatorSelection: {
            residentKey: 'discouraged',
            userVerification: 'preferred',
        },
    });

    // Clear old registration challenges to prevent pile-up
    await WebAuthnChallenge.deleteMany({ admin_id: adminId, type: 'registration' });

    await WebAuthnChallenge.create({
        admin_id: adminId,
        challenge: options.challenge,
        type: 'registration'
    });

    return options;
};

/**
 * Verify WebAuthn registration response.
 */
exports.verifyRegistration = async (adminId, registrationResponse, deviceName) => {
    const challengeDoc = await WebAuthnChallenge.findOne({ admin_id: adminId, type: 'registration' }).sort({ createdAt: -1 });
    if (!challengeDoc) throw new Error('Registration challenge expired or not found. Please try again.');

    const verification = await verifyRegistrationResponse({
        response: registrationResponse,
        expectedChallenge: challengeDoc.challenge,
        expectedOrigin: getOrigin(),
        expectedRPID: getRpID(),
    });

    await WebAuthnChallenge.deleteOne({ _id: challengeDoc._id });

    if (verification.verified && verification.registrationInfo) {
        const { credentialID, credentialPublicKey, counter } = verification.registrationInfo;

        await AdminWebAuthnCredential.create({
            admin_id: adminId,
            credential_id: bufferToBase64url(credentialID),
            public_key: bufferToBase64url(credentialPublicKey),
            counter,
            device_name: deviceName || 'Unknown Device',
            registered_at: new Date(),
            last_used: new Date()
        });

        return { success: true };
    }

    return { success: false, message: 'Cryptographic verification failed' };
};

/**
 * Generate authentication challenge options.
 */
exports.generateAuthenticationOptions = async (adminId) => {
    const credentials = await AdminWebAuthnCredential.find({ admin_id: adminId });
    if (!credentials || credentials.length === 0) {
        throw new Error('No registered biometric devices found for this admin');
    }

    const options = await generateAuthenticationOptions({
        rpID: getRpID(),
        allowCredentials: credentials.map(c => ({
            id: base64urlToBuffer(c.credential_id),
            type: 'public-key',
        })),
        userVerification: 'preferred', // prefer biometric confirmation
    });

    // Clear old auth challenges
    await WebAuthnChallenge.deleteMany({ admin_id: adminId, type: 'authentication' });

    await WebAuthnChallenge.create({
        admin_id: adminId,
        challenge: options.challenge,
        type: 'authentication'
    });

    return options;
};

/**
 * Verify the authentication response against the stored credential.
 */
exports.verifyAuthentication = async (adminId, authenticationResponse) => {
    const challengeDoc = await WebAuthnChallenge.findOne({ admin_id: adminId, type: 'authentication' }).sort({ createdAt: -1 });
    if (!challengeDoc) {
        throw new Error('Authentication challenge expired or not found. Please request a new one.');
    }

    const credential = await AdminWebAuthnCredential.findOne({
        admin_id: adminId,
        credential_id: authenticationResponse.id // Typically base64url encoded mapped by the browser
    });

    if (!credential) {
        throw new Error('Authenticator device not recognized or not registered to this profile.');
    }

    const verification = await verifyAuthenticationResponse({
        response: authenticationResponse,
        expectedChallenge: challengeDoc.challenge,
        expectedOrigin: getOrigin(),
        expectedRPID: getRpID(),
        authenticator: {
            credentialID: base64urlToBuffer(credential.credential_id),
            credentialPublicKey: base64urlToBuffer(credential.public_key),
            counter: credential.counter,
        },
    });

    await WebAuthnChallenge.deleteOne({ _id: challengeDoc._id });

    if (verification.verified && verification.authenticationInfo) {
        const { newCounter } = verification.authenticationInfo;

        // Verify that counter grew indicating a valid sequenced sign to prevent replay attack
        if (newCounter === credential.counter && newCounter !== 0) {
            // Some authenticators stay at 0 statically, but if it's identical mapping and not zero, possible replay.
            // SimpleWebAuthn throws directly on replay errors though!
        }

        credential.counter = newCounter;
        credential.last_used = new Date();
        await credential.save();

        return { success: true };
    }

    return { success: false, message: 'Invalid biometric authentication payload' };
};
