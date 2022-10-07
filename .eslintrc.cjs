/** @type {import('eslint').Linter.Config} */
module.exports = {
	extends: [
		'eslint:recommended',
	],
	parserOptions: {
		sourceType: 'module',
	},
	env: {
		node: true,
		es2022: true,
	},
};