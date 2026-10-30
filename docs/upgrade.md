# Upgrading

What to do when a release changes something you depend on. Newest first. A version that is not here needs nothing from you.

A breaking change adds a note here in the same change that makes it, saying what changed and what to do
([design system §4](specs/design-system.md)). This file starts with the first published release of each package, so nothing
before that is recorded.

## `@sovereignfs/ui`

### 0.89.0

- **`NavTabs` and `SplitPane` use the one breakpoint, 768px.** `NavTabs` scrolls its tabs sideways below 768px (it was 640px) and
  `SplitPane` stacks its two panes below 768px (it was 720px). Between those widths a layout that relied on the old points now
  changes earlier. Nothing in the props changed.
- **`FileDropzone` can be reached with the keyboard.** Its file input was hidden with `display: none`, which took it out of the tab
  order. It is now hidden to the eye only, and the dropzone shows a focus ring. A form's `required` on it now works.
- **`Dialog` and `Drawer` move focus into the panel when they are opened**, as `Sheet` already did. Focus returns to what opened
  them when they close, after their exit animation. A test that expected focus to stay on the opener while they were open needs
  the new behaviour.

## Core

No migration notes yet.
