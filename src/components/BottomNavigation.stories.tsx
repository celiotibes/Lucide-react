import type { Meta, StoryObj } from '@storybook/react'
import { BrowserRouter } from 'react-router-dom'
import { BottomNavigation } from './BottomNavigation'

const meta = {
  title: 'Components/BottomNavigation',
  component: BottomNavigation,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    (Story) => (
      <BrowserRouter>
        <Story />
      </BrowserRouter>
    ),
  ],
} satisfies Meta<typeof BottomNavigation>

export default meta

export const Default: StoryObj<typeof BottomNavigation> = {
  render: () => (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <h1 className="text-3xl font-bold text-white mb-4">Bottom Navigation Example</h1>
        <p className="text-gray-400 mb-8">
          Scroll down to see the bottom navigation fixed at the bottom of the screen.
        </p>
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className="backdrop-blur-lg bg-slate-900/80 border border-slate-700/50 rounded-2xl p-6 mb-6"
          >
            <h2 className="text-xl font-semibold text-white mb-2">Section {i + 1}</h2>
            <p className="text-gray-400">
              Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor
              incididunt ut labore et dolore magna aliqua.
            </p>
          </div>
        ))}
      </div>
      <BottomNavigation />
    </div>
  ),
}
