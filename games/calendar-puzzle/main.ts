import { startCalendarPuzzle } from './CalendarPuzzleGame';

const canvas = document.querySelector<HTMLCanvasElement>('[data-calendar-puzzle-game]');
if (canvas) void startCalendarPuzzle(canvas).catch(error => console.error(error));
