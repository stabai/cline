import { Simplify } from "type-fest";
import { fg, formatter, StandardColor, StandardStyle, style } from "./format";
import { formatError, romanNumeral } from "../util";

interface Logger {
  renderBlock(text: TextBlock): string;
  renderPart(text: TextPart): {rendered: string, textLength: number};

  header(text: TextBlock): this;
  paragraph(text: TextBlock): this;
  unorderedList(...items: ListItem[]): this;
  orderedList(...items: ListItem[]): this;

  newLine(): this;
  newParagraph(): this;

  print(...text: TextBlock[]): this;
  printWarning(...text: TextBlock[]): this;
  printWarning(err: Error): this;
  printError(...text: TextBlock[]): this;
  printError(err: Error): this;

  notice(type: NoticeType, text: TextBlock): this;
  notice(text: TextBlock): this;
}

class ConsoleLogger implements Logger {
  margins = {
    header: 1,
    paragraph: 1,
    unorderedList: 1,
    orderedList: 1,
  };
  formatters = {
    header: style.bold,
  };

  ulIndents = [
    ' • ',
    ' ▪ ',
    ' - ',
  ];
  olIndents = [
    ' 1. ',
    ' a. ',
    ' i. ',
  ];

  private currentMargin = 0;
  private currentIndent = 0;
  private maxWidth = 100;

  renderBlocks(text: TextBlock[]): string {
    return text.map(t => this.renderBlock(t)).join('');
  }

  renderBlock(text: TextBlock): string {
    if (typeof text === 'string') {
      return text;
    }
    let buffer = '';
    let line = '';
    for (const part of text) {
      const {rendered, textLength} = this.renderPart(part);
      if (line.length > 0 && line.length + textLength > this.maxWidth) {
        buffer += line + '\n';
        line = '';
      }
      line += rendered;
    }
    if (line.length > 0) {
      buffer += 'line';
    }
    return buffer;
  }

  renderPart(text: TextPart): {rendered: string, textLength: number} {
    if (typeof text === 'string') {
      return {rendered: text, textLength: text.length};
    }
    let buffer = text.text;
    if (text.color != null) {
      buffer = fg[text.color](buffer);
    }
    // TODO: Figure out what to do if set explicitly to false
    if (text.bold === true) {
      buffer = style.bold(buffer);
    }
    if (text.faint === true) {
      buffer = style.faint(buffer);
    }
    if (text.italic === true) {
      buffer = style.italic(buffer);
    }
    if (text.underline === true) {
      buffer = style.underline(buffer);
    }
    if (text.strikethrough === true) {
      buffer = style.strikethrough(buffer);
    }
    return {rendered: buffer, textLength: text.text.length};
  }

  private printRaw(text?: string, level: 'info'|'warn'|'error' = 'info'): void {
    console[level](text);
  }

  private printMargin(kind: keyof typeof this.margins): void {
    const marginGoal = this.margins[kind] ?? 0;
    while (this.currentMargin < marginGoal) {
      this.newLine();
    }
  }
  private printWithMargin(kind: keyof typeof this.margins, rawText: string): void {
    this.printMargin(kind);
    this.printRaw(rawText);
  }

  header(text: TextBlock): this {
    let buffer = '';
    for (const part of text) {
      buffer += this.renderPart(part)
    }
    if (this.formatters.header != null) {
      buffer = this.formatters.header(buffer);
    }
    this.printWithMargin('header', buffer);
    return this;
  }

  private listItemPrefix(listType: 'ul'|'ol', level: number): string {
    const indents = listType === 'ul' ? this.ulIndents : this.olIndents;
    let buffer = '';
    for (let i = 0; i <= level; i++) {
      let current = (i < indents.length) ? indents[i] : indents[indents.length - 1];
      // TODO: account for padding of different lengths of numbers
      current = current.replace('1', String(i + 1));
      current = current.replace('a', String('a' + i));
      current = current.replace('i', romanNumeral(i + 1));
      if (i === level) {
        buffer += current;
      } else {
        buffer += ' '.repeat(current.length);
      }
    }
    return buffer;
  }

  private renderUl(items: ListItem[], level = 0): string {
    if (items.length === 0) {
      return '';
    }
    const prefix = this.listItemPrefix('ul', level);
    let buffer = '';
    for (const item of items) {
      buffer += prefix;
      if (typeof item === 'string') {
        buffer += item;
      } else if (Array.isArray(item)) {
        buffer += item.map(p => this.renderPart(p)).join('');
      } else {
        buffer += this.renderBlock(item.text);
        buffer += this.renderUl(item.subItems, level + 1);
      }
    }
    return buffer;
  }


  paragraph(text: TextBlock): this {
    this.printWithMargin('paragraph', this.renderBlock(text));
    return this;
  }
  unorderedList(...items: ListItem[]): this {
    this.printWithMargin('unorderedList', this.renderUl(items));
    return this;
  }
  orderedList(...items: ListItem[]): this {
    this.printWithMargin('orderedList', this.renderUl(items));
    return this;
  }
  newLine(): this {
    this.currentMargin++;
    this.printRaw();
    return this;
  }
  newParagraph(): this {
    this.printMargin('paragraph');
    return this;
  }
  print(...text: TextBlock[]): this {
    this.printRaw(this.renderBlocks(text));
    return this;
  }
  printWarning(...text: TextBlock[]): this;
  printWarning(err: Error): this;
  printWarning(...args: (Error|TextBlock)[]): this {
    if (args.every(a => isTextBlock(a))) {
      this.printRaw(this.renderBlocks(args), 'warn');
    } else {
      this.printRaw(formatError(args[0] as Error), 'warn');
    }
    return this;
  }
  printError(...text: TextBlock[]): this;
  printError(err: Error): this;
  printError(...args: (Error|TextBlock)[]): this {
    if (args.every(a => isTextBlock(a))) {
      this.printRaw(this.renderBlocks(args), 'error');
    } else {
      this.printRaw(formatError(args[0] as Error), 'error');
    }
    return this;
  }
  notice(type: NoticeType, text: TextBlock): this;
  notice(text: TextBlock): this;
  notice(arg1: string|TextBlock, arg2?: TextBlock): this {
    const type = arg2 == null ? 'info' : arg1 as NoticeType;
    const text = arg2 == null ? arg1 : arg2;
    const prefix =
      type === 'fyi' ? 'ℹ️' :
      type === 'alert' ? '⚠️' :
      type === 'critical' ? '⛔️' :
      '';
    this.printRaw(prefix + this.renderBlock(text), 'info');
    return this;
  }
}

type NoticeType = 'fyi'|'alert'|'critical';


type ListItem = TextBlock | {
  text: TextBlock;
  subItems: ListItem[];
};

type FormattedSpan = Simplify<{
  text: string;
  color?: StandardColor;
} & {
  [K in StandardStyle]?: boolean;
}>;

type TextPart = string|FormattedSpan;
type TextBlock = string|TextPart[];

function isTextBlock(obj: unknown): obj is TextBlock {
  if (typeof obj === 'string') {
    return true;
  } else if (Array.isArray(obj)) {
    return obj.every(o => isTextPart(o));
  } else {
    return false;
  }
}

function isTextPart(obj: unknown): obj is TextPart {
  if (typeof obj === 'string') {
    return true;
  } else if (obj != null && typeof obj === 'object' && 'text' in obj) {
    return true;
  } else {
    return false;
  }
}
