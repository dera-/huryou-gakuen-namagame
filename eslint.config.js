const globals = require("globals");

module.exports = [
  {
    languageOptions: {
      globals: {
          ...globals.commonjs,
          window: false,
          g: false,
      },
      ecmaVersion: 6,
      sourceType: "module",
    },
    rules: {
      "no-dupe-args": "error",
      "no-dupe-keys": "error",
      "no-duplicate-case": "error",
      "no-inner-declarations": "error",
      "no-irregular-whitespace": ["error", {
          skipStrings: true,
          skipComments: true,
          skipRegExps: true,
          skipTemplates: true
      }],
      "no-undef": "error"
    }
  }
];
