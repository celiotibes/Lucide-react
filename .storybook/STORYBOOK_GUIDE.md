# Storybook Component Documentation Guide

Storybook is an isolated component development environment that helps document and test UI components without running the full application.

## Getting Started

### Starting Storybook

```bash
npm run storybook
```

This launches Storybook at `http://localhost:6006` with hot module reloading.

### Building Storybook

```bash
npm run storybook:build
```

This creates a static build of Storybook in `storybook-static/` directory for deployment.

## Project Structure

```
.storybook/
├── main.ts                 # Storybook configuration
├── preview.ts              # Global configuration and decorators
└── STORYBOOK_GUIDE.md      # This file

src/components/
├── ModernComponents.stories.tsx      # Stories for all modern components
└── BottomNavigation.stories.tsx      # Stories for bottom navigation
```

## Writing Stories

### Basic Story Structure

```typescript
import type { Meta, StoryObj } from '@storybook/react'
import { Button } from './ModernComponents'

const meta = {
  title: 'Components/Button',
  component: Button,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<typeof Button>

export default meta
type Story = StoryObj<typeof meta>

export const Primary: Story = {
  args: {
    variant: 'primary',
    children: 'Click me',
  },
}
```

### Story with Render Function

```typescript
export const WithLoading: Story = {
  render: () => (
    <Button variant="primary" loading>
      Loading...
    </Button>
  ),
}
```

### Story with Arguments

```typescript
export const Secondary: Story = {
  args: {
    variant: 'secondary',
    children: 'Secondary Button',
    size: 'md',
  },
}
```

## Key Features

### Autodocs
Every component with `tags: ['autodocs']` automatically generates documentation including:
- Props table
- Prop descriptions
- Default values
- Examples

### Controls
The Controls panel allows you to:
- Change component props in real-time
- See live updates
- Test different prop combinations
- Export modified props as code

### Canvas
View components in isolation with:
- Source code viewer
- DOM explorer
- Accessibility testing
- Responsive preview

## Component Stories

### ModernComponents
Stories for core UI components:
- **Button**: All variants (primary, secondary, ghost, danger) and sizes
- **Card**: Default and hoverable versions
- **Input**: With various states (default, error, success)
- **Badge**: All variants
- **Alert**: Success, warning, error types
- **KPI Card**: With trend indicators
- **Progress Bar**: With color variants
- **Tabs**: Multi-tab navigation
- **Timeline**: Step-by-step progress
- **StatGroup**: Statistics display

### BottomNavigation
Full-page story showing the fixed bottom navigation in context.

## Best Practices

### 1. Document Props
```typescript
interface ButtonProps {
  /** Button visual style */
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  /** Button size */
  size?: 'sm' | 'md' | 'lg'
  /** Show loading state */
  loading?: boolean
}
```

### 2. Group Related Stories
```typescript
export const ButtonSizes: StoryObj = {
  render: () => (
    <div className="space-y-4">
      <Button size="sm">Small</Button>
      <Button size="md">Medium</Button>
      <Button size="lg">Large</Button>
    </div>
  ),
}
```

### 3. Test Edge Cases
```typescript
export const LongLabel: Story = {
  args: {
    children: 'This is a very long button label that might wrap',
  },
}

export const Empty: Story = {
  args: {
    children: '',
  },
}
```

### 4. Use Decorators for Context
```typescript
export default {
  decorators: [
    (Story) => (
      <div className="bg-slate-900 p-8">
        <Story />
      </div>
    ),
  ],
} satisfies Meta
```

## Deployment

### Static Build
Storybook builds to static HTML/CSS/JS:

```bash
npm run storybook:build
```

This creates:
- `storybook-static/` directory with complete static site
- Deployable to Vercel, Netlify, GitHub Pages, etc.

### Deploy to Vercel
```bash
vercel deploy storybook-static
```

### Deploy to GitHub Pages
```bash
npm run storybook:build
git add storybook-static
git commit -m "docs: update storybook"
git push origin main
```

Then configure GitHub Pages to use `storybook-static/` folder.

## Addons

### Installed Addons

**@storybook/addon-essentials**
- Controls - Interactive prop editing
- Actions - Event logging
- Viewport - Responsive testing
- Toolbars - Theme switching
- Backgrounds - Background colors

**@storybook/addon-a11y**
- Accessibility checks
- WCAG compliance verification
- Color contrast validation
- ARIA attribute checking

**@storybook/addon-interactions**
- User interaction testing
- Event simulation
- State tracking

**@storybook/addon-links**
- Navigation between stories
- Story linking

## Adding Stories for New Components

### Step 1: Create Component
```typescript
export function MyComponent({ title, children }: MyComponentProps) {
  return <div>{title} - {children}</div>
}
```

### Step 2: Create Story File
```typescript
// MyComponent.stories.tsx
import type { Meta, StoryObj } from '@storybook/react'
import { MyComponent } from './MyComponent'

const meta = {
  title: 'Components/MyComponent',
  component: MyComponent,
  tags: ['autodocs'],
} satisfies Meta<typeof MyComponent>

export default meta

export const Default: StoryObj<typeof MyComponent> = {
  args: {
    title: 'My Title',
    children: 'Content here',
  },
}
```

### Step 3: Run Storybook
```bash
npm run storybook
```

Your new component will appear in the sidebar under `Components/MyComponent`.

## Testing in Storybook

### Manual Testing
1. Open story in Canvas
2. Use Controls to modify props
3. Verify UI updates correctly
4. Check Accessibility tab for issues

### Automated Testing
Stories can be used with:
- **Playwright**: Visual regression testing
- **Chromatic**: Visual changes detection
- **Jest**: Snapshot testing

## Troubleshooting

### Stories Not Showing
Check `.storybook/main.ts` stories glob pattern:
```typescript
stories: ['../src/**/*.stories.ts', '../src/**/*.stories.tsx']
```

### Styles Not Loading
Ensure CSS imports in `.storybook/preview.ts`:
```typescript
import '../src/index.css'
```

### Props Not Updating
Verify component exports named export:
```typescript
export function Button(props: ButtonProps) { }
```

## Resources

- [Storybook Official Docs](https://storybook.js.org/docs/react/get-started/introduction)
- [Component Story Format](https://storybook.js.org/docs/react/api/csf)
- [Controls & Args](https://storybook.js.org/docs/react/essentials/controls)
- [Decorators](https://storybook.js.org/docs/react/writing-stories/decorators)

## Workflow Integration

### Development
```bash
npm run storybook       # Start Storybook
npm run dev             # Start app
npm run lint            # Check code quality
```

### Before Committing
```bash
npm run format          # Format code
npm run lint            # Lint
npm run storybook:build # Verify Storybook builds
```

### Continuous Integration
Storybook is built in CI pipeline and:
- Visual regression testing runs on pull requests
- Accessibility checks verify WCAG compliance
- Static site deployed automatically

## Next Steps

1. **Add stories** for all components in `src/components/`
2. **Document screens** with full-page stories
3. **Setup Chromatic** for visual testing
4. **Deploy** to GitHub Pages or Vercel
5. **Link** from README for team access

---

**Happy documenting!** 📚
