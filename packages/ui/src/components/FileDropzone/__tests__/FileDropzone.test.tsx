// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { FileDropzone } from '../FileDropzone';

afterEach(cleanup);

describe('FileDropzone', () => {
  it('renders the label and hint', () => {
    render(
      <FileDropzone
        label="Choose a ZIP file"
        hint="or drag and drop here"
        ariaLabel="Upload ZIP file"
        onFileSelect={vi.fn()}
      />,
    );
    expect(screen.getByText('Choose a ZIP file')).toBeDefined();
    expect(screen.getByText('or drag and drop here')).toBeDefined();
  });

  it('exposes an accessible name via aria-label', () => {
    render(
      <FileDropzone label="Choose a file" ariaLabel="Upload font file" onFileSelect={vi.fn()} />,
    );
    expect(screen.getByLabelText('Upload font file')).toBeDefined();
  });

  it('forwards accept to the native file input', () => {
    render(
      <FileDropzone
        label="Choose a file"
        ariaLabel="Upload"
        accept=".zip"
        onFileSelect={vi.fn()}
      />,
    );
    const input = screen.getByLabelText('Upload') as HTMLInputElement;
    expect(input.accept).toBe('.zip');
  });

  it('calls onFileSelect with the picked file', () => {
    const onFileSelect = vi.fn();
    render(<FileDropzone label="Choose a file" ariaLabel="Upload" onFileSelect={onFileSelect} />);
    const input = screen.getByLabelText('Upload') as HTMLInputElement;
    const file = new File(['content'], 'font.woff2');
    fireEvent.change(input, { target: { files: [file] } });
    expect(onFileSelect).toHaveBeenCalledWith(file);
  });

  it('calls onFileSelect with the dropped file', () => {
    const onFileSelect = vi.fn();
    render(<FileDropzone label="Choose a file" ariaLabel="Upload" onFileSelect={onFileSelect} />);
    const dropzone = screen.getByLabelText('Upload').closest('label');
    if (!dropzone) throw new Error('dropzone label not found');
    const file = new File(['content'], 'font.woff2');
    fireEvent.drop(dropzone, { dataTransfer: { files: [file] } });
    expect(onFileSelect).toHaveBeenCalledWith(file);
  });

  it('is disabled when the disabled prop is set', () => {
    render(
      <FileDropzone label="Choose a file" ariaLabel="Upload" disabled onFileSelect={vi.fn()} />,
    );
    expect((screen.getByLabelText('Upload') as HTMLInputElement).disabled).toBe(true);
  });
});
