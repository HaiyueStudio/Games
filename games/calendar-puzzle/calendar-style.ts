/** Shared appearance for the puzzle board and its calendar/history view. */
export const CALENDAR_STYLE = {
  panel: { background: '#dfeee6', border: '#b7d6c8', radius: 24, borderWidth: 2 },
  cell: { background: '#ffffff', border: '#c9ded4', radius: 7, text: '#416259' },
  selected: { background: '#c6efe6', border: '#17847b', text: '#0d786b' },
  completed: '#cfedce',
} as const;
