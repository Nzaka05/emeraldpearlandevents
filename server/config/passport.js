const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const clientAuthService = require('../services/clientAuthService');

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID || 'PLACEHOLDER',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'PLACEHOLDER',
    callbackURL: "/client/auth/google/callback",
    passReqToCallback: true
  },
  async function(req, accessToken, refreshToken, profile, done) {
    try {
        const result = await clientAuthService.findOrCreateGoogleClient(profile, req.ip, req.headers['user-agent']);
        return done(null, result);
    } catch (err) {
        return done(err, null);
    }
  }
));

// We are using JWT-based stateless auth for the actual portal, 
// so we don't strictly need session serialization, but Passport expects it if initialized with sessions.
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

module.exports = passport;
