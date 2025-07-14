import { tags as t } from '@lezer/highlight';
import { createTheme } from './theme-helper.mjs';

const background = '#c0c0c0';
const foreground = '#ff4fa3';
const selection = '#ff4fa330';
const comment = '#999';
const keyword = '#ff69b4';
const number = '#ff69b4';
const string = '#ff69b4';
const variableName = '#ff4fa3';
const functionName = '#ff4fa3';
const propertyName = '#ff4fa3';

export const settings = {
  background,
  lineBackground: 'transparent',
  foreground,
  selection,
  gutterBackground: background,
  gutterForeground: comment,
  gutterBorder: 'transparent',
  lineHighlight: '#00000010',
};

export default createTheme({
  theme: 'light',
  settings,
  styles: [
    {
      tag: [t.function(t.variableName), t.function(t.propertyName), t.url, t.processingInstruction],
      color: functionName,
    },
    { tag: [t.atom, t.bool, t.special(t.variableName)], color: number },
    { tag: t.comment, color: comment },
    { tag: [t.variableName, t.labelName], color: variableName },
    { tag: t.propertyName, color: propertyName },
    { tag: [t.attributeName, t.number], color: number },
    { tag: t.keyword, color: keyword },
    { tag: [t.string, t.regexp, t.special(t.propertyName)], color: string },
  ],
});