import type { Meta, StoryObj } from '@storybook/react-vite';
import { Barcode } from './Barcode';

const meta = {
  title: 'Components/Barcode',
  component: Barcode,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'A linear barcode (EAN-13, EAN-8, UPC-A, Code 128, Code 39) as an inline SVG, as QrCode draws a QR code: black on white in every theme, with its quiet zone, scaled to its width. No dependency and no request. A value its kind cannot hold draws nothing and says so.',
      },
    },
  },
  decorators: [(Story) => <div style={{ maxWidth: 360 }}>{Story()}</div>],
  args: { label: 'Loyalty card barcode' },
} satisfies Meta<typeof Barcode>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Ean13: Story = { args: { format: 'ean13', value: '4006381333931' } };
export const Ean8: Story = { args: { format: 'ean8', value: '96385074' } };
export const UpcA: Story = { args: { format: 'upca', value: '036000291452' } };
export const Code128: Story = { args: { format: 'code128', value: 'CARD-0042-7781' } };
export const Code39: Story = { args: { format: 'code39', value: 'LOYALTY 123' } };
export const CannotBeDrawn: Story = { args: { format: 'ean13', value: '4006381333932' } };
