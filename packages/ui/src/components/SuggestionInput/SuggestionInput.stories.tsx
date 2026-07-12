import { useMemo, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { SuggestionInput, type SuggestionOption } from './SuggestionInput';

const meta = {
  title: 'Components/SuggestionInput',
  component: SuggestionInput,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'A text field with an anchored, keyboard-navigable list of async suggestions, plus an optional trailing "create new" row so free text is always a valid commit.',
      },
    },
  },
  args: {
    value: '',
    onChange: () => {},
    options: [],
    onSelect: () => {},
    'aria-label': 'Add an item',
  },
} satisfies Meta<typeof SuggestionInput>;

export default meta;
type Story = StoryObj<typeof meta>;

const CATALOG: SuggestionOption[] = [
  { id: '1', label: 'Bananas', icon: '🍌', meta: 'bought 4× recently' },
  { id: '2', label: 'Banana bread mix', icon: '🍞' },
  { id: '3', label: 'Milk', icon: '🥛' },
  { id: '4', label: 'Eggs', icon: '🥚' },
  { id: '5', label: 'Olive oil', icon: '🫒' },
];

function ControlledSuggestionInput({ withCreateRow = true }: { withCreateRow?: boolean }) {
  const [value, setValue] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const options = useMemo(
    () =>
      value.trim()
        ? CATALOG.filter((c) => c.label.toLowerCase().includes(value.trim().toLowerCase()))
        : [],
    [value],
  );

  return (
    <div style={{ width: 320 }}>
      <SuggestionInput
        value={value}
        onChange={setValue}
        options={options}
        onSelect={(option) => {
          setSelected(option.label);
          setValue('');
        }}
        placeholder="Add an item…"
        aria-label="Add an item"
        createLabel={withCreateRow ? (v) => `Add "${v}" as a new item` : undefined}
        onCreate={
          withCreateRow
            ? (v) => {
                setSelected(v);
                setValue('');
              }
            : undefined
        }
      />
      {selected && <p style={{ marginTop: 12, fontSize: 13 }}>Added: {selected}</p>}
    </div>
  );
}

export const Default: Story = {
  render: () => <ControlledSuggestionInput />,
};

export const NoCreateRow: Story = {
  name: 'Without create row (matched options only)',
  render: () => <ControlledSuggestionInput withCreateRow={false} />,
};

export const OpenWithOptions: Story = {
  render: () => (
    <div style={{ width: 320 }}>
      <SuggestionInput
        value="ban"
        onChange={() => {}}
        options={CATALOG.slice(0, 2)}
        onSelect={() => {}}
        aria-label="Add an item"
        createLabel={(v) => `Add "${v}" as a new item`}
        onCreate={() => {}}
      />
    </div>
  ),
};

export const Loading: Story = {
  render: () => (
    <div style={{ width: 320 }}>
      <SuggestionInput
        value="ban"
        onChange={() => {}}
        options={[]}
        onSelect={() => {}}
        loading
        aria-label="Add an item"
      />
    </div>
  ),
};

export const Empty: Story = {
  name: 'Empty (no matches, no create row)',
  render: () => (
    <div style={{ width: 320 }}>
      <SuggestionInput
        value="xyz"
        onChange={() => {}}
        options={[]}
        onSelect={() => {}}
        aria-label="Add an item"
      />
    </div>
  ),
};

export const Disabled: Story = {
  render: () => (
    <div style={{ width: 320 }}>
      <SuggestionInput
        value=""
        onChange={() => {}}
        options={[]}
        onSelect={() => {}}
        disabled
        placeholder="Add an item…"
        aria-label="Add an item"
      />
    </div>
  ),
};
