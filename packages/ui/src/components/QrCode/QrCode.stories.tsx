import type { Meta, StoryObj } from '@storybook/react-vite';
import { QrCode } from './QrCode';

/** A 21×21 pattern with the three finder squares, enough to look like a code; real ones come from an encoder. */
const modules = Array.from({ length: 21 }, (_, y) =>
  Array.from({ length: 21 }, (_, x) => {
    const finder = (cx: number, cy: number) =>
      x >= cx && x < cx + 7 && y >= cy && y < cy + 7
        ? x === cx ||
          x === cx + 6 ||
          y === cy ||
          y === cy + 6 ||
          (x >= cx + 2 && x <= cx + 4 && y >= cy + 2 && y <= cy + 4)
        : undefined;
    return finder(0, 0) ?? finder(14, 0) ?? finder(0, 14) ?? (x * 7 + y * 13) % 5 < 2;
  }),
);

const meta = {
  title: 'Components/QrCode',
  component: QrCode,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          "Draws a QR code from its module matrix as an inline SVG, black on white in every theme (a camera reads contrast, not a theme). The encoding is the caller's: this package carries no encoder.",
      },
    },
  },
  args: { modules, label: 'QR code for your authenticator app' },
} satisfies Meta<typeof QrCode>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
