import { tags as t } from '@lezer/highlight';
import { createTheme } from './theme-helper.mjs';

export const settings = {
  background: '#000', // Black
  lineBackground: '#000', // Black
  foreground: '#FF69B4', // Pink
  caret: '#FF69B4', // Pink
  selection: 'rgba(255, 105, 180, 0.3)', // Pink with some transparency
  selectionMatch: 'rgba(255, 105, 180, 0.5)', // Pink with more transparency
  lineHighlight: 'transparent',
  gutterBackground: 'transparent',
  gutterForeground: '#FF69B4', // Pink
};

export default createTheme({
  theme: 'dark', // Meskipun transparan, ini mengacu pada mode gelap untuk beberapa elemen default
  settings,
  styles: [
    { tag: [t.atom, t.bool, t.special(t.variableName)], color: '#FF69B4' },
    { tag: t.labelName, color: '#FF69B4' },
    { tag: t.keyword, color: '#FF69B4' },
    { tag: t.operator, color: '#FF69B4' },
    { tag: t.special(t.variableName), color: '#FF69B4' },
    { tag: t.typeName, color: '#FF69B4' },
    { tag: t.atom, color: '#FF69B4' },
    { tag: t.number, color: '#FF69B4' },
    { tag: t.definition(t.variableName), color: '#FF69B4' },
    { tag: t.string, color: '#FF69B4' },
    { tag: t.special(t.string), color: '#FF69B4' },
    { tag: t.comment, color: 'rgba(255, 105, 180, 0.7)' }, // Pink with transparency for comments
    { tag: t.variableName, color: '#FF69B4' },
    { tag: t.tagName, color: '#FF69B4' },
    { tag: t.bracket, color: '#FF69B4' },
    { tag: t.meta, color: '#FF69B4' },
    { tag: t.attributeName, color: '#FF69B4' },
    { tag: t.propertyName, color: '#FF69B4' },
    { tag: t.className, color: '#FF69B4' },
    { tag: t.invalid, color: '#FF69B4' },
    { tag: [t.unit, t.punctuation], color: '#FF69B4' },
  ],
});