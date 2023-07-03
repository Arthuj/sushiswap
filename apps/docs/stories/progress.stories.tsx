// Progress.stories.ts|tsx

import type { Meta, StoryObj } from '@storybook/react'
import * as React from 'react'
import { Progress } from '@sushiswap/ui'

const meta = {
  title: 'Components/Progress',
  component: Progress,
  argTypes: {
    value: {
      control: { type: 'number' },
    },
  },
  parameters: {
    docs: {
      page: null,
    },
    controls: { expanded: true },
  },
} satisfies Meta<typeof Progress>

export default meta
type Story = StoryObj<typeof Progress>

export const Default = {
  args: {
    children: 'Progress',
  },
} satisfies Story
