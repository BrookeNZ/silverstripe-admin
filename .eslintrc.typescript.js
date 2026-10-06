const componentStyle = 'Declare components as `const X = ({ a, b = 1 }: XProps) => ...`, not React.FC';

module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  plugins: ['@typescript-eslint'],
  rules: {
    '@typescript-eslint/no-restricted-types': ['error', {
      types: {
        'React.FC': componentStyle,
        FC: componentStyle,
        'React.FunctionComponent': componentStyle,
        FunctionComponent: componentStyle,
        'React.VFC': componentStyle,
        VFC: componentStyle,
      },
    }],
  },
};
