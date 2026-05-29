const state = {
    vapidDetails: null,
    gcmApiKey: null
};

module.exports = {
    setVapidDetails: (subject, publicKey, privateKey) => {
        state.vapidDetails = { subject, publicKey, privateKey };
    },

    setGCMAPIKey: (apiKey) => {
        state.gcmApiKey = apiKey;
    },

    generateVAPIDKeys: () => ({
        publicKey: 'BMockPublicKeyForTestsOnly0123456789abcdefghijklmnopqrstuvwxyzABCDE',
        privateKey: 'mockPrivateKeyForTestsOnly0123456789abcdefghijklmnopqrstuvwxyzABCDE'
    }),

    sendNotification: async () => ({
        statusCode: 201,
        body: '',
        headers: {}
    }),

    // Exposed for assertions if needed in tests
    __getState: () => state
};
