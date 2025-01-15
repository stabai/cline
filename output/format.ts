const COLOR_OFFSETS = {
  black: 0,
  red: 1,
  green: 2,
  yellow: 3,
  blue: 4,
  purple: 5,
  cyan: 6,
  white: 7,
} as const;

const BRIGHT_OFFSET = 60 as const;

type Formatter = (text: string) => string;

type NormalColor = Lowercase<keyof typeof COLOR_OFFSETS>;
type BrightColor = {
  [C in NormalColor]: `bright${Capitalize<C>}`;
}[NormalColor];
export type StandardColor = NormalColor | BrightColor;
export type StandardStyle = keyof typeof style;

type ColorFormatters = Record<StandardColor, Formatter>;

function bright(text: NormalColor): BrightColor {
  return text[0].toUpperCase() + text.substring(1) as BrightColor;
}

function ansiFormatter(startCode: number, endCode: number): Formatter {
  return ((text: string) => `\x1b[${startCode}m${text}\x1b[${endCode}m`);
}

function colorFormatters(baseCode: number, resetCode: number): ColorFormatters {
  const formatters = {} as ColorFormatters;
  for (const [color, offsetCode] of Object.entries(COLOR_OFFSETS)) {
    const normalColor = color as NormalColor;
    const brightColor = bright(normalColor);
    formatters[normalColor] = ansiFormatter(baseCode + offsetCode, resetCode);
    formatters[brightColor] = ansiFormatter(baseCode + BRIGHT_OFFSET + offsetCode, resetCode);
  }
  return formatters;
}

export const fg = colorFormatters(30, 39);
export const bg = colorFormatters(40, 49);
export const style = {
  bold: ansiFormatter(1, 22),
  faint: ansiFormatter(2, 22),
  italic: ansiFormatter(3, 23),
  underline: ansiFormatter(4, 24),
  strikethrough: ansiFormatter(9, 29),
} as const;

export function format(text: string, ...formatters: Formatter[]): string {
  let s = text;
  for (const formatter of formatters) {
    s = formatter(s);
  }
  return s;
}

export function formatter(...formatters: Formatter[]): Formatter {
  return (text: string) => format(text, ...formatters);
}
