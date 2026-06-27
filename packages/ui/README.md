# @sovereignfs/ui

Sovereign Design System — design tokens and React components for building [Sovereign](https://github.com/sovereignfs/sovereign) plugins.

## Installation

```bash
npm install @sovereignfs/ui
# pnpm add @sovereignfs/ui
```

**Peer dependencies:** React 19+

## Usage

### Components

```tsx
import { Button, Input, Card, Dialog, Drawer } from '@sovereignfs/ui';
```

Available components: `Avatar`, `Badge`, `Button`, `Card`, `Dialog`, `Drawer`, `EmptyState`, `FormField`, `Icon`, `Input`, `NavTabs`, `PageHeader`, `Popover`, `SegmentedControl`, `Select`, `Spinner`, `SystemBanner`, `Tabs`, `Toast` / `useToast`, `Toggle`, `Tooltip`.

### Tokens

The Sovereign runtime injects design tokens globally. Reference them directly in your CSS — no import needed at runtime:

```css
.my-component {
  color: var(--sv-color-text-primary);
  background: var(--sv-color-surface);
  padding: var(--sv-space-4);
  border-radius: var(--sv-radius-md);
}
```

If you need tokens outside the Sovereign runtime (e.g. Storybook, standalone use), import the CSS file:

```ts
import '@sovereignfs/ui/tokens.css';
```

### Token architecture

Tokens follow a two-tier model:

```
Primitive tokens   --sv-grey-50 … --sv-grey-950  /  --sv-space-1 … --sv-space-16
                          │
                          ▼ mapped by semantic layer
Semantic tokens    --sv-color-surface  /  --sv-color-text-primary  /  --sv-shadow-card
```

Plugin developers reference **semantic tokens** — never primitive colours directly. Dark mode and instance theming work by swapping semantic token values; no component changes required.

## Icon component

```tsx
import { Icon } from '@sovereignfs/ui';

<Icon name="bell" size={20} />;
```

Available icon names: `activity`, `alert-triangle`, `bell`, `check`, `chevron-down`, `chevron-left`, `chevron-right`, `chevron-up`, `eye`, `eye-off`, `grid-2x2`, `house`, `info`, `lock`, `log-out`, `mail`, `package`, `pencil`, `plus`, `rotate-ccw`, `search`, `settings`, `shield`, `sliders-horizontal`, `terminal`, `trash-2`, `user`, `x`.

## Documentation

- [Storybook — live component & token gallery](https://sovereignfs.github.io/storybook)
- [Design system reference](https://github.com/sovereignfs/sovereign/blob/main/docs/design-system.md)
- [Plugin development guide](https://github.com/sovereignfs/sovereign/blob/main/docs/plugin-development.md)
- [SDK stability & semver policy](https://github.com/sovereignfs/sovereign/blob/main/docs/sdk-stability.md)

## License

AGPL-3.0-or-later
