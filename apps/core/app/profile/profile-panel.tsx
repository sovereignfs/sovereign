'use client';

import { ProfilePanel as Panel } from '@sovereignfs/ui';
import { saveName } from '@sovereignfs/auth/client';
import { authClient } from '../../src/auth/client';
import { AvatarPrepareError, browserDeps, prepareAvatar, type PrepareDeps } from './avatar-image';

type Props = {
  name: string;
  email: string;
  /** The address of the person's picture, or null when they have none. */
  image: string | null;
  /** How a picture is prepared; the browser's own unless a test passes another. */
  prepare?: (file: Blob) => Promise<Blob>;
};

const defaultPrepare = (file: Blob) => prepareAvatar(file, browserDeps satisfies PrepareDeps);

/** Keeps a prepared picture, or removes it, through core's own route, which judges it by its bytes (core-app §3.11). */
async function savePicture(
  picture: Blob | null,
): Promise<{ image: string | null } | { error: string }> {
  try {
    const response = await fetch('/api/profile/avatar', {
      method: picture ? 'POST' : 'DELETE',
      ...(picture ? { body: picture } : {}),
    });
    const answer = (await response.json().catch(() => ({}))) as {
      image?: string | null;
      message?: string;
    };
    if (!response.ok)
      return { error: answer.message ?? 'The picture could not be saved. Try again.' };
    return { image: answer.image ?? null };
  } catch {
    return { error: 'The picture could not be saved. Check your connection and try again.' };
  }
}

/**
 * The person's name, their picture, and their email address: the design system's panel, with the name saved by the sign-in package
 * and the picture by core's own route.
 */
export function ProfilePanel({ name, email, image, prepare = defaultPrepare }: Props) {
  return (
    <Panel
      name={name}
      email={email}
      image={image}
      saveName={(value) => saveName(authClient, value)}
      preparePicture={prepare}
      describePictureError={(problem) =>
        problem instanceof AvatarPrepareError
          ? problem.message
          : 'That picture could not be read. Use a PNG, JPEG or WebP picture.'
      }
      savePicture={savePicture}
    />
  );
}
