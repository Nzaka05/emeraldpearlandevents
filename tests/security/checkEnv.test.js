describe('scripts/checkEnv', () => {
    it('skips critical env validation in test mode', () => {
        const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});

        jest.isolateModules(() => {
            require('../../scripts/checkEnv');
        });

        expect(exitSpy).not.toHaveBeenCalled();
        expect(logSpy).toHaveBeenCalledWith('[ENV_CHECK] Skipping environment variable audit in test mode.');

        logSpy.mockRestore();
        exitSpy.mockRestore();
    });
});
