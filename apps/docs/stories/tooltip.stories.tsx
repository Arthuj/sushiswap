// Tooltip.stories.ts|tsx

import type { Meta, StoryObj } from '@storybook/react'
import * as React from 'react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger, Button } from '@sushiswap/ui'

const meta = {
  title: 'Components/Tooltip',
  component: Tooltip,
  argTypes: {
    open: {
      options: [true, false],
      description: 'Use the open prop to manually control state',
      control: { type: 'boolean' },
    },
  },
  parameters: {
    docs: {
      page: null,
    },
    controls: { expanded: true },
  },
} satisfies Meta<typeof Tooltip>

export default meta
type Story = StoryObj<typeof Tooltip>

export const Default = {
  args: {
    children: 'Tooltip',
  },
  render: (args) => {
    return (
      <TooltipProvider>
        <Tooltip {...args}>
          <TooltipTrigger>
            <Button variant="secondary">Hover me</Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Farm rewards available</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  },
} satisfies Story
