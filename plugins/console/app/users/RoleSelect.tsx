'use client';

import { useState, useTransition } from 'react';
import { Select, useToast } from '@sovereignfs/ui';
import { changeRoleAction } from './actions';

const ROLE_OPTIONS = [
  { value: 'platform:user', label: 'User' },
  { value: 'platform:admin', label: 'Admin' },
] as const;

export function RoleSelect({ userId, role }: { userId: string; role: string }) {
  const [currentRole, setCurrentRole] = useState(role);
  const [isPending, startTransition] = useTransition();
  const toast = useToast();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newRole = e.target.value;
    const prevRole = currentRole;
    setCurrentRole(newRole);

    const formData = new FormData();
    formData.set('userId', userId);
    formData.set('role', newRole);

    startTransition(async () => {
      try {
        await changeRoleAction(formData);
        const label = ROLE_OPTIONS.find((o) => o.value === newRole)?.label ?? newRole;
        toast.show({
          title: 'Role updated',
          message: `Role changed to ${label}.`,
          category: 'success',
        });
      } catch {
        setCurrentRole(prevRole);
        toast.show({ title: 'Failed to update role', category: 'error' });
      }
    });
  }

  return (
    <Select
      size="sm"
      value={currentRole}
      onChange={handleChange}
      disabled={isPending}
      aria-busy={isPending}
    >
      {ROLE_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </Select>
  );
}
