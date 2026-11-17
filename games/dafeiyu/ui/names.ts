import { spelling } from '../rules/syntax';

const characterNames = new Map([
  ['baba', '大肥鱼'],
  ['keke', 'Luna'],
]);

export const characterLabel = (name: string): string | undefined => characterNames.get(spelling(name));
