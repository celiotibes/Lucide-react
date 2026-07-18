import type { Preview } from '@storybook/react'
import '../src/index.css'

const preview: Preview = {
  parameters: {
    actions: { argTypesRegex: '^on[A-Z].*' },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    docs: {
      toc: true,
    },
    backgrounds: {
      default: 'dark',
      values: [
        {
          name: 'dark',
          value: '#0f1419',
        },
        {
          name: 'light',
          value: '#ffffff',
        },
      ],
    },
  },

  decorators: [
    (Story) => (
      <div style={{ backgroundColor: '#0f1419', minHeight: '100vh', padding: '20px' }}>
        <Story />
      </div>
    ),
  ],
}

export default preview
