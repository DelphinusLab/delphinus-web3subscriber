module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    testMatch: ["**/?(*.)+(spec|test).[t]s?(x)"], //only match ts files and do not test the old invalid one
  };