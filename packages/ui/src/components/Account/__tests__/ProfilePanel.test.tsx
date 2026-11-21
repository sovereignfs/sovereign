// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProfilePanel } from '../ProfilePanel';

afterEach(cleanup);

describe('ProfilePanel', () => {
  it('saves the name through the app, and says why when it was refused', async () => {
    const saveName = vi.fn().mockResolvedValueOnce({ error: 'A name is 1 to 100 characters.' });
    render(
      <ProfilePanel
        name="Ada"
        email="ada@x.test"
        image={null}
        saveName={saveName}
        preparePicture={(file) => Promise.resolve(file)}
        savePicture={vi.fn()}
      />,
    );
    expect(screen.getByText('ada@x.test')).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Name/), { target: { value: '  ' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Save name' }));
    expect(await screen.findByText('A name is 1 to 100 characters.')).toBeTruthy();
    expect(saveName).toHaveBeenCalledWith('  ');
  });

  it('offers removing a picture only when there is one, through the app', async () => {
    const savePicture = vi.fn().mockResolvedValue({ image: null });
    render(
      <ProfilePanel
        name="Ada"
        email="ada@x.test"
        image="/api/avatars/u?v=1"
        saveName={vi.fn()}
        preparePicture={(file) => Promise.resolve(file)}
        savePicture={savePicture}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Remove picture' }));
    await screen.findByRole('button', { name: 'Choose a picture' });
    expect(savePicture).toHaveBeenCalledWith(null);
  });
});
