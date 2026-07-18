import type { StorybookConfig } from '@storybook/react-webpack5'

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.ts', '../src/**/*.stories.tsx'],
  addons: [
    '@storybook/addon-links',
    '@storybook/addon-essentials',
    '@storybook/addon-interactions',
    '@storybook/addon-a11y',
  ],
  framework: {
    name: '@storybook/react-webpack5',
    options: {},
  },
  docs: {
    autodocs: true,
  },
  typescript: {
    reactDocgen: 'react-docgen-typescript',
  },
}

export default config
