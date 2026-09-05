import type { Meta, StoryObj } from '@storybook/react-vite';
import { MenuEntries } from '../components/Menu/Menu';
import type { MenuEntry } from '../components/Menu/Menu';

/** Plain action entries — no separator, label, or checkable state. */
const actionItems: MenuEntry[] = [
  { label: 'Rename', icon: 'pencil' },
  { label: 'Duplicate', icon: 'plus' },
  { label: 'Delete', icon: 'trash-2', destructive: true },
];

const meta = {
  title: 'Components/MenuEntries',
  component: MenuEntries,
  parameters: { layout: 'padded' },
  args: {
    items: actionItems,
    onSelect: (entry) => console.log(`MenuEntries selected: ${entry.label}`),
  },
} satisfies Meta<typeof MenuEntries>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The `<ul role="menu">` item list itself, factored out of `Menu` so other
 * adaptive-surface components (`ContextMenu`, `Menubar`) can render the exact
 * same items/destructive/checked/icon markup inside their own positioning
 * shell (a floating `Popover` panel, a `Drawer` bottom sheet, or a `Menubar`
 * flyout) instead of re-deriving it and risking drift. Renders with no panel
 * chrome of its own here — the surrounding background, border, and shadow
 * belong to whichever surface hosts it; see `Menu` in this gallery for the
 * composed, positioned result.
 */
export const Default: Story = {};

/**
 * The full entry vocabulary in one list: a `{ type: 'label' }` section
 * heading, a checkable `menuitemradio` group (pass `checked` on every item in
 * the group, including the unchecked ones, so their labels stay aligned with
 * the checked one's reserved checkmark gutter), a `{ type: 'separator' }`
 * divider, and a run of plain/destructive actions — the same composition
 * `Menu`'s own "List actions" demo (Components/Menu) renders.
 */
export const GroupedWithLabelAndSeparator: Story = {
  args: {
    items: [
      { type: 'label', label: 'Sort by' },
      { label: 'Manual', checked: true },
      { label: 'Title', checked: false },
      { label: 'Due date', checked: false },
      { type: 'separator' },
      ...actionItems,
    ],
  },
};

/**
 * A `disabled` item stays in the list but renders `disabled` on its
 * `<button>` — it can't be activated and `onSelect` never fires for it.
 */
export const WithDisabledItem: Story = {
  args: {
    items: [
      { label: 'Rename', icon: 'pencil' },
      { label: 'Duplicate', icon: 'plus', disabled: true },
      { label: 'Delete', icon: 'trash-2', destructive: true },
    ],
  },
};

/**
 * An `href` entry renders as an `<a role="menuitem">` instead of a
 * `<button>` — same href-vs-onClick convention as `MobileAppsDrawer`'s
 * items — for a pure navigation entry that needs no extra `onSelect`.
 */
export const WithLinkItems: Story = {
  args: {
    items: [
      { label: 'View profile', icon: 'user', href: '#profile' },
      { label: 'Settings', icon: 'settings', href: '#settings' },
      { type: 'separator' },
      { label: 'Sign out', icon: 'log-out', destructive: true },
    ],
  },
};
