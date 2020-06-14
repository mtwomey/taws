module.exports = function (wallaby) {
    return {
        files: [
            'src/**/*.js'
        ],

        tests: [
            'tests/**/*test.js'
        ],

        env: {
            type: 'node'
        },

        testFramework: 'jest'
    };
};
