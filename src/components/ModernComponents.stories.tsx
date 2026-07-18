import type { Meta, StoryObj } from '@storybook/react'
import {
  Button,
  Card,
  Input,
  Badge,
  Alert,
  KPICard,
  ProgressBar,
  Modal,
  Tabs,
  StatGroup,
  Timeline,
} from './ModernComponents'

const meta = {
  title: 'Components/ModernComponents',
  component: Button,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
} satisfies Meta

export default meta

// Button Stories
export const ButtonPrimary: StoryObj = {
  render: () => <Button variant="primary">Primary Button</Button>,
}

export const ButtonSecondary: StoryObj = {
  render: () => <Button variant="secondary">Secondary Button</Button>,
}

export const ButtonGhost: StoryObj = {
  render: () => <Button variant="ghost">Ghost Button</Button>,
}

export const ButtonDanger: StoryObj = {
  render: () => <Button variant="danger">Delete</Button>,
}

export const ButtonSizes: StoryObj = {
  render: () => (
    <div className="space-y-4">
      <Button size="sm" variant="primary">
        Small
      </Button>
      <Button size="md" variant="primary">
        Medium
      </Button>
      <Button size="lg" variant="primary">
        Large
      </Button>
    </div>
  ),
}

export const ButtonLoading: StoryObj = {
  render: () => (
    <Button variant="primary" loading>
      Loading...
    </Button>
  ),
}

// Card Stories
export const CardDefault: StoryObj<typeof Card> = {
  render: (args) => (
    <Card {...args} className="max-w-md">
      <h2 className="text-lg font-semibold text-white mb-2">Card Title</h2>
      <p className="text-gray-400">This is the card content with glassmorphism effect.</p>
    </Card>
  ),
  args: {
    className: 'max-w-md',
  },
}

export const CardHoverable: StoryObj<typeof Card> = {
  render: () => (
    <Card hover className="max-w-md">
      <h2 className="text-lg font-semibold text-white mb-2">Hoverable Card</h2>
      <p className="text-gray-400">Hover over this card to see the animation effect.</p>
    </Card>
  ),
}

// Input Stories
export const InputDefault: StoryObj<typeof Input> = {
  render: () => (
    <Input label="Email" placeholder="Enter your email" type="email" />
  ),
}

export const InputWithError: StoryObj<typeof Input> = {
  render: () => (
    <Input
      label="Password"
      placeholder="Enter password"
      type="password"
      error="Password is required"
    />
  ),
}

export const InputWithSuccess: StoryObj<typeof Input> = {
  render: () => (
    <Input
      label="Username"
      placeholder="Enter username"
      success
      value="john_doe"
      onChange={() => {}}
    />
  ),
}

// Badge Stories
export const BadgeDefault: StoryObj<typeof Badge> = {
  render: () => <Badge>Default</Badge>,
}

export const BadgeVariants: StoryObj = {
  render: () => (
    <div className="space-y-2">
      <Badge variant="default">Default</Badge>
      <Badge variant="success">Success</Badge>
      <Badge variant="warning">Warning</Badge>
      <Badge variant="danger">Danger</Badge>
      <Badge variant="info">Info</Badge>
    </div>
  ),
}

// Alert Stories
export const AlertSuccess: StoryObj<typeof Alert> = {
  render: () => (
    <Alert type="success" title="Success">
      Your action was completed successfully.
    </Alert>
  ),
}

export const AlertWarning: StoryObj<typeof Alert> = {
  render: () => (
    <Alert type="warning" title="Warning">
      Please review this information before proceeding.
    </Alert>
  ),
}

export const AlertError: StoryObj<typeof Alert> = {
  render: () => (
    <Alert type="error" title="Error">
      An error occurred. Please try again later.
    </Alert>
  ),
}

// KPI Card Stories
export const KPICardDefault: StoryObj<typeof KPICard> = {
  render: () => (
    <KPICard label="Total Cases" value={24} trend={{ direction: 'up', percent: 12 }} />
  ),
}

export const KPICardNegativeTrend: StoryObj<typeof KPICard> = {
  render: () => (
    <KPICard label="Pending Cases" value={8} trend={{ direction: 'down', percent: 5 }} />
  ),
}

// Progress Bar Stories
export const ProgressBarDefault: StoryObj<typeof ProgressBar> = {
  render: () => <ProgressBar progress={65} label="Progress" />
}

export const ProgressBarSuccess: StoryObj<typeof ProgressBar> = {
  render: () => <ProgressBar progress={100} color="success" />
}

export const ProgressBarWarning: StoryObj<typeof ProgressBar> = {
  render: () => <ProgressBar progress={50} color="warning" />
}

export const ProgressBarDanger: StoryObj<typeof ProgressBar> = {
  render: () => <ProgressBar progress={25} color="danger" />
}

// Tabs Stories
export const TabsDefault: StoryObj<typeof Tabs> = {
  render: () => (
    <Tabs
      tabs={[
        {
          id: '1',
          label: 'Tab 1',
          content: <div>Content for tab 1</div>,
        },
        {
          id: '2',
          label: 'Tab 2',
          content: <div>Content for tab 2</div>,
        },
        {
          id: '3',
          label: 'Tab 3',
          content: <div>Content for tab 3</div>,
        },
      ]}
    />
  ),
}

// Timeline Stories
export const TimelineDefault: StoryObj<typeof Timeline> = {
  render: () => (
    <Timeline
      items={[
        { label: 'Step 1', status: 'completed' },
        { label: 'Step 2', status: 'completed' },
        { label: 'Step 3', status: 'pending' },
        { label: 'Step 4', status: 'pending' },
      ]}
    />
  ),
}

// StatGroup Stories
export const StatGroupDefault: StoryObj<typeof StatGroup> = {
  render: () => (
    <StatGroup
      stats={[
        { label: 'Total', value: '150', change: '+12%' },
        { label: 'Active', value: '42', change: '+5%' },
        { label: 'Completed', value: '108', change: '+23%' },
      ]}
    />
  ),
}
