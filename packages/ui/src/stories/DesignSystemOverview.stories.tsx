import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { Avatar } from '../components/Avatar/Avatar';
import { Badge } from '../components/Badge/Badge';
import { Button } from '../components/Button/Button';
import { Card } from '../components/Card/Card';
import { Dialog } from '../components/Dialog/Dialog';
import { Drawer } from '../components/Drawer/Drawer';
import { EmptyState } from '../components/EmptyState/EmptyState';
import { FormField } from '../components/FormField/FormField';
import { Icon } from '../components/Icon/Icon';
import type { IconName } from '../components/Icon/Icon';
import { IconPicker } from '../components/IconPicker/IconPicker';
import { QuantityStepper } from '../components/QuantityStepper/QuantityStepper';
import { CheckableListRow } from '../components/CheckableListRow/CheckableListRow';
import { Input } from '../components/Input/Input';
import { CodeTextarea } from '../components/CodeTextarea/CodeTextarea';
import { Textarea } from '../components/Textarea/Textarea';
import { StatusBadge } from '../components/StatusBadge/StatusBadge';
import { SplitPane } from '../components/SplitPane/SplitPane';
import { TagInput } from '../components/TagInput/TagInput';
import { SuggestionInput } from '../components/SuggestionInput/SuggestionInput';
import { NavTabs } from '../components/NavTabs/NavTabs';
import { PageHeader } from '../components/PageHeader/PageHeader';
import { PageContainer } from '../components/PageContainer/PageContainer';
import { Popover } from '../components/Popover/Popover';
import { ResponsiveSurface } from '../components/ResponsiveSurface/ResponsiveSurface';
import { SwipableMobileCarousel } from '../components/SwipableMobileCarousel/SwipableMobileCarousel';
import { SwipableMobileCarouselSlide } from '../components/SwipableMobileCarousel/SwipableMobileCarouselSlide';
import { SwipableMobileCarouselSlideHeader } from '../components/SwipableMobileCarousel/SwipableMobileCarouselSlideHeader';
import { SwipableMobileCarouselSlideBody } from '../components/SwipableMobileCarousel/SwipableMobileCarouselSlideBody';
import { SwipableMobileCarouselDots } from '../components/SwipableMobileCarouselDots/SwipableMobileCarouselDots';
import { SegmentedControl } from '../components/SegmentedControl/SegmentedControl';
import { Select } from '../components/Select/Select';
import { Spinner } from '../components/Spinner/Spinner';
import { SystemBanner } from '../components/SystemBanner/SystemBanner';
import { Tabs } from '../components/Tabs/Tabs';
import { ToastProvider, useToast } from '../components/Toast/Toast';
import { Toggle } from '../components/Toggle/Toggle';
import { Tooltip } from '../components/Tooltip/Tooltip';
import { Checkbox } from '../components/Checkbox/Checkbox';
import { RadioGroup } from '../components/RadioGroup/RadioGroup';
import { Slider } from '../components/Slider/Slider';
import { Progress } from '../components/Progress/Progress';
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeaderCell,
  TableCell,
} from '../components/Table/Table';
import { Alert } from '../components/Alert/Alert';
import { Breadcrumb } from '../components/Breadcrumb/Breadcrumb';
import { Pagination } from '../components/Pagination/Pagination';
import { Kbd } from '../components/Kbd/Kbd';
import { Accordion } from '../components/Accordion/Accordion';
import { AspectRatio } from '../components/AspectRatio/AspectRatio';
import { ButtonGroup } from '../components/ButtonGroup/ButtonGroup';
import { Item } from '../components/Item/Item';
import { Label } from '../components/Label/Label';
import { ScrollArea } from '../components/ScrollArea/ScrollArea';
import { Typography } from '../components/Typography/Typography';
import { Marker } from '../components/Marker/Marker';
import { Message } from '../components/Message/Message';
import { MessageScroller } from '../components/MessageScroller/MessageScroller';
import { HoverCard } from '../components/HoverCard/HoverCard';
import { ContextMenu } from '../components/ContextMenu/ContextMenu';
import { Command } from '../components/Command/Command';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '../components/Resizable/Resizable';
import { DataTable } from '../components/DataTable/DataTable';
import { Combobox } from '../components/Combobox/Combobox';
import { NavigationMenu } from '../components/NavigationMenu/NavigationMenu';
import { Menubar } from '../components/Menubar/Menubar';
import { Collapsible } from '../components/Collapsible/Collapsible';
import { DragHandleRow } from '../components/DragHandleRow/DragHandleRow';
import { FileDropzone } from '../components/FileDropzone/FileDropzone';
import { OverlayHeader } from '../components/OverlayHeader/OverlayHeader';
import { Sheet } from '../components/Sheet/Sheet';
import { ConfirmDialog } from '../components/ConfirmDialog/ConfirmDialog';
import { Menu } from '../components/Menu/Menu';
import { Calendar } from '../components/Calendar/Calendar';
import { DatePicker } from '../components/DatePicker/DatePicker';
import { CurrencyInput } from '../components/CurrencyInput/CurrencyInput';
import { BalanceChip } from '../components/BalanceChip/BalanceChip';
import {
  SplitMethodSelector,
  type SplitMethod,
} from '../components/SplitMethodSelector/SplitMethodSelector';
import {
  MemberMultiSelect,
  type MemberMultiSelectOption,
} from '../components/MemberMultiSelect/MemberMultiSelect';

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

const ff = 'var(--sv-font-family)';
const ffm = 'var(--sv-font-family-mono)';

function Heading({ level = 2, children }: { level?: 1 | 2 | 3; children: React.ReactNode }) {
  const sizes: Record<number, string> = { 1: '2rem', 2: '1.25rem', 3: '1rem' };
  const weights: Record<number, number> = { 1: 700, 2: 600, 3: 600 };
  const Tag = `h${level}` as 'h1' | 'h2' | 'h3';
  return (
    <Tag
      style={{
        fontFamily: ff,
        fontSize: sizes[level],
        fontWeight: weights[level],
        color: 'var(--sv-color-text-primary)',
        margin: 0,
        lineHeight: 1.2,
      }}
    >
      {children}
    </Tag>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div
      style={{
        paddingBottom: 'var(--sv-space-3)',
        borderBottom: '2px solid var(--sv-color-accent)',
        marginBottom: 'var(--sv-space-5)',
      }}
    >
      <Heading level={2}>{title}</Heading>
      {subtitle && (
        <p
          style={{
            fontFamily: ff,
            fontSize: 'var(--sv-font-size-sm)',
            color: 'var(--sv-color-text-muted)',
            marginTop: 'var(--sv-space-1)',
          }}
        >
          {subtitle}
        </p>
      )}
    </div>
  );
}

function Code({ children }: { children: string }) {
  return (
    <pre
      style={{
        fontFamily: ffm,
        fontSize: 'var(--sv-font-size-xs)',
        background: 'var(--sv-color-surface-sunken)',
        border: '1px solid var(--sv-color-border)',
        borderRadius: 'var(--sv-radius-md)',
        padding: 'var(--sv-space-3) var(--sv-space-4)',
        color: 'var(--sv-color-text-primary)',
        overflowX: 'auto',
        margin: 0,
        lineHeight: 1.6,
        whiteSpace: 'pre',
      }}
    >
      {children}
    </pre>
  );
}

function DemoBox({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        background: 'var(--sv-color-surface-sunken)',
        border: '1px solid var(--sv-color-border)',
        borderRadius: 'var(--sv-radius-lg)',
        padding: 'var(--sv-space-4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 'var(--sv-space-3)',
        flexWrap: 'wrap',
        minHeight: 80,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        display: 'inline-block',
        fontFamily: ffm,
        fontSize: '0.6875rem',
        fontWeight: 600,
        letterSpacing: '0.03em',
        background: 'var(--sv-color-surface-sunken)',
        border: '1px solid var(--sv-color-border)',
        color: 'var(--sv-color-text-muted)',
        borderRadius: 'var(--sv-radius-full)',
        padding: '2px 10px',
      }}
    >
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Color groups
// ---------------------------------------------------------------------------

const COLOR_GROUPS: Array<{
  label: string;
  usage: string;
  tokens: Array<{ token: string; name: string }>;
}> = [
  {
    label: 'Surface',
    usage: 'Page backgrounds and card elevations.',
    tokens: [
      { token: '--sv-color-surface', name: 'surface' },
      { token: '--sv-color-surface-sunken', name: 'surface-sunken' },
      { token: '--sv-color-surface-raised', name: 'surface-raised' },
    ],
  },
  {
    label: 'Text',
    usage: 'Copy hierarchy from primary body to disabled hints.',
    tokens: [
      { token: '--sv-color-text-primary', name: 'text-primary' },
      { token: '--sv-color-text-muted', name: 'text-muted' },
      { token: '--sv-color-text-subtle', name: 'text-subtle' },
      { token: '--sv-color-text-on-accent', name: 'text-on-accent' },
      { token: '--sv-color-text-on-error', name: 'text-on-error' },
      { token: '--sv-color-text-on-success', name: 'text-on-success' },
    ],
  },
  {
    label: 'Border',
    usage: 'Dividers, input outlines, and card edges.',
    tokens: [
      { token: '--sv-color-border', name: 'border' },
      { token: '--sv-color-border-strong', name: 'border-strong' },
    ],
  },
  {
    label: 'Accent',
    usage:
      'Primary interactive color. Monochrome by default; instance admins override with their brand color.',
    tokens: [
      { token: '--sv-color-accent', name: 'accent' },
      { token: '--sv-color-accent-hover', name: 'accent-hover' },
      { token: '--sv-color-focus-ring', name: 'focus-ring' },
    ],
  },
  {
    label: 'Error',
    usage: 'Destructive states, form validation errors, critical banners.',
    tokens: [
      { token: '--sv-color-error-surface', name: 'error-surface' },
      { token: '--sv-color-error-text', name: 'error-text' },
      { token: '--sv-color-error-border', name: 'error-border' },
      { token: '--sv-color-error-solid', name: 'error-solid' },
    ],
  },
  {
    label: 'Warning',
    usage: 'Caution states, expiring licenses, near-limit notices.',
    tokens: [
      { token: '--sv-color-warning-surface', name: 'warning-surface' },
      { token: '--sv-color-warning-text', name: 'warning-text' },
      { token: '--sv-color-warning-border', name: 'warning-border' },
    ],
  },
  {
    label: 'Success',
    usage: 'Positive confirmations, completed actions, healthy status.',
    tokens: [
      { token: '--sv-color-success-surface', name: 'success-surface' },
      { token: '--sv-color-success-text', name: 'success-text' },
      { token: '--sv-color-success-border', name: 'success-border' },
      { token: '--sv-color-success-solid', name: 'success-solid' },
    ],
  },
  {
    label: 'Info',
    usage: 'Informational notices and neutral callouts.',
    tokens: [
      { token: '--sv-color-info-surface', name: 'info-surface' },
      { token: '--sv-color-info-text', name: 'info-text' },
      { token: '--sv-color-info-border', name: 'info-border' },
    ],
  },
];

function ColorSwatch({ token, name }: { token: string; name: string }) {
  const value =
    typeof window !== 'undefined'
      ? getComputedStyle(document.documentElement).getPropertyValue(token).trim()
      : '';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: '1 1 160px' }}>
      <div
        style={{
          height: 44,
          borderRadius: 'var(--sv-radius-md)',
          background: `var(${token})`,
          border: '1px solid var(--sv-color-border)',
        }}
      />
      <div>
        <p
          style={{
            fontFamily: ffm,
            fontSize: '0.6875rem',
            color: 'var(--sv-color-text-primary)',
            margin: 0,
          }}
        >
          --sv-color-{name}
        </p>
        <p
          style={{
            fontFamily: ffm,
            fontSize: '0.6875rem',
            color: 'var(--sv-color-text-muted)',
            margin: 0,
          }}
        >
          {value}
        </p>
      </div>
    </div>
  );
}

function ColorGroup({
  label,
  usage,
  tokens,
}: {
  label: string;
  usage: string;
  tokens: Array<{ token: string; name: string }>;
}) {
  return (
    <div style={{ marginBottom: 'var(--sv-space-8)' }}>
      <div style={{ marginBottom: 'var(--sv-space-3)' }}>
        <Heading level={3}>{label}</Heading>
        <p
          style={{
            fontFamily: ff,
            fontSize: 'var(--sv-font-size-caption)',
            color: 'var(--sv-color-text-muted)',
            margin: '4px 0 0',
          }}
        >
          {usage}
        </p>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sv-space-4)' }}>
        {tokens.map((t) => (
          <ColorSwatch key={t.token} token={t.token} name={t.name} />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Typography
// ---------------------------------------------------------------------------

const TYPE_SCALE: Array<{ token: string; label: string; note: string }> = [
  { token: '--sv-font-size-2xl', label: '2xl — 24px', note: 'Page titles' },
  { token: '--sv-font-size-xl', label: 'xl — 20px', note: 'Section headings' },
  { token: '--sv-font-size-lg', label: 'lg — 18px', note: 'Sub-headings' },
  { token: '--sv-font-size-md', label: 'md — 16px', note: 'Body (base)' },
  { token: '--sv-font-size-sm', label: 'sm — 14px', note: 'Body copy, labels' },
  { token: '--sv-font-size-caption', label: 'caption — 13px', note: 'Secondary / supporting copy' },
  { token: '--sv-font-size-xs', label: 'xs — 12px', note: 'Mono identifiers, badges' },
  { token: '--sv-font-size-label', label: 'label — 11px', note: 'All-caps section labels' },
];

// ---------------------------------------------------------------------------
// Component cards
// ---------------------------------------------------------------------------

function ComponentCard({
  name,
  importLine,
  usage,
  children,
}: {
  name: string;
  importLine: string;
  usage: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        border: '1px solid var(--sv-color-border)',
        borderRadius: 'var(--sv-radius-xl)',
        overflow: 'hidden',
        background: 'var(--sv-color-surface)',
        boxShadow: 'var(--sv-shadow-card)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: 'var(--sv-space-4)',
          borderBottom: '1px solid var(--sv-color-border)',
          background: 'var(--sv-color-surface-sunken)',
        }}
      >
        <Heading level={3}>{name}</Heading>
        <p
          style={{
            fontFamily: ff,
            fontSize: 'var(--sv-font-size-caption)',
            color: 'var(--sv-color-text-muted)',
            margin: '4px 0 0',
          }}
        >
          {usage}
        </p>
      </div>
      {/* Demo */}
      <div
        style={{
          padding: 'var(--sv-space-5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 96,
          gap: 'var(--sv-space-3)',
          flexWrap: 'wrap',
          flexGrow: 1,
        }}
      >
        {children}
      </div>
      {/* Import */}
      <div style={{ padding: 'var(--sv-space-3) var(--sv-space-4)' }}>
        <code
          style={{
            fontFamily: ffm,
            fontSize: '0.6875rem',
            color: 'var(--sv-color-text-muted)',
            display: 'block',
          }}
        >
          {importLine}
        </code>
      </div>
    </div>
  );
}

// Interactive wrappers

function ToggleDemo() {
  const [on, setOn] = useState(false);
  return <Toggle checked={on} onChange={setOn} aria-label="Enable feature" />;
}

function SegmentedDemo() {
  const [v, setV] = useState<'user' | 'admin'>('user');
  return (
    <SegmentedControl
      value={v}
      onChange={setV}
      options={[
        { label: 'User', value: 'user' },
        { label: 'Admin', value: 'admin' },
      ]}
      aria-label="Role"
    />
  );
}

function TabsDemo() {
  const [tab, setTab] = useState('profile');
  return (
    <div style={{ width: '100%', fontFamily: ff }}>
      <Tabs
        items={[
          { label: 'Profile', value: 'profile' },
          { label: 'Security', value: 'security' },
          { label: 'Data', value: 'data' },
        ]}
        value={tab}
        onChange={setTab}
        aria-label="Account"
      />
    </div>
  );
}

function CommandDemo() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        Open command palette
      </Button>
      <Command
        open={open}
        onClose={() => setOpen(false)}
        aria-label="Command palette"
        items={[
          {
            id: 'new',
            label: 'New conversation',
            group: 'Actions',
            icon: 'plus',
            onSelect: () => {},
          },
          {
            id: 'export',
            label: 'Export chat',
            group: 'Actions',
            icon: 'upload',
            onSelect: () => {},
          },
          {
            id: 'profile',
            label: 'Go to profile',
            group: 'Navigation',
            icon: 'user',
            onSelect: () => {},
          },
        ]}
      />
    </>
  );
}

function ComboboxDemo() {
  const [value, setValue] = useState<string | null>(null);
  return (
    <div style={{ width: 240 }}>
      <Combobox
        options={[
          { value: 'tasks', label: 'sovereign-tasks' },
          { value: 'ledger', label: 'sovereign-ledger' },
          { value: 'shopper', label: 'sovereign-shopper' },
        ]}
        value={value}
        onChange={setValue}
        placeholder="Select a plugin"
        aria-label="Plugin"
      />
    </div>
  );
}

function DialogDemo() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        Open dialog
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} size="sm" aria-label="Example dialog">
        <div style={{ padding: 24, fontFamily: ff }}>
          <Heading level={3}>Confirm action</Heading>
          <p
            style={{
              color: 'var(--sv-color-text-muted)',
              fontSize: 'var(--sv-font-size-sm)',
              margin: '12px 0 20px',
            }}
          >
            This will permanently delete the item. Are you sure?
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="destructive" size="sm" onClick={() => setOpen(false)}>
              Delete
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}

function DrawerDemo() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        Open drawer
      </Button>
      <Drawer open={open} onClose={() => setOpen(false)} aria-label="Navigation">
        <ul style={{ listStyle: 'none', margin: 0, padding: '8px 0' }}>
          {(['Home', 'Settings', 'Account'] as const).map((item) => (
            <li key={item}>
              <button
                onClick={() => setOpen(false)}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '12px 20px',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 15,
                  textAlign: 'left',
                  color: 'var(--sv-color-text-primary)',
                  fontFamily: ff,
                }}
              >
                {item}
              </button>
            </li>
          ))}
        </ul>
      </Drawer>
    </>
  );
}

function PopoverDemo() {
  const [open, setOpen] = useState(false);
  return (
    <Popover
      open={open}
      onClose={() => setOpen(false)}
      align="left"
      aria-label="Options menu"
      trigger={
        <Button size="sm" variant="ghost" onClick={() => setOpen((o) => !o)}>
          <Icon name="settings" size="sm" aria-hidden /> Options
        </Button>
      }
    >
      <div style={{ padding: 'var(--sv-space-3)', fontFamily: ff }}>
        {['Edit', 'Duplicate', 'Delete'].map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setOpen(false)}
            style={{
              display: 'block',
              width: '100%',
              padding: '8px 12px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 'var(--sv-font-size-sm)',
              textAlign: 'left',
              color:
                item === 'Delete' ? 'var(--sv-color-error-text)' : 'var(--sv-color-text-primary)',
              fontFamily: ff,
              borderRadius: 'var(--sv-radius-sm)',
            }}
          >
            {item}
          </button>
        ))}
      </div>
    </Popover>
  );
}

function OverlayHeaderDemo() {
  return (
    <div
      style={{
        width: '100%',
        maxWidth: 360,
        border: '1px solid var(--sv-color-border)',
        borderRadius: 'var(--sv-radius-lg)',
        overflow: 'hidden',
      }}
    >
      <OverlayHeader
        title="Edit list"
        onClose={() => {}}
        onBack={() => {}}
        action={
          <Button size="sm" variant="ghost" onClick={() => {}}>
            Save
          </Button>
        }
      />
    </div>
  );
}

function SheetDemo() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        Open sheet
      </Button>
      {/* Storybook has no --sv-shell-header-height/--sv-shell-footer-height, so
          the panel fills this fixed-height preview box instead of the real
          app's header-to-footer region — same component, just no shell
          around it here. */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 360,
          height: 280,
          marginTop: 12,
          border: '1px solid var(--sv-color-border)',
          borderRadius: 'var(--sv-radius-lg)',
          overflow: 'hidden',
        }}
      >
        <div style={{ position: 'absolute', inset: 0 }}>
          <Sheet
            open={open}
            onClose={() => setOpen(false)}
            title="Task detail"
            aria-label="Task detail"
          >
            <div
              style={{
                padding: 16,
                fontFamily: ff,
                fontSize: 14,
                color: 'var(--sv-color-text-muted)',
              }}
            >
              Full-page overlay content — same pattern the tasks plugin used for its task-detail and
              list-edit panels.
            </div>
          </Sheet>
        </div>
      </div>
    </>
  );
}

function ConfirmDialogDemo() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="destructive" onClick={() => setOpen(true)}>
        Remove passkey
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={() => setOpen(false)}
        title="Remove passkey"
        message="You will no longer be able to sign in with this passkey."
        confirmLabel="Remove"
        destructive
      />
    </>
  );
}

function MenuDemo() {
  const [open, setOpen] = useState(false);
  const [sortBy, setSortBy] = useState<'manual' | 'title' | 'due'>('manual');
  return (
    <Menu
      open={open}
      onClose={() => setOpen(false)}
      aria-label="List actions"
      align="left"
      trigger={
        <Button size="sm" variant="ghost" onClick={() => setOpen((o) => !o)}>
          <Icon name="settings" size="sm" aria-hidden /> Actions
        </Button>
      }
      items={[
        { type: 'label', label: 'Sort by' },
        { label: 'Manual', checked: sortBy === 'manual', onSelect: () => setSortBy('manual') },
        { label: 'Title', checked: sortBy === 'title', onSelect: () => setSortBy('title') },
        { label: 'Due date', checked: sortBy === 'due', onSelect: () => setSortBy('due') },
        { type: 'separator' },
        { label: 'Rename', icon: 'pencil', onSelect: () => {} },
        { label: 'Duplicate', icon: 'plus', onSelect: () => {} },
        { label: 'Delete', icon: 'trash-2', destructive: true, onSelect: () => {} },
      ]}
    />
  );
}

function CalendarDemo() {
  const [value, setValue] = useState<Date | null>(new Date());
  return (
    <div style={{ width: '100%', maxWidth: 320 }}>
      <Calendar value={value} onChange={setValue} aria-label="Example calendar" />
    </div>
  );
}

function DatePickerDemo() {
  const [value, setValue] = useState<Date | null>(null);
  return (
    <div style={{ width: '100%', maxWidth: 240 }}>
      <DatePicker
        value={value}
        onChange={setValue}
        aria-label="Due date"
        placeholder="Select date"
      />
    </div>
  );
}

function ToastDemo() {
  const { show } = useToast();
  return (
    <Button
      size="sm"
      variant="secondary"
      onClick={() =>
        show({
          title: 'Plugin installed',
          message: 'Tasks v1.2.0 is now active.',
          category: 'success',
        })
      }
    >
      Fire toast
    </Button>
  );
}

function TagInputDemo() {
  const [tags, setTags] = useState(['draft', 'frontmatter']);
  return <TagInput value={tags} onChange={setTags} aria-label="Tags" />;
}

function QuantityStepperDemo() {
  const [value, setValue] = useState(6);
  return <QuantityStepper value={value} onChange={setValue} unit="pcs" aria-label="Quantity" />;
}

function CheckableListRowDemo() {
  const [checked, setChecked] = useState(false);
  return (
    <div style={{ width: '100%' }}>
      <CheckableListRow
        checked={checked}
        onCheckedChange={setChecked}
        label="Bananas"
        icon={<Icon name="banana" size="md" aria-hidden />}
        trailing={<span style={{ fontSize: 13, color: 'var(--sv-color-text-muted)' }}>6 pcs</span>}
      />
    </div>
  );
}

function CurrencyInputDemo() {
  const [cents, setCents] = useState<number | null>(4250);
  return (
    <CurrencyInput
      valueCents={cents}
      onValueChange={setCents}
      placeholder="0.00"
      aria-label="Amount"
    />
  );
}

function SplitMethodSelectorDemo() {
  const [value, setValue] = useState<SplitMethod>('equal');
  return <SplitMethodSelector value={value} onChange={setValue} />;
}

const MEMBER_MULTI_SELECT_OPTIONS: MemberMultiSelectOption[] = [
  { id: '1', label: 'Priya' },
  { id: '2', label: 'Jamie (guest)' },
  { id: '3', label: 'Sam' },
];

function MemberMultiSelectDemo() {
  const [selected, setSelected] = useState<Set<string>>(new Set(['1', '3']));
  return (
    <div style={{ width: '100%' }}>
      <MemberMultiSelect
        options={MEMBER_MULTI_SELECT_OPTIONS}
        selectedIds={selected}
        onToggle={(id, checked) => {
          setSelected((prev) => {
            const next = new Set(prev);
            if (checked) next.add(id);
            else next.delete(id);
            return next;
          });
        }}
        label="Split between"
      />
    </div>
  );
}

function FileDropzoneDemo() {
  const [file, setFile] = useState<File | null>(null);
  return (
    <div style={{ width: '100%' }}>
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

function ResponsiveSurfaceDemo() {
  return (
    <div
      style={{
        border: '1px dashed var(--sv-color-border)',
        borderRadius: 'var(--sv-radius-md)',
        padding: 'var(--sv-space-4)',
        fontFamily: ff,
        fontSize: 'var(--sv-font-size-sm)',
        color: 'var(--sv-color-text-muted)',
      }}
    >
      <ResponsiveSurface
        web={
          <span style={{ color: 'var(--sv-color-text-primary)' }}>
            Web tree (resize below 768px)
          </span>
        }
        mobile={<span style={{ color: 'var(--sv-color-text-primary)' }}>Mobile tree</span>}
      />
    </div>
  );
}

const SWIPABLE_CAROUSEL_DEMO_SLIDES = [
  { key: 'lists', label: 'Lists' },
  { key: 'groceries', label: 'Groceries' },
  { key: 'errands', label: 'Errands' },
];

function SwipableMobileCarouselDemo() {
  const [activeIndex, setActiveIndex] = useState(0);
  return (
    <div
      style={{
        height: 220,
        border: '1px solid var(--sv-color-border)',
        borderRadius: 'var(--sv-radius-md)',
        overflow: 'hidden',
      }}
    >
      <SwipableMobileCarousel
        activeIndex={activeIndex}
        onSettle={setActiveIndex}
        aria-label="Task lists"
      >
        {SWIPABLE_CAROUSEL_DEMO_SLIDES.map((slide) => (
          <SwipableMobileCarouselSlide key={slide.key} slideKey={slide.key} label={slide.label}>
            <SwipableMobileCarouselSlideHeader>
              <div
                style={{
                  padding: 'var(--sv-space-3)',
                  fontFamily: ff,
                  fontWeight: 'var(--sv-font-weight-semibold)',
                  color: 'var(--sv-color-text-primary)',
                }}
              >
                {slide.label}
              </div>
            </SwipableMobileCarouselSlideHeader>
            <SwipableMobileCarouselSlideBody>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%',
                  fontFamily: ff,
                  color: 'var(--sv-color-text-muted)',
                }}
              >
                {slide.label} content
              </div>
            </SwipableMobileCarouselSlideBody>
          </SwipableMobileCarouselSlide>
        ))}
      </SwipableMobileCarousel>
    </div>
  );
}

function SwipableMobileCarouselDotsDemo() {
  const [activeIndex, setActiveIndex] = useState(0);
  return (
    <SwipableMobileCarouselDots
      count={3}
      activeIndex={activeIndex}
      onJump={setActiveIndex}
      labels={['Lists', 'Groceries', 'Errands']}
      aria-label="Task lists"
    />
  );
}

function IconPickerDemo() {
  const [value, setValue] = useState<IconName | null>('banana');
  const options: IconName[] = [
    'banana',
    'apple',
    'carrot',
    'egg',
    'milk',
    'beef',
    'drumstick',
    'fish',
    'croissant',
    'cookie',
  ];
  return (
    <IconPicker
      value={value}
      onChange={setValue}
      options={options}
      aria-label="Item icon"
      triggerLabel={value ?? 'Choose icon'}
    />
  );
}

function SuggestionInputDemo() {
  const [value, setValue] = useState('ban');
  const options = ['Bananas', 'Banana bread mix']
    .filter((label) => label.toLowerCase().includes(value.trim().toLowerCase()))
    .map((label, i) => ({ id: String(i), label }));
  return (
    <SuggestionInput
      value={value}
      onChange={setValue}
      options={value.trim() ? options : []}
      onSelect={(o) => setValue(o.label)}
      placeholder="Add an item…"
      aria-label="Add an item"
      createLabel={(v) => `Add "${v}" as a new item`}
      onCreate={setValue}
    />
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

function OverviewPage() {
  return (
    <div
      style={{
        fontFamily: ff,
        background: 'var(--sv-color-surface)',
        minHeight: '100vh',
        color: 'var(--sv-color-text-primary)',
      }}
    >
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <div
        style={{
          padding: 'var(--sv-space-10) var(--sv-space-8)',
          borderBottom: '1px solid var(--sv-color-border)',
          background: 'var(--sv-color-surface-sunken)',
        }}
      >
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--sv-space-3)',
              marginBottom: 'var(--sv-space-4)',
            }}
          >
            <Pill>@sovereignfs/ui</Pill>
            <Pill>v1.x</Pill>
          </div>
          <Heading level={1}>Sovereign Design System</Heading>
          <p
            style={{
              fontSize: 'var(--sv-font-size-lg)',
              color: 'var(--sv-color-text-muted)',
              marginTop: 'var(--sv-space-3)',
              maxWidth: 600,
              lineHeight: 1.5,
            }}
          >
            The component library and token system for building Sovereign plugins. Everything here
            is the public contract — available to every plugin developer, stable across minor
            versions.
          </p>
          <div
            style={{
              marginTop: 'var(--sv-space-5)',
              padding: 'var(--sv-space-4)',
              background: 'var(--sv-color-surface)',
              border: '1px solid var(--sv-color-border)',
              borderRadius: 'var(--sv-radius-lg)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--sv-space-2)',
            }}
          >
            <p
              style={{
                fontFamily: ffm,
                fontSize: 'var(--sv-font-size-xs)',
                color: 'var(--sv-color-text-muted)',
                margin: 0,
              }}
            >
              Three things to remember:
            </p>
            <ul
              style={{
                margin: 0,
                paddingLeft: 'var(--sv-space-5)',
                color: 'var(--sv-color-text-primary)',
                fontSize: 'var(--sv-font-size-sm)',
                lineHeight: 1.8,
              }}
            >
              <li>
                Import components from <code style={{ fontFamily: ffm }}>@sovereignfs/ui</code>
              </li>
              <li>
                Use <code style={{ fontFamily: ffm }}>--sv-*</code> semantic tokens in your CSS —
                they are injected globally by the runtime shell, no import needed
              </li>
              <li>Never hardcode hex values or reference primitive tokens directly</li>
            </ul>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 800, margin: '0 auto', padding: 'var(--sv-space-8)' }}>
        {/* ── Quick Start ───────────────────────────────────────────────── */}
        <section style={{ marginBottom: 'var(--sv-space-12)' }}>
          <SectionHeader
            title="Quick start"
            subtitle="Everything you need to build a Sovereign plugin UI."
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sv-space-4)' }}>
            <div>
              <p
                style={{
                  fontSize: 'var(--sv-font-size-caption)',
                  color: 'var(--sv-color-text-muted)',
                  marginBottom: 'var(--sv-space-2)',
                }}
              >
                Import typed React components:
              </p>
              <Code>{`import { Button, Badge, Input, Icon, Toggle, Tabs } from '@sovereignfs/ui';`}</Code>
            </div>
            <div>
              <p
                style={{
                  fontSize: 'var(--sv-font-size-caption)',
                  color: 'var(--sv-color-text-muted)',
                  marginBottom: 'var(--sv-space-2)',
                }}
              >
                Reference semantic tokens directly in plugin CSS — no import required:
              </p>
              <Code>{`.my-card {
  background: var(--sv-color-surface);
  border: 1px solid var(--sv-color-border);
  border-radius: var(--sv-radius-lg);
  padding: var(--sv-space-4);
  box-shadow: var(--sv-shadow-card);
  font-family: var(--sv-font-family);
  color: var(--sv-color-text-primary);
}`}</Code>
            </div>
          </div>
        </section>

        {/* ── Token Architecture ────────────────────────────────────────── */}
        <section style={{ marginBottom: 'var(--sv-space-12)' }}>
          <SectionHeader
            title="Token architecture"
            subtitle="Two layers — only the semantic layer is a public API."
          />
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr auto 1fr auto 1fr',
              gap: 'var(--sv-space-3)',
              alignItems: 'center',
              marginBottom: 'var(--sv-space-6)',
            }}
          >
            {[
              {
                label: 'Primitives',
                sub: '--sv-grey-900\n--sv-red-100\n--sv-space-4',
                note: 'Internal only. Raw scale values.',
                muted: true,
              },
            ].map((b) => (
              <div
                key={b.label}
                style={{
                  border: `1px solid ${b.muted ? 'var(--sv-color-border)' : 'var(--sv-color-accent)'}`,
                  borderRadius: 'var(--sv-radius-lg)',
                  padding: 'var(--sv-space-4)',
                  opacity: b.muted ? 0.6 : 1,
                }}
              >
                <p
                  style={{
                    fontSize: 'var(--sv-font-size-sm)',
                    fontWeight: 600,
                    margin: '0 0 6px',
                    color: 'var(--sv-color-text-primary)',
                  }}
                >
                  {b.label}
                </p>
                <pre
                  style={{
                    fontFamily: ffm,
                    fontSize: '0.6875rem',
                    color: 'var(--sv-color-text-muted)',
                    margin: 0,
                    whiteSpace: 'pre',
                  }}
                >
                  {b.sub}
                </pre>
                <p
                  style={{
                    fontSize: 'var(--sv-font-size-caption)',
                    color: 'var(--sv-color-text-muted)',
                    margin: '8px 0 0',
                  }}
                >
                  {b.note}
                </p>
              </div>
            ))}
            <div style={{ textAlign: 'center', color: 'var(--sv-color-text-muted)', fontSize: 24 }}>
              →
            </div>
            <div
              style={{
                border: '2px solid var(--sv-color-accent)',
                borderRadius: 'var(--sv-radius-lg)',
                padding: 'var(--sv-space-4)',
              }}
            >
              <p
                style={{
                  fontSize: 'var(--sv-font-size-sm)',
                  fontWeight: 600,
                  margin: '0 0 6px',
                  color: 'var(--sv-color-text-primary)',
                }}
              >
                Semantic tokens ✓
              </p>
              <pre
                style={{
                  fontFamily: ffm,
                  fontSize: '0.6875rem',
                  color: 'var(--sv-color-text-muted)',
                  margin: 0,
                  whiteSpace: 'pre',
                }}
              >
                {'--sv-color-surface\n--sv-color-error-text\n--sv-radius-lg'}
              </pre>
              <p
                style={{
                  fontSize: 'var(--sv-font-size-caption)',
                  color: 'var(--sv-color-text-muted)',
                  margin: '8px 0 0',
                }}
              >
                Plugin public API. Theme-aware.
              </p>
            </div>
            <div style={{ textAlign: 'center', color: 'var(--sv-color-text-muted)', fontSize: 24 }}>
              →
            </div>
            <div
              style={{
                border: '2px solid var(--sv-color-accent)',
                borderRadius: 'var(--sv-radius-lg)',
                padding: 'var(--sv-space-4)',
              }}
            >
              <p
                style={{
                  fontSize: 'var(--sv-font-size-sm)',
                  fontWeight: 600,
                  margin: '0 0 6px',
                  color: 'var(--sv-color-text-primary)',
                }}
              >
                Components ✓
              </p>
              <pre
                style={{
                  fontFamily: ffm,
                  fontSize: '0.6875rem',
                  color: 'var(--sv-color-text-muted)',
                  margin: 0,
                  whiteSpace: 'pre',
                }}
              >
                {'<Button />\n<Badge />\n<Input />'}
              </pre>
              <p
                style={{
                  fontSize: 'var(--sv-font-size-caption)',
                  color: 'var(--sv-color-text-muted)',
                  margin: '8px 0 0',
                }}
              >
                React, typed, RSC-safe.
              </p>
            </div>
          </div>
          <div
            style={{
              background: 'var(--sv-color-warning-surface)',
              border: '1px solid var(--sv-color-warning-border)',
              borderRadius: 'var(--sv-radius-md)',
              padding: 'var(--sv-space-3) var(--sv-space-4)',
              fontSize: 'var(--sv-font-size-sm)',
              color: 'var(--sv-color-warning-text)',
            }}
          >
            <strong>Never use primitive tokens in plugin code.</strong> Primitives like{' '}
            <code style={{ fontFamily: ffm }}>--sv-grey-900</code> or{' '}
            <code style={{ fontFamily: ffm }}>--sv-red-100</code> are fixed values — they do not
            swap with dark mode or instance theming. Only semantic tokens do.
          </div>
        </section>

        {/* ── Color System ─────────────────────────────────────────────── */}
        <section style={{ marginBottom: 'var(--sv-space-12)' }}>
          <SectionHeader
            title="Color system"
            subtitle="Semantic groups — use the Themes toolbar above to compare light and dark."
          />
          {COLOR_GROUPS.map((g) => (
            <ColorGroup key={g.label} label={g.label} usage={g.usage} tokens={g.tokens} />
          ))}
        </section>

        {/* ── Typography ───────────────────────────────────────────────── */}
        <section style={{ marginBottom: 'var(--sv-space-12)' }}>
          <SectionHeader
            title="Typography"
            subtitle="Hanken Grotesk (body) · JetBrains Mono (code) — fallback stacks apply when web fonts are not loaded."
          />

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 'var(--sv-space-6)',
              marginBottom: 'var(--sv-space-6)',
            }}
          >
            <div>
              <p
                style={{
                  fontSize: 'var(--sv-font-size-caption)',
                  color: 'var(--sv-color-text-muted)',
                  marginBottom: 'var(--sv-space-2)',
                }}
              >
                Body — var(--sv-font-family)
              </p>
              <p
                style={{
                  fontFamily: ff,
                  fontSize: 'var(--sv-font-size-lg)',
                  color: 'var(--sv-color-text-primary)',
                  margin: 0,
                }}
              >
                The quick brown fox
              </p>
              <p
                style={{
                  fontFamily: ff,
                  fontSize: 'var(--sv-font-size-sm)',
                  color: 'var(--sv-color-text-muted)',
                  margin: '4px 0 0',
                }}
              >
                ABCDEFGHIJKLMNOPQRSTUVWXYZ
              </p>
            </div>
            <div>
              <p
                style={{
                  fontSize: 'var(--sv-font-size-caption)',
                  color: 'var(--sv-color-text-muted)',
                  marginBottom: 'var(--sv-space-2)',
                }}
              >
                Mono — var(--sv-font-family-mono)
              </p>
              <p
                style={{
                  fontFamily: ffm,
                  fontSize: 'var(--sv-font-size-lg)',
                  color: 'var(--sv-color-text-primary)',
                  margin: 0,
                }}
              >
                const x = 42;
              </p>
              <p
                style={{
                  fontFamily: ffm,
                  fontSize: 'var(--sv-font-size-sm)',
                  color: 'var(--sv-color-text-muted)',
                  margin: '4px 0 0',
                }}
              >
                --sv-font-family-mono
              </p>
            </div>
          </div>

          <div
            style={{
              border: '1px solid var(--sv-color-border)',
              borderRadius: 'var(--sv-radius-lg)',
              overflow: 'hidden',
            }}
          >
            {TYPE_SCALE.map((t, i) => (
              <div
                key={t.token}
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 'var(--sv-space-4)',
                  padding: 'var(--sv-space-3) var(--sv-space-4)',
                  borderBottom:
                    i < TYPE_SCALE.length - 1 ? '1px solid var(--sv-color-border)' : 'none',
                  background:
                    i % 2 === 0 ? 'var(--sv-color-surface)' : 'var(--sv-color-surface-sunken)',
                }}
              >
                <span
                  style={{
                    fontSize: `var(${t.token})`,
                    color: 'var(--sv-color-text-primary)',
                    lineHeight: 1.2,
                    minWidth: 160,
                  }}
                >
                  {t.label}
                </span>
                <code
                  style={{
                    fontFamily: ffm,
                    fontSize: '0.6875rem',
                    color: 'var(--sv-color-text-muted)',
                    flexShrink: 0,
                  }}
                >
                  {t.token}
                </code>
                <span
                  style={{
                    fontSize: 'var(--sv-font-size-caption)',
                    color: 'var(--sv-color-text-muted)',
                    marginLeft: 'auto',
                  }}
                >
                  {t.note}
                </span>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 'var(--sv-space-4)' }}>
            <p
              style={{
                fontSize: 'var(--sv-font-size-caption)',
                color: 'var(--sv-color-text-muted)',
                marginBottom: 'var(--sv-space-2)',
              }}
            >
              Font weight tokens:
            </p>
            <Code>{`font-weight: var(--sv-font-weight-regular);   /* 400 */
font-weight: var(--sv-font-weight-medium);    /* 500 */
font-weight: var(--sv-font-weight-semibold);  /* 600 */
font-weight: var(--sv-font-weight-bold);      /* 700 */`}</Code>
          </div>
        </section>

        {/* ── Spacing & Radius ─────────────────────────────────────────── */}
        <section style={{ marginBottom: 'var(--sv-space-12)' }}>
          <SectionHeader title="Spacing & radius" subtitle="4px base grid." />
          <div
            style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sv-space-8)' }}
          >
            {/* Spacing */}
            <div>
              <p
                style={{
                  fontSize: 'var(--sv-font-size-caption)',
                  color: 'var(--sv-color-text-muted)',
                  marginBottom: 'var(--sv-space-3)',
                }}
              >
                Spacing (--sv-space-*)
              </p>
              {(
                [
                  '--sv-space-1',
                  '--sv-space-2',
                  '--sv-space-3',
                  '--sv-space-4',
                  '--sv-space-5',
                  '--sv-space-6',
                  '--sv-space-8',
                  '--sv-space-10',
                  '--sv-space-12',
                  '--sv-space-16',
                ] as const
              ).map((t) => (
                <div
                  key={t}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}
                >
                  <div
                    style={{
                      width: `var(${t})`,
                      minWidth: 4,
                      height: 10,
                      background: 'var(--sv-color-accent)',
                      borderRadius: 2,
                      flexShrink: 0,
                    }}
                  />
                  <code
                    style={{
                      fontFamily: ffm,
                      fontSize: '0.6875rem',
                      color: 'var(--sv-color-text-muted)',
                    }}
                  >
                    {t}
                  </code>
                </div>
              ))}
            </div>
            {/* Radius */}
            <div>
              <p
                style={{
                  fontSize: 'var(--sv-font-size-caption)',
                  color: 'var(--sv-color-text-muted)',
                  marginBottom: 'var(--sv-space-3)',
                }}
              >
                Border radius (--sv-radius-*)
              </p>
              {(
                [
                  '--sv-radius-sm',
                  '--sv-radius-md',
                  '--sv-radius-lg',
                  '--sv-radius-xl',
                  '--sv-radius-2xl',
                  '--sv-radius-3xl',
                  '--sv-radius-full',
                ] as const
              ).map((t) => (
                <div
                  key={t}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}
                >
                  <div
                    style={{
                      width: 48,
                      height: 24,
                      background: 'var(--sv-color-accent)',
                      borderRadius: `var(${t})`,
                      flexShrink: 0,
                    }}
                  />
                  <code
                    style={{
                      fontFamily: ffm,
                      fontSize: '0.6875rem',
                      color: 'var(--sv-color-text-muted)',
                    }}
                  >
                    {t}
                  </code>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Shadows ──────────────────────────────────────────────────── */}
        <section style={{ marginBottom: 'var(--sv-space-12)' }}>
          <SectionHeader title="Elevation & shadows" subtitle="Four levels, dark-mode adjusted." />
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 'var(--sv-space-5)',
            }}
          >
            {(
              [
                '--sv-shadow-card',
                '--sv-shadow-hover',
                '--sv-shadow-popover',
                '--sv-shadow-overlay',
              ] as const
            ).map((t) => (
              <div
                key={t}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}
              >
                <div
                  style={{
                    width: 64,
                    height: 40,
                    background: 'var(--sv-color-surface-raised)',
                    boxShadow: `var(${t})`,
                    borderRadius: 'var(--sv-radius-md)',
                  }}
                />
                <code
                  style={{
                    fontFamily: ffm,
                    fontSize: '0.6875rem',
                    color: 'var(--sv-color-text-muted)',
                    textAlign: 'center',
                  }}
                >
                  {t.replace('--sv-shadow-', '')}
                </code>
              </div>
            ))}
          </div>
        </section>

        {/* ── Component Gallery ─────────────────────────────────────────── */}
        <section style={{ marginBottom: 'var(--sv-space-12)' }}>
          <SectionHeader
            title="Component gallery"
            subtitle="All 74 components — click each story in the sidebar for the full API, variants, and controls."
          />

          <div style={{ marginBottom: 'var(--sv-space-6)' }}>
            <SystemBanner variant="info">
              All components reference <code style={{ fontFamily: ffm }}>--sv-*</code> tokens
              internally — they automatically adapt to dark mode and instance theming without any
              extra configuration.
            </SystemBanner>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
              gap: 'var(--sv-space-5)',
            }}
          >
            {/* Button */}
            <ComponentCard
              name="Button"
              importLine="import { Button } from '@sovereignfs/ui';"
              usage="Primary interactive control. Four variants: primary, secondary, ghost, destructive. Three sizes: lg, md (default), sm. loading disables the button, sets aria-busy, and shows a spinner. 44px min-height under (pointer: coarse); hover behind (hover: hover)."
            >
              <Button>Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="destructive" size="sm">
                Delete
              </Button>
              <Button size="lg">Large</Button>
              <Button loading>Saving…</Button>
            </ComponentCard>

            {/* Badge */}
            <ComponentCard
              name="Badge"
              importLine="import { Badge } from '@sovereignfs/ui';"
              usage="Compact label for roles (role), lifecycle states (status), and type/version tags (mono). sm/md/lg sizes; ALL CAPS by default, or uppercase={false} for title case. RSC-safe."
            >
              <Badge variant="role">Admin</Badge>
              <Badge variant="status" status="active">
                Active
              </Badge>
              <Badge variant="status" status="invited">
                Invited
              </Badge>
              <Badge variant="mono">v1.2.0</Badge>
              <Badge variant="role" size="lg" uppercase={false}>
                Owner
              </Badge>
            </ComponentCard>

            {/* StatusBadge */}
            <ComponentCard
              name="StatusBadge"
              importLine="import { StatusBadge } from '@sovereignfs/ui';"
              usage="Inline status indicator for editor sync, draft, conflict, and delete-pending states. RSC-safe."
            >
              <StatusBadge status="draft" />
              <StatusBadge status="synced" />
              <StatusBadge status="conflict" />
              <StatusBadge status="pending-delete" />
            </ComponentCard>

            {/* BalanceChip */}
            <ComponentCard
              name="BalanceChip"
              importLine="import { BalanceChip } from '@sovereignfs/ui';"
              usage="Inline net-balance indicator — green when owed to them, red when they owe, neutral when settled. Not tied to expense-splitting specifically."
            >
              <BalanceChip amountCents={2500} currency="USD" />
              <BalanceChip amountCents={-1350} currency="USD" />
              <BalanceChip amountCents={0} currency="USD" />
            </ComponentCard>

            {/* Input */}
            <ComponentCard
              name="Input"
              importLine="import { Input } from '@sovereignfs/ui';"
              usage="Primitive text field. No label built-in — always pair with <label> for accessibility. Forwards all native input props."
            >
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <Input placeholder="Email address" type="email" style={{ width: '100%' }} />
                <Input placeholder="Disabled" disabled style={{ width: '100%' }} />
              </div>
            </ComponentCard>

            {/* CurrencyInput */}
            <ComponentCard
              name="CurrencyInput"
              importLine="import { CurrencyInput } from '@sovereignfs/ui';"
              usage="Decimal amount entry that reports its value as integer cents. Preserves in-progress typing instead of reformatting on every keystroke."
            >
              <CurrencyInputDemo />
            </ComponentCard>

            {/* TagInput */}
            <ComponentCard
              name="TagInput"
              importLine="import { TagInput } from '@sovereignfs/ui';"
              usage="Controlled multi-value input for tags and frontmatter arrays. Enter/comma adds, Backspace removes, paste can split multiple tags."
            >
              <TagInputDemo />
            </ComponentCard>

            {/* SuggestionInput */}
            <ComponentCard
              name="SuggestionInput"
              importLine="import { SuggestionInput } from '@sovereignfs/ui';"
              usage="Text field with an anchored, keyboard-navigable async suggestion list, plus an optional trailing 'create new' row. Built on Popover."
            >
              <div style={{ width: '100%' }}>
                <SuggestionInputDemo />
              </div>
            </ComponentCard>

            {/* IconPicker */}
            <ComponentCard
              name="IconPicker"
              importLine="import { IconPicker } from '@sovereignfs/ui';"
              usage="Trigger button + Popover grid for a curated, bounded icon set (e.g. a plugin's category icons) — not the full icon library."
            >
              <IconPickerDemo />
            </ComponentCard>

            {/* QuantityStepper */}
            <ComponentCard
              name="QuantityStepper"
              importLine="import { QuantityStepper } from '@sovereignfs/ui';"
              usage="Numeric input with +/- buttons and an optional read-only unit suffix. Supports fractional step values (e.g. 0.5 kg)."
            >
              <QuantityStepperDemo />
            </ComponentCard>

            {/* Select */}
            <ComponentCard
              name="Select"
              importLine="import { Select } from '@sovereignfs/ui';"
              usage="Styled native <select> — same visual language as Input. Preserves native picker on mobile. RSC-safe."
            >
              <div style={{ width: '100%' }}>
                <Select defaultValue="admin" style={{ width: '100%' }}>
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                  <option value="owner">Owner</option>
                </Select>
              </div>
            </ComponentCard>

            {/* Toggle */}
            <ComponentCard
              name="Toggle"
              importLine="import { Toggle } from '@sovereignfs/ui';"
              usage="38×22px binary switch. Renders as role='switch' for screen reader support. aria-label is required."
            >
              <ToggleDemo />
              <span
                style={{
                  fontFamily: ff,
                  fontSize: 'var(--sv-font-size-sm)',
                  color: 'var(--sv-color-text-muted)',
                }}
              >
                Click to toggle
              </span>
            </ComponentCard>

            {/* SegmentedControl */}
            <ComponentCard
              name="SegmentedControl"
              importLine="import { SegmentedControl } from '@sovereignfs/ui';"
              usage="Pill-based 2–3 option picker for inline use (role selector, theme switcher). Renders as role='radiogroup'."
            >
              <SegmentedDemo />
            </ComponentCard>

            {/* SplitMethodSelector */}
            <ComponentCard
              name="SplitMethodSelector"
              importLine="import { SplitMethodSelector } from '@sovereignfs/ui';"
              usage="The four-way Equal/Amount/Percentage/Shares picker shared by any cost-splitting plugin. A thin SegmentedControl preset."
            >
              <SplitMethodSelectorDemo />
            </ComponentCard>

            {/* Tabs */}
            <ComponentCard
              name="Tabs"
              importLine="import { Tabs } from '@sovereignfs/ui';"
              usage="Underline tab nav. Stateless — caller owns value + onChange. Scrolls horizontally on mobile."
            >
              <TabsDemo />
            </ComponentCard>

            {/* Icon */}
            <ComponentCard
              name="Icon"
              importLine="import { Icon } from '@sovereignfs/ui';"
              usage="SVG icon primitive. 52 bundled icons. Decorative: aria-hidden. Meaningful: aria-label. Three sizes: sm, md, lg."
            >
              {(
                [
                  'house',
                  'settings',
                  'bell',
                  'user',
                  'shield',
                  'mail',
                  'search',
                  'plus',
                  'trash-2',
                  'external-link',
                ] as const
              ).map((n) => (
                <Icon key={n} name={n} size="md" aria-hidden />
              ))}
            </ComponentCard>

            {/* Dialog */}
            <ComponentCard
              name="Dialog"
              importLine="import { Dialog } from '@sovereignfs/ui';"
              usage="Modal surface (scrim + panel). Esc, scrim-click, focus trap. Sizes: sm, md, lg, full. Mobile renders fullscreen."
            >
              <DialogDemo />
            </ComponentCard>

            {/* Drawer */}
            <ComponentCard
              name="Drawer"
              importLine="import { Drawer } from '@sovereignfs/ui';"
              usage="Bottom-sheet panel. Esc, scrim-click, or swipe-down on the built-in grab handle to dismiss. snapHeight: 'content' (default, capped 80dvh) or 'half' (fixed 50dvh). Respects safe-area-inset-bottom."
            >
              <DrawerDemo />
            </ComponentCard>

            {/* OverlayHeader */}
            <ComponentCard
              name="OverlayHeader"
              importLine="import { OverlayHeader } from '@sovereignfs/ui';"
              usage="Shared fixed secondary header for Dialog's mobile mode, Sheet, and Drawer: title + close, optional back button, trailing action, and a second row for tab strips."
            >
              <OverlayHeaderDemo />
            </ComponentCard>

            {/* Sheet */}
            <ComponentCard
              name="Sheet"
              importLine="import { Sheet } from '@sovereignfs/ui';"
              usage="Full-page overlay filling a plugin's content area between the shell header and footer — for detail views (task detail, list edit). No desktop equivalent; a desktop layout shows the same content inline instead."
            >
              <SheetDemo />
            </ComponentCard>

            {/* ConfirmDialog */}
            <ComponentCard
              name="ConfirmDialog"
              importLine="import { ConfirmDialog } from '@sovereignfs/ui';"
              usage="Small, content-sized confirm/cancel prompt. Same presentation on desktop and mobile — not a full-screen sheet. destructive for a solid red confirm action; pending + error for an async onConfirm."
            >
              <ConfirmDialogDemo />
            </ComponentCard>

            {/* Popover */}
            <ComponentCard
              name="Popover"
              importLine="import { Popover } from '@sovereignfs/ui';"
              usage="Floating panel anchored below a trigger. Non-modal. Closes on outside click or Escape. Left or right aligned."
            >
              <PopoverDemo />
            </ComponentCard>

            {/* Menu */}
            <ComponentCard
              name="Menu"
              importLine="import { Menu } from '@sovereignfs/ui';"
              usage="Adaptive action menu: Popover on desktop, Drawer on mobile. Same items list renders in both — for '⋯' row/list actions. Entries can be a plain item, a { type: 'label' } section heading, a { type: 'separator' } divider, or a checkable item (pass checked on every item in the group) for a mutually-exclusive set like sort order."
            >
              <MenuDemo />
            </ComponentCard>

            {/* Calendar */}
            <ComponentCard
              name="Calendar"
              importLine="import { Calendar } from '@sovereignfs/ui';"
              usage="Keyboard-navigable month grid. Date-only (no time/range yet). Arrow keys, Home/End, PageUp/PageDown, Enter/Space to select."
            >
              <CalendarDemo />
            </ComponentCard>

            {/* DatePicker */}
            <ComponentCard
              name="DatePicker"
              importLine="import { DatePicker } from '@sovereignfs/ui';"
              usage="Form field pairing a trigger with Calendar: Popover on desktop, Drawer on mobile. Built-in trigger, unlike Menu's caller-supplied one."
            >
              <DatePickerDemo />
            </ComponentCard>

            {/* SystemBanner */}
            <ComponentCard
              name="SystemBanner"
              importLine="import { SystemBanner } from '@sovereignfs/ui';"
              usage="Full-width sticky strip for platform-level notices. Three variants: info, warning, error. Dismissible optional."
            >
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <SystemBanner variant="info">Read-only mode during migration.</SystemBanner>
                <SystemBanner variant="warning">License expires in 7 days.</SystemBanner>
                <SystemBanner variant="error">Maintenance mode active.</SystemBanner>
              </div>
            </ComponentCard>

            {/* Toast */}
            <ComponentCard
              name="Toast"
              importLine="import { ToastProvider, useToast } from '@sovereignfs/ui';"
              usage="Fixed top-right notification stack. Wrap app in ToastProvider; call useToast().show() imperatively. Six categories."
            >
              <ToastProvider>
                <ToastDemo />
              </ToastProvider>
            </ComponentCard>

            {/* Card */}
            <ComponentCard
              name="Card"
              importLine="import { Card } from '@sovereignfs/ui';"
              usage="Surface container with border, shadow, and padding. Use as='article' or 'li' for semantics. Add interactive for hover/focus styles on clickable cards."
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
                <Card padding="sm">Small padding card</Card>
                <Card padding="md" interactive>
                  Interactive card — hover me
                </Card>
              </div>
            </ComponentCard>

            {/* FormField */}
            <ComponentCard
              name="FormField"
              importLine="import { FormField } from '@sovereignfs/ui';"
              usage="Accessible label + input wrapper. The render-prop `children` receives field props (id, aria-describedby, aria-invalid) to spread onto the control, so hint/error text stays wired to it."
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
                <FormField label="Email" hint="We'll never share this." id="ov-email">
                  {(field) => <Input {...field} type="email" placeholder="you@example.com" />}
                </FormField>
                <FormField label="Password" error="Must be 8+ characters." id="ov-pw">
                  {(field) => <Input {...field} type="password" />}
                </FormField>
              </div>
            </ComponentCard>

            {/* Textarea */}
            <ComponentCard
              name="Textarea"
              importLine="import { Textarea } from '@sovereignfs/ui';"
              usage="The primitive multi-line text field. Forwards all native textarea props. Pair with FormField or a <label> for accessibility."
            >
              <Textarea
                aria-label="Description"
                placeholder="Add a description…"
                style={{ width: '100%' }}
              />
            </ComponentCard>

            {/* CodeTextarea */}
            <ComponentCard
              name="CodeTextarea"
              importLine="import { CodeTextarea } from '@sovereignfs/ui';"
              usage="Monospace textarea for Markdown, YAML, JSON, and raw frontmatter editing. Pair with FormField for labels and validation."
            >
              <CodeTextarea
                aria-label="YAML source"
                defaultValue={'title: Release notes\ntags:\n  - launch'}
                rows={5}
                style={{ width: '100%' }}
              />
            </ComponentCard>

            {/* SplitPane */}
            <ComponentCard
              name="SplitPane"
              importLine="import { SplitPane } from '@sovereignfs/ui';"
              usage="Responsive editor/preview or list/detail layout. Desktop panes are resizable with pointer and keyboard controls; mobile stacks to one column."
            >
              <SplitPane
                defaultPrimarySize={44}
                primary={
                  <div
                    style={{
                      padding: 'var(--sv-space-3)',
                      fontFamily: ffm,
                      fontSize: 'var(--sv-font-size-xs)',
                      color: 'var(--sv-color-text-primary)',
                    }}
                  >
                    # Draft
                  </div>
                }
                secondary={
                  <div
                    style={{
                      padding: 'var(--sv-space-3)',
                      fontFamily: ff,
                      fontSize: 'var(--sv-font-size-sm)',
                      color: 'var(--sv-color-text-primary)',
                    }}
                  >
                    Draft preview
                  </div>
                }
              />
            </ComponentCard>

            {/* PageHeader */}
            <ComponentCard
              name="PageHeader"
              importLine="import { PageHeader } from '@sovereignfs/ui';"
              usage="Plugin page top section. Title + optional description + right-side action slot. Replaces the hand-rolled .pageHeader pattern in every plugin."
            >
              <div style={{ width: '100%' }}>
                <PageHeader
                  title="Users"
                  description="Manage who has access to this instance."
                  action={<Button size="sm">Invite user</Button>}
                />
              </div>
            </ComponentCard>

            {/* PageContainer */}
            <ComponentCard
              name="PageContainer"
              importLine="import { PageContainer } from '@sovereignfs/ui';"
              usage="Constrains and centers a plugin's main content width (sm/md/lg/full). Adds no padding of its own — the runtime shell already pads plugin content. Use instead of local container CSS in a plugin's layout."
            >
              <div style={{ width: '100%', background: 'var(--sv-color-surface-sunken)' }}>
                <PageContainer maxWidth="sm">
                  <div
                    style={{
                      background: 'var(--sv-color-surface-raised)',
                      border: '1px dashed var(--sv-color-border)',
                      borderRadius: 'var(--sv-radius-md)',
                      padding: 'var(--sv-space-4)',
                    }}
                  >
                    maxWidth=&quot;sm&quot;
                  </div>
                </PageContainer>
              </div>
            </ComponentCard>

            {/* EmptyState */}
            <ComponentCard
              name="EmptyState"
              importLine="import { EmptyState } from '@sovereignfs/ui';"
              usage="Zero-data placeholder. Icon slot, heading, description, and optional CTA. Use whenever a list or table has no rows."
            >
              <EmptyState
                icon="search"
                heading="No results found"
                description="Try adjusting your search."
                action={
                  <Button variant="secondary" size="sm">
                    Clear filters
                  </Button>
                }
              />
            </ComponentCard>

            {/* Spinner */}
            <ComponentCard
              name="Spinner"
              importLine="import { Spinner } from '@sovereignfs/ui';"
              usage="CSS-animated loading ring in sm/md/lg sizes matching icon-size tokens. Pauses under prefers-reduced-motion. Sets role='status' with aria-label."
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <Spinner size="sm" />
                <Spinner size="md" />
                <Spinner size="lg" />
              </div>
            </ComponentCard>

            {/* Avatar */}
            <ComponentCard
              name="Avatar"
              importLine="import { Avatar } from '@sovereignfs/ui';"
              usage="User representation. Shows image when src loads; falls back to initials derived from name. Three sizes. Always sets alt text for accessibility."
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Avatar name="Jane Smith" size="sm" />
                <Avatar name="Jane Smith" size="md" />
                <Avatar name="Jane Smith" size="lg" />
                <Avatar name="Admin" src="https://i.pravatar.cc/150?u=sb" size="lg" />
              </div>
            </ComponentCard>

            {/* NavTabs */}
            <ComponentCard
              name="NavTabs"
              importLine="import { NavTabs } from '@sovereignfs/ui';"
              usage="Underline-style navigation tabs for plugin-level page routing. Distinct from the contained Tabs component. Scrolls horizontally on mobile with no visible scrollbar."
            >
              <div style={{ width: '100%' }}>
                <NavTabs
                  items={[
                    { label: 'Profile', href: '#', active: true },
                    { label: 'Security', href: '#' },
                    { label: 'Preferences', href: '#' },
                    { label: 'Data', href: '#' },
                  ]}
                />
              </div>
            </ComponentCard>

            {/* Tooltip */}
            <ComponentCard
              name="Tooltip"
              importLine="import { Tooltip } from '@sovereignfs/ui';"
              usage="CSS-only hover/focus hint. Four placements. Wired to its trigger via aria-describedby. No JS positioning — RSC-safe."
            >
              <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                <Tooltip content="Saved to your account" side="top">
                  <Button variant="secondary" size="sm">
                    Save
                  </Button>
                </Tooltip>
                <Tooltip content="Cannot be undone" side="right">
                  <Button variant="destructive" size="sm">
                    Delete
                  </Button>
                </Tooltip>
              </div>
            </ComponentCard>

            {/* CheckableListRow */}
            <ComponentCard
              name="CheckableListRow"
              importLine="import { CheckableListRow } from '@sovereignfs/ui';"
              usage="Whole-row tap target that toggles a checked state, with strike-through on the label — for 'tap the row to mark it done' lists (not a form checkbox)."
            >
              <CheckableListRowDemo />
            </ComponentCard>

            {/* MemberMultiSelect */}
            <ComponentCard
              name="MemberMultiSelect"
              importLine="import { MemberMultiSelect } from '@sovereignfs/ui';"
              usage="Checkbox list for picking any number of people from an already-resolved option set. Domain-agnostic about guest vs. instance-user options; pair with SuggestionInput for search + add."
            >
              <MemberMultiSelectDemo />
            </ComponentCard>

            {/* Checkbox */}
            <ComponentCard
              name="Checkbox"
              importLine="import { Checkbox } from '@sovereignfs/ui';"
              usage="Accessible checkbox with optional animated strike-through on the label when checked. Used in task lists. Tap target expands to 44px under (pointer: coarse) without growing the visible 18px box."
            >
              {(() => {
                const [a, setA] = useState(false);
                const [b, setB] = useState(true);
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <Checkbox checked={a} onChange={setA} label="Unchecked task" strikeThrough />
                    <Checkbox checked={b} onChange={setB} label="Completed task" strikeThrough />
                  </div>
                );
              })()}
            </ComponentCard>

            {/* RadioGroup */}
            <ComponentCard
              name="RadioGroup"
              importLine="import { RadioGroup } from '@sovereignfs/ui';"
              usage="Single-select list of options. Renders real <input type=radio> elements sharing one name, so arrow-key navigation between options is native browser behavior, not hand-rolled."
            >
              {(() => {
                const [size, setSize] = useState('md');
                return (
                  <RadioGroup
                    items={[
                      { label: 'Small', value: 'sm' },
                      { label: 'Medium', value: 'md' },
                      { label: 'Large', value: 'lg' },
                    ]}
                    value={size}
                    onChange={setSize}
                    aria-label="Size"
                  />
                );
              })()}
            </ComponentCard>

            {/* Slider */}
            <ComponentCard
              name="Slider"
              importLine="import { Slider } from '@sovereignfs/ui';"
              usage="Single-thumb range input. A native <input type=range> under custom styling — arrow keys, Home/End, and touch-drag all come from the browser."
            >
              {(() => {
                const [value, setValue] = useState(50);
                return (
                  <div style={{ width: 240 }}>
                    <Slider value={value} onChange={setValue} min={0} max={100} label="Volume" />
                  </div>
                );
              })()}
            </ComponentCard>

            {/* Progress */}
            <ComponentCard
              name="Progress"
              importLine="import { Progress } from '@sovereignfs/ui';"
              usage="Determinate progress bar. role=progressbar with aria-valuenow/min/max so screen readers announce the current value."
            >
              <div style={{ width: 240 }}>
                <Progress value={65} label="Upload progress" />
              </div>
            </ComponentCard>

            {/* Table */}
            <ComponentCard
              name="Table"
              importLine="import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from '@sovereignfs/ui';"
              usage="Thin, styled wrappers around the native table elements. Not a data grid — no sort/filter/virtualization. Scrolls horizontally (masked-edge fade) at any viewport size."
            >
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Plugin</TableHeaderCell>
                    <TableHeaderCell>Status</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  <TableRow>
                    <TableCell>sovereign-tasks</TableCell>
                    <TableCell>Active</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>sovereign-shopper</TableCell>
                    <TableCell>Disabled</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </ComponentCard>

            {/* Alert */}
            <ComponentCard
              name="Alert"
              importLine="import { Alert } from '@sovereignfs/ui';"
              usage="Inline, non-dismissible banner. Distinct from Toast (transient) and SystemBanner (instance-wide) — for form-level errors or explaining an empty/blocked state. Leading icon defaults per variant; pass icon to override or icon={false} to suppress."
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Alert variant="error" heading="Something went wrong">
                  We couldn’t save your changes. Check your connection and try again.
                </Alert>
                <Alert variant="success">Invite sent.</Alert>
                <Alert variant="neutral">This project has no members yet.</Alert>
              </div>
            </ComponentCard>

            {/* Breadcrumb */}
            <ComponentCard
              name="Breadcrumb"
              importLine="import { Breadcrumb } from '@sovereignfs/ui';"
              usage="Link trail. The last item (no href) renders as plain text with aria-current=page. Pass renderLink to keep navigation client-side inside overlay-shell plugins."
            >
              <Breadcrumb
                items={[
                  { label: 'Console', href: '/console' },
                  { label: 'Plugins', href: '/console/plugins' },
                  { label: 'sovereign-tasks' },
                ]}
              />
            </ComponentCard>

            {/* Pagination */}
            <ComponentCard
              name="Pagination"
              importLine="import { Pagination } from '@sovereignfs/ui';"
              usage="Page-number / prev-next control. Shows first, last, and pages near the current one, with an ellipsis for gaps once the page count grows."
            >
              {(() => {
                const [page, setPage] = useState(4);
                return <Pagination page={page} totalPages={12} onChange={setPage} />;
              })()}
            </ComponentCard>

            {/* Kbd */}
            <ComponentCard
              name="Kbd"
              importLine="import { Kbd } from '@sovereignfs/ui';"
              usage="Inline keyboard-key styling. Renders a real <kbd> element."
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Kbd>Ctrl</Kbd>
                <span>+</span>
                <Kbd>K</Kbd>
              </span>
            </ComponentCard>

            {/* Collapsible */}
            <ComponentCard
              name="Collapsible"
              importLine="import { Collapsible } from '@sovereignfs/ui';"
              usage="Single expand/collapse primitive. Independently useful (e.g. a 'show more' toggle), and composed internally by Accordion."
            >
              {(() => {
                const [open, setOpen] = useState(false);
                return (
                  <Collapsible open={open} onOpenChange={setOpen} trigger="Advanced settings">
                    These settings are rarely needed — change them only if you know what you're
                    doing.
                  </Collapsible>
                );
              })()}
            </ComponentCard>

            {/* Accordion */}
            <ComponentCard
              name="Accordion"
              importLine="import { Accordion } from '@sovereignfs/ui';"
              usage="One or more Collapsible sections. type=single closes other sections when one opens; type=multiple allows any number open at once."
            >
              {(() => {
                const [openIds, setOpenIds] = useState<string[]>(['plugins']);
                return (
                  <Accordion
                    items={[
                      {
                        id: 'plugins',
                        trigger: 'What plugins ship by default?',
                        content:
                          'Only the platform plugins (Console, Launcher, Account) plus Sovereign Tasks.',
                      },
                      {
                        id: 'hosting',
                        trigger: 'Can I self-host this?',
                        content:
                          'Yes — Sovereign is designed to be self-hosted via Docker Compose.',
                      },
                    ]}
                    type="single"
                    openIds={openIds}
                    onOpenIdsChange={setOpenIds}
                  />
                );
              })()}
            </ComponentCard>

            {/* AspectRatio */}
            <ComponentCard
              name="AspectRatio"
              importLine="import { AspectRatio } from '@sovereignfs/ui';"
              usage="Constrains content (image, video, embed) to a fixed ratio."
            >
              <div style={{ width: 200 }}>
                <AspectRatio ratio={16 / 9}>
                  <div
                    style={{
                      width: '100%',
                      height: '100%',
                      background: 'var(--sv-color-surface-sunken)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--sv-color-text-muted)',
                      fontSize: 'var(--sv-font-size-xs)',
                    }}
                  >
                    16:9
                  </div>
                </AspectRatio>
              </div>
            </ComponentCard>

            {/* ButtonGroup */}
            <ComponentCard
              name="ButtonGroup"
              importLine="import { ButtonGroup } from '@sovereignfs/ui';"
              usage="Visually joins adjacent Buttons into one control (shared border, connected corners)."
            >
              <ButtonGroup aria-label="View">
                <Button variant="secondary" size="sm">
                  Day
                </Button>
                <Button variant="secondary" size="sm">
                  Week
                </Button>
                <Button variant="secondary" size="sm">
                  Month
                </Button>
              </ButtonGroup>
            </ComponentCard>

            {/* Item */}
            <ComponentCard
              name="Item"
              importLine="import { Item } from '@sovereignfs/ui';"
              usage="Generic row primitive: leading slot, title + optional description, trailing slot. For settings rows and list rows that don't fit Menu's own item shape."
            >
              <Item
                title="Notifications"
                description="Manage email and push alerts"
                leading={<Icon name="bell" aria-hidden />}
                trailing={<Icon name="chevron-right" size="sm" aria-hidden />}
                onClick={() => {}}
              />
            </ComponentCard>

            {/* Label */}
            <ComponentCard
              name="Label"
              importLine="import { Label } from '@sovereignfs/ui';"
              usage="Standalone accessible form label, independent of FormField. Use FormField when a control needs hint/error text too."
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <Label htmlFor="label-demo-input">Email address</Label>
                <input
                  id="label-demo-input"
                  type="email"
                  placeholder="you@example.com"
                  style={{
                    padding: 'var(--sv-space-2) var(--sv-space-3)',
                    border: '1px solid var(--sv-color-border-strong)',
                    borderRadius: 'var(--sv-radius-md)',
                    fontFamily: 'var(--sv-font-family)',
                    fontSize: 'var(--sv-font-size-sm)',
                  }}
                />
              </div>
            </ComponentCard>

            {/* ScrollArea */}
            <ComponentCard
              name="ScrollArea"
              importLine="import { ScrollArea } from '@sovereignfs/ui';"
              usage="Styled scrollable container — thin, token-colored scrollbar instead of the OS default. Native overflow scrolling underneath."
            >
              <ScrollArea maxHeight={120}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 4 }}>
                  {Array.from({ length: 10 }, (_, i) => (
                    <div key={i} style={{ fontSize: 13 }}>
                      Row {i + 1}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </ComponentCard>

            {/* Typography */}
            <ComponentCard
              name="Typography"
              importLine="import { Typography } from '@sovereignfs/ui';"
              usage="Text bound to the design system's font-size/weight scale. Pass `as` to override the rendered tag while keeping the variant's visual style."
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Typography variant="h3">Heading 3</Typography>
                <Typography variant="body">Body copy for descriptions.</Typography>
                <Typography variant="caption">Caption — secondary text.</Typography>
              </div>
            </ComponentCard>

            {/* Marker */}
            <ComponentCard
              name="Marker"
              importLine="import { Marker } from '@sovereignfs/ui';"
              usage="Inline citation/reference marker — attributes part of an assistant answer to a source (Sovereign Harness 'source trace', RFC 0040)."
            >
              <p style={{ fontSize: 14, margin: 0 }}>
                Your next task is due Thursday
                <Marker index={1} label="Source: Tasks" onClick={() => {}} />.
              </p>
            </ComponentCard>

            {/* Message */}
            <ComponentCard
              name="Message"
              importLine="import { Message } from '@sovereignfs/ui';"
              usage="A single chat turn for the Sovereign Harness assistant. role is user/assistant/tool, matching harness_messages (RFC 0040). Content is caller-controlled ReactNode."
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Message sender="user">What's on my plate this week?</Message>
                <Message sender="assistant">You have 3 tasks due this week.</Message>
              </div>
            </ComponentCard>

            {/* MessageScroller */}
            <ComponentCard
              name="MessageScroller"
              importLine="import { MessageScroller } from '@sovereignfs/ui';"
              usage="Auto-scrolling chat container. Scrolls to the newest message while the user is near the bottom; shows a 'New messages' button instead of yanking them down if they've scrolled up."
            >
              <div style={{ height: 160, border: '1px solid var(--sv-color-border)' }}>
                <MessageScroller>
                  <Message sender="user">Hi there</Message>
                  <Message sender="assistant">How can I help?</Message>
                </MessageScroller>
              </div>
            </ComponentCard>

            {/* HoverCard */}
            <ComponentCard
              name="HoverCard"
              importLine="import { HoverCard } from '@sovereignfs/ui';"
              usage="Hover-triggered popover on desktop, tap-to-toggle on touch. Built on Popover for positioning — adds hover-intent timing and the touch fallback. Opens on keyboard focus too."
            >
              <HoverCard
                aria-label="User preview"
                trigger={
                  <button
                    type="button"
                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                  >
                    <Avatar name="Jane Smith" size="sm" />
                  </button>
                }
              >
                <div style={{ padding: 'var(--sv-space-3)', fontSize: 14 }}>
                  <div style={{ fontWeight: 600 }}>Jane Smith</div>
                  <div style={{ color: 'var(--sv-color-text-muted)' }}>jane@example.com</div>
                </div>
              </HoverCard>
            </ComponentCard>

            {/* ContextMenu */}
            <ComponentCard
              name="ContextMenu"
              importLine="import { ContextMenu } from '@sovereignfs/ui';"
              usage="Right-click menu on desktop, long-press on touch. Desktop positioning reuses Popover's collision detection anchored to the click point; touch opens the same items in a Drawer."
            >
              <ContextMenu
                aria-label="Row actions"
                items={[
                  { label: 'Rename', onSelect: () => {} },
                  { label: 'Duplicate', onSelect: () => {} },
                  { type: 'separator' },
                  { label: 'Delete', destructive: true, onSelect: () => {} },
                ]}
              >
                <div
                  style={{
                    padding: 'var(--sv-space-4)',
                    border: '1px dashed var(--sv-color-border-strong)',
                    borderRadius: 'var(--sv-radius-md)',
                    textAlign: 'center',
                    fontSize: 14,
                    color: 'var(--sv-color-text-muted)',
                  }}
                >
                  Right-click here
                </div>
              </ContextMenu>
            </ComponentCard>

            {/* NavigationMenu */}
            <ComponentCard
              name="NavigationMenu"
              importLine="import { NavigationMenu } from '@sovereignfs/ui';"
              usage="Top-level nav bar where some items open a flyout panel. Desktop-oriented — a hover-triggered flyout bar has no mobile equivalent."
            >
              <NavigationMenu
                aria-label="Main"
                items={[
                  { label: 'Home', href: '/home' },
                  {
                    label: 'Products',
                    content: (
                      <div style={{ padding: 'var(--sv-space-3)', fontSize: 14 }}>
                        Tasks · Ledger · Shopper
                      </div>
                    ),
                  },
                ]}
              />
            </ComponentCard>

            {/* Menubar */}
            <ComponentCard
              name="Menubar"
              importLine="import { Menubar } from '@sovereignfs/ui';"
              usage="Desktop app-style menu bar (File/Edit/View...). A thin composition of NavigationMenu with MenuEntries as each item's flyout content."
            >
              <Menubar
                menus={[
                  {
                    label: 'File',
                    items: [
                      { label: 'New conversation', onSelect: () => {} },
                      { label: 'Export', onSelect: () => {} },
                    ],
                  },
                  {
                    label: 'Edit',
                    items: [
                      { label: 'Undo', onSelect: () => {} },
                      { label: 'Redo', onSelect: () => {} },
                    ],
                  },
                ]}
              />
            </ComponentCard>

            {/* Command */}
            <ComponentCard
              name="Command"
              importLine="import { Command } from '@sovereignfs/ui';"
              usage="⌘K-style command palette. Opened via Dialog for the modal shell — adds the search input, substring filtering, and arrow-key/Enter selection. Controlled: consumer owns the open state."
            >
              <CommandDemo />
            </ComponentCard>

            {/* Resizable */}
            <ComponentCard
              name="Resizable"
              importLine="import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@sovereignfs/ui';"
              usage="A row or column of resizable panes. Each handle resizes only its two immediate neighbor panels. Desktop-oriented — panels render at their default sizes on touch."
            >
              <div style={{ width: '100%', height: 160 }}>
                <ResizablePanelGroup direction="horizontal">
                  <ResizablePanel defaultSize={30} minSize={15} maxSize={50}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        height: '100%',
                        fontSize: 14,
                        color: 'var(--sv-color-text-muted)',
                      }}
                    >
                      Sidebar
                    </div>
                  </ResizablePanel>
                  <ResizableHandle aria-label="Resize sidebar" />
                  <ResizablePanel defaultSize={70}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        height: '100%',
                        fontSize: 14,
                        color: 'var(--sv-color-text-muted)',
                      }}
                    >
                      Content
                    </div>
                  </ResizablePanel>
                </ResizablePanelGroup>
              </div>
            </ComponentCard>

            {/* DataTable */}
            <ComponentCard
              name="DataTable"
              importLine="import { DataTable } from '@sovereignfs/ui';"
              usage="Sortable table built on Table. Column-driven: pass columns + data instead of composing TableRow/TableCell by hand. Clicking a sortable header cycles ascending → descending → unsorted."
            >
              <DataTable
                columns={[
                  { key: 'name', header: 'Plugin', sortable: true },
                  { key: 'installs', header: 'Installs', sortable: true, align: 'end' },
                ]}
                data={[
                  { id: 'tasks', name: 'sovereign-tasks', installs: 482 },
                  { id: 'ledger', name: 'sovereign-ledger', installs: 219 },
                  { id: 'shopper', name: 'sovereign-shopper', installs: 37 },
                ]}
                getRowKey={(row) => row.id}
              />
            </ComponentCard>

            {/* Combobox */}
            <ComponentCard
              name="Combobox"
              importLine="import { Combobox } from '@sovereignfs/ui';"
              usage="A searchable single-select: Popover on desktop, a bottom-sheet Drawer on mobile. For a short fixed list where search adds no value, use Select's native <select> instead."
            >
              <ComboboxDemo />
            </ComponentCard>

            {/* DragHandleRow */}
            <ComponentCard
              name="DragHandleRow"
              importLine="import { DragHandleRow } from '@sovereignfs/ui';"
              usage="Row wrapper with a drag handle that appears on hover. Attach dnd-kit sortable props via handleProps."
            >
              <div style={{ width: '100%' }}>
                {['First item', 'Second item', 'Third item'].map((label) => (
                  <DragHandleRow key={label}>
                    <div
                      style={{
                        padding: 'var(--sv-space-2) var(--sv-space-1)',
                        fontSize: 'var(--sv-font-size-sm)',
                        color: 'var(--sv-color-text-primary)',
                        borderBottom: '1px solid var(--sv-color-border)',
                      }}
                    >
                      {label}
                    </div>
                  </DragHandleRow>
                ))}
              </div>
            </ComponentCard>

            {/* FileDropzone */}
            <ComponentCard
              name="FileDropzone"
              importLine="import { FileDropzone } from '@sovereignfs/ui';"
              usage="Styled drag-and-drop file picker — a dashed-border dropzone wrapping a visually-hidden native file input. Caller owns selected-file state and passes label/hint accordingly."
            >
              <FileDropzoneDemo />
            </ComponentCard>

            {/* ResponsiveSurface */}
            <ComponentCard
              name="ResponsiveSurface"
              importLine="import { ResponsiveSurface } from '@sovereignfs/ui';"
              usage="Renders an entirely different component tree below a breakpoint, not a CSS squeeze of the same one — only the active side is ever mounted. See also the useResponsiveLayout hook for non-JSX values."
            >
              <ResponsiveSurfaceDemo />
            </ComponentCard>

            {/* SwipableMobileCarousel */}
            <ComponentCard
              name="SwipableMobileCarousel"
              importLine="import { SwipableMobileCarousel, SwipableMobileCarouselSlide, SwipableMobileCarouselSlideHeader, SwipableMobileCarouselSlideBody } from '@sovereignfs/ui';"
              usage="Compound component for swiping between full-width slides. A Slide's Header/Footer always render; only Body's own loading prop gates its content, so a title can show immediately while the body's own fetch is still in flight. Owns mount-window/reorder mechanics only — never put cross-slide aggregation or a detail overlay inside a Slide."
            >
              <SwipableMobileCarouselDemo />
            </ComponentCard>

            {/* SwipableMobileCarouselDots */}
            <ComponentCard
              name="SwipableMobileCarouselDots"
              importLine="import { SwipableMobileCarouselDots } from '@sovereignfs/ui';"
              usage="A real, tappable, labeled slide indicator (role=tablist/tab) — standalone and reusable outside SwipableMobileCarousel too, and its default renderIndicator."
            >
              <SwipableMobileCarouselDotsDemo />
            </ComponentCard>
          </div>
        </section>

        {/* ── Theming ──────────────────────────────────────────────────── */}
        <section style={{ marginBottom: 'var(--sv-space-12)' }}>
          <SectionHeader
            title="Tenant theming"
            subtitle="The identity is monochrome by default. Tenants add brand color by overriding --sv-color-accent."
          />
          <p
            style={{
              fontSize: 'var(--sv-font-size-sm)',
              color: 'var(--sv-color-text-muted)',
              marginBottom: 'var(--sv-space-4)',
            }}
          >
            Set via the Console → Instance identity section (or the{' '}
            <code style={{ fontFamily: ffm }}>/api/instance/</code> API). Plugin CSS does not need
            to change — all components read{' '}
            <code style={{ fontFamily: ffm }}>--sv-color-accent</code> from the cascade.
          </p>
          <Code>{`/* Operator CSS override — injected by InstanceProvider */
:root {
  --sv-color-accent:        #5c6bc0;  /* brand blue */
  --sv-color-accent-hover:  #3949ab;
  --sv-color-focus-ring:    #5c6bc0;
  --sv-color-text-on-accent: #ffffff; /* must contrast with accent */
}`}</Code>

          <DemoBox style={{ marginTop: 'var(--sv-space-4)' }}>
            <Button style={{ background: '#5c6bc0', borderColor: '#5c6bc0', color: '#fff' }}>
              Themed button
            </Button>
            <span
              style={{
                display: 'inline-block',
                fontFamily: ff,
                fontSize: 'var(--sv-font-size-caption)',
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: 'var(--sv-radius-sm)',
                background: '#e8eaf6',
                color: '#3949ab',
                border: '1px solid #c5cae9',
              }}
            >
              Owner
            </span>
            <span
              style={{
                fontFamily: ff,
                fontSize: 'var(--sv-font-size-caption)',
                color: 'var(--sv-color-text-muted)',
              }}
            >
              Components read the accent token — brand applied everywhere.
            </span>
          </DemoBox>
        </section>

        {/* ── Rules ────────────────────────────────────────────────────── */}
        <section style={{ marginBottom: 'var(--sv-space-8)' }}>
          <SectionHeader
            title="Design rules"
            subtitle="The short list of things that break dark mode or instance theming if ignored."
          />
          <div
            style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sv-space-5)' }}
          >
            <div
              style={{
                background: 'var(--sv-color-success-surface)',
                border: '1px solid var(--sv-color-success-border)',
                borderRadius: 'var(--sv-radius-lg)',
                padding: 'var(--sv-space-4)',
              }}
            >
              <p
                style={{
                  fontWeight: 600,
                  color: 'var(--sv-color-success-text)',
                  marginBottom: 'var(--sv-space-3)',
                  fontSize: 'var(--sv-font-size-sm)',
                }}
              >
                ✓ Do
              </p>
              <ul
                style={{
                  margin: 0,
                  padding: '0 0 0 var(--sv-space-4)',
                  fontSize: 'var(--sv-font-size-sm)',
                  color: 'var(--sv-color-text-primary)',
                  lineHeight: 1.8,
                }}
              >
                <li>
                  Use <code style={{ fontFamily: ffm }}>--sv-color-*</code> semantic tokens
                </li>
                <li>
                  Use <code style={{ fontFamily: ffm }}>--sv-space-*</code>,{' '}
                  <code style={{ fontFamily: ffm }}>--sv-radius-*</code> scale tokens
                </li>
                <li>
                  Use <code style={{ fontFamily: ffm }}>--sv-font-family</code> and{' '}
                  <code style={{ fontFamily: ffm }}>--sv-font-family-mono</code>
                </li>
                <li>
                  Import components from <code style={{ fontFamily: ffm }}>@sovereignfs/ui</code>
                </li>
                <li>
                  Use <code style={{ fontFamily: ffm }}>--sv-shadow-*</code> for elevation
                </li>
              </ul>
            </div>
            <div
              style={{
                background: 'var(--sv-color-error-surface)',
                border: '1px solid var(--sv-color-error-border)',
                borderRadius: 'var(--sv-radius-lg)',
                padding: 'var(--sv-space-4)',
              }}
            >
              <p
                style={{
                  fontWeight: 600,
                  color: 'var(--sv-color-error-text)',
                  marginBottom: 'var(--sv-space-3)',
                  fontSize: 'var(--sv-font-size-sm)',
                }}
              >
                ✗ Don't
              </p>
              <ul
                style={{
                  margin: 0,
                  padding: '0 0 0 var(--sv-space-4)',
                  fontSize: 'var(--sv-font-size-sm)',
                  color: 'var(--sv-color-text-primary)',
                  lineHeight: 1.8,
                }}
              >
                <li>
                  Hardcode hex values like <code style={{ fontFamily: ffm }}>#333</code>
                </li>
                <li>
                  Use primitive tokens like <code style={{ fontFamily: ffm }}>--sv-grey-900</code>{' '}
                  directly
                </li>
                <li>Use Tailwind classes or runtime CSS-in-JS</li>
                <li>
                  Import from <code style={{ fontFamily: ffm }}>runtime/src</code> (SDK boundary)
                </li>
                <li>
                  Override <code style={{ fontFamily: ffm }}>--sv-color-accent</code> from plugin
                  CSS
                </li>
              </ul>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Story
// ---------------------------------------------------------------------------

const meta = {
  title: 'Overview',
  component: OverviewPage,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Complete reference for plugin developers — components, tokens, theming, and design rules in one page.',
      },
    },
  },
} satisfies Meta<typeof OverviewPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const DesignSystem: Story = {};
