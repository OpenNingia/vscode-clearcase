import typescriptEslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import path from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all
});

export default [{
    ignores: ["**/out", "**/dist", "**/*.d.ts"],
}, ...compat.extends("eslint:recommended", "plugin:@typescript-eslint/recommended").map(config => ({
    ...config,
    files: ["**/*.ts"],
})), {
    files: ["**/*.ts"],

    plugins: {
        "@typescript-eslint": typescriptEslint,
    },

    languageOptions: {
        parser: tsParser,
        ecmaVersion: 5,
        sourceType: "script",

        parserOptions: {
            project: ["./tsconfig.json"],
        },
    },

    rules: {
        "@typescript-eslint/naming-convention": ["warn", {
            selector: "default",
            format: ["camelCase"],
            leadingUnderscore: "allow",
            trailingUnderscore: "allow",
        }, {
            selector: "import",
            format: ["camelCase", "PascalCase"],
        }, {
            selector: "variable",
            format: ["camelCase", "UPPER_CASE"],
            leadingUnderscore: "allow",
            trailingUnderscore: "allow",
        }, {
            selector: "typeLike",
            format: ["PascalCase"],
        }, {
            selector: "enumMember",
            format: ["PascalCase"],
        }],

        "@typescript-eslint/ban-tslint-comment": "error",
        "@typescript-eslint/consistent-generic-constructors": "error",
        "@typescript-eslint/explicit-module-boundary-types": "error",
        "@typescript-eslint/no-unsafe-argument": "error",
        "@typescript-eslint/no-unsafe-call": "error",
        "@typescript-eslint/no-unsafe-member-access": "error",
        "@typescript-eslint/prefer-includes": "error",
        "@typescript-eslint/prefer-for-of": "error",
        "@typescript-eslint/prefer-nullish-coalescing": "error",
        "@typescript-eslint/prefer-optional-chain": "error",
        "@typescript-eslint/prefer-string-starts-ends-with": "error",
        "@typescript-eslint/restrict-plus-operands": "error",
        "@typescript-eslint/unbound-method": "error",

        "@typescript-eslint/no-unused-vars": ["error", {
            argsIgnorePattern: "^_",
        }],

        "no-unused-vars": ["error", {
            argsIgnorePattern: "^_",
        }],

        curly: "error",
        eqeqeq: "warn",
        "no-throw-literal": "warn",
        semi: "off",
    },
}];