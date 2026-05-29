module.exports = {
    env: {
        node: true,
        es2021: true
    },
    extends: 'eslint:recommended',
    parserOptions: {
        ecmaVersion: 2021,
        sourceType: 'module'
    },
    rules: {
        'no-console': ['warn', { allow: ['warn', 'error'] }],
        'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
        'no-var': 'error',
        'prefer-const': 'warn',
        'eqeqeq': ['warn', 'always'],
        'curly': 'warn',
        'semi': ['error', 'always'],
        'quotes': ['error', 'single', { avoidEscape: true }],
        'indent': ['error', 4],
        'comma-dangle': ['error', 'never'],
        'no-trailing-spaces': 'error',
        'object-shorthand': 'warn',
        'prefer-arrow-callback': 'warn',
        'arrow-spacing': 'error',
        'space-before-function-paren': ['error', {
            anonymous: 'always',
            named: 'never',
            asyncArrow: 'always'
        }],
        'no-multiple-empty-lines': ['error', { max: 1 }],
        'space-infix-ops': 'error',
        'no-multi-spaces': 'error'
    }
};
