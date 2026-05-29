/**
 * __mocks__/web-push.js
 *
 * Place this file at: <project-root>/__mocks__/web-push.js
 *
 * Jest automatically uses this mock whenever any module does
 * require('web-push') during tests.
 * This prevents the "Vapid public key should be 65 bytes" crash
 * that happens when notificationService.js or staffController.js
 * calls webpush.setVapidDetails() at require-time.
 */

module.exports = {
    setVapidDetails: jest.fn(),
    sendNotification: jest.fn().mockResolvedValue({ statusCode: 201 }),
    generateVAPIDKeys: jest.fn().mockReturnValue({
        publicKey:  'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U',
        privateKey: 'UUxI4O8-FbRouAevSmBQ6co62groezfL_ZkFlylHfOQ'
    })
};
