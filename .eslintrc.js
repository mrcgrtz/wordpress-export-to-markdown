/** @type {import('eslint').Linter.Config} */
module.exports = {
	extends: [
		'eslint:recommended',
	],
	parserOptions: {
		ecmaVersion: 'latest',
	},
	env: {
		node: true,
		es2022: true,
	},
	globals: {
		Atomics: 'readonly',
		SharedArrayBuffer: 'readonly',
	},
};