import type { Meta, StoryObj } from '@storybook/react-vite';
import { ICONS, type IconName } from './icons';
import { Icon } from './Icon';

const ALL_NAMES = Object.keys(ICONS) as IconName[];

const meta = {
  title: 'Components/Icon',
  component: Icon,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'SVG icon primitive. Icons are either **decorative** (`aria-hidden`) or **meaningful** (`aria-label`). Size is controlled by `--sv-icon-size-*` tokens.',
      },
    },
  },
  argTypes: {
    name: { control: 'select', options: ALL_NAMES },
    size: { control: 'select', options: ['xs', 'sm', 'md', 'lg'] },
  },
} satisfies Meta<typeof Icon>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------

export const Decorative: Story = {
  args: { name: 'house', size: 'md', 'aria-hidden': true },
};

export const Meaningful: Story = {
  args: { name: 'settings', size: 'md', 'aria-label': 'Open settings' },
};

export const SizeExtraSmall: Story = { args: { name: 'bell', size: 'xs', 'aria-hidden': true } };
export const SizeSmall: Story = { args: { name: 'bell', size: 'sm', 'aria-hidden': true } };
export const SizeMedium: Story = { args: { name: 'bell', size: 'md', 'aria-hidden': true } };
export const SizeLarge: Story = { args: { name: 'bell', size: 'lg', 'aria-hidden': true } };

/** Full icon grid — every name across all four sizes. */
export const AllIcons: Story = {
  parameters: { layout: 'padded' },
  args: { name: 'house', 'aria-hidden': true },
  render: (_args) => (
    <div>
      {(['xs', 'sm', 'md', 'lg'] as const).map((sz) => (
        <section key={sz} style={{ marginBottom: 32 }}>
          <h3
            style={{
              fontFamily: 'system-ui',
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--sv-color-text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              marginBottom: 12,
            }}
          >
            Size: {sz}
          </h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
            {ALL_NAMES.map((name) => (
              <div
                key={name}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 4,
                  width: 64,
                }}
              >
                <Icon name={name} size={sz} aria-hidden />
                <span
                  style={{
                    fontFamily: 'monospace',
                    fontSize: 10,
                    color: 'var(--sv-color-text-muted)',
                    textAlign: 'center',
                    wordBreak: 'break-word',
                  }}
                >
                  {name}
                </span>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  ),
};
