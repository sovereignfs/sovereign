import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { FileDropzone } from '../components/FileDropzone/FileDropzone';
import { Icon } from '../components/Icon/Icon';

const meta: Meta<typeof FileDropzone> = {
  title: 'Components/FileDropzone',
  component: FileDropzone,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof FileDropzone>;

export const Default: Story = {
  render: () => {
    function Demo() {
      const [file, setFile] = useState<File | null>(null);
      return (
        <div style={{ maxWidth: '420px' }}>
          <FileDropzone
            ariaLabel="Upload ZIP file"
            accept=".zip,application/zip"
            label={file ? file.name : 'Choose a ZIP file'}
            hint={file ? `${(file.size / 1024).toFixed(0)} KB` : 'or drag and drop here'}
            onFileSelect={setFile}
          />
        </div>
      );
    }
    return <Demo />;
  },
};

export const CustomIcon: Story = {
  render: () => {
    function Demo() {
      const [file, setFile] = useState<File | null>(null);
      return (
        <div style={{ maxWidth: '420px' }}>
          <FileDropzone
            ariaLabel="Upload font file"
            accept=".woff2,.woff,.ttf,.otf"
            icon={<Icon name="upload" size="lg" aria-hidden />}
            label={file ? file.name : 'Choose a font file'}
            hint={file ? undefined : '.woff2, .woff, .ttf, or .otf'}
            onFileSelect={setFile}
          />
        </div>
      );
    }
    return <Demo />;
  },
};

export const Disabled: Story = {
  render: () => (
    <div style={{ maxWidth: '420px' }}>
      <FileDropzone
        ariaLabel="Upload ZIP file"
        label="Choose a ZIP file"
        hint="or drag and drop here"
        disabled
        onFileSelect={() => {}}
      />
    </div>
  ),
};
