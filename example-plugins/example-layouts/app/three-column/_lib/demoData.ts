export interface DemoList {
  id: string;
  name: string;
}

export interface DemoItem {
  id: string;
  listId: string;
  title: string;
  notes: string;
}

// Stand-ins for what a real plugin's data would be (Tasks' lists/tasks,
// Shopper's lists/items, ...). This plugin is a layout showcase, not a data
// app — there is deliberately no fetch, no SDK call, no persistence here.
// Shared by both the desktop (ThreeColumnLayout) and mobile (stacked
// fallback) trees so they demonstrate the same data, not two disconnected
// demos.
export const LISTS: DemoList[] = [
  { id: 'groceries', name: 'Groceries' },
  { id: 'work', name: 'Work' },
  { id: 'personal', name: 'Personal' },
];

export const ITEMS: DemoItem[] = [
  { id: 'milk', listId: 'groceries', title: 'Buy milk', notes: 'Whole milk, 1 gallon.' },
  {
    id: 'eggs',
    listId: 'groceries',
    title: 'Buy eggs',
    notes: 'A dozen, free-range if available.',
  },
  {
    id: 'report',
    listId: 'work',
    title: 'Finish quarterly report',
    notes: 'Due Friday. Draft is in the shared doc.',
  },
  { id: 'standup', listId: 'work', title: 'Prep standup notes', notes: '' },
  {
    id: 'plumber',
    listId: 'personal',
    title: 'Call plumber',
    notes: 'Kitchen sink is still leaking.',
  },
];
