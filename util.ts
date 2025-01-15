import { StringKeyOf } from "type-fest";

export function isNil<T>(value: T|null|undefined): value is T {
  return value == null;
}
export function isNotNil<T>(value: T|null|undefined): value is T {
  return value != null;
}
export function isNilOrEmpty<T extends string|{length: number}|{size:number}>(value: T|null|undefined): value is null|undefined|(T & (""|{length: 0}|{size: 0})) {
  if (value == null) {
    return true;
  } else if (typeof value !== 'object' || 'length' in value) {
    return value.length === 0;
  } else {
    return value.size === 0;
  }
}
export function isNotNilOrEmpty<T extends string|{length: number}|{size:number}>(value: T|null|undefined): value is T {
  return !isNilOrEmpty(value);
}

export type RemovePrefix<Text extends string, Prefix extends string, Fallback = Text> = Text extends `${Prefix}${infer Rest}` ? Rest : Fallback;

export type FilterAndRemoveKeyPrefix<T extends Record<string, unknown>, Prefix extends string> = {
  [K in StringKeyOf<T> as RemovePrefix<K, Prefix, never>]: T[K];
};

export type AddKeyPrefix<T extends Record<string, unknown>, Prefix extends string> = {
  [K in StringKeyOf<T> as `${Prefix}${K}`]: T[K];
};

export function removePrefix<Text extends string, Prefix extends string>(text: Text, prefix: Prefix): RemovePrefix<Text, Prefix> {
  if (isNotNilOrEmpty(prefix) && text.startsWith(prefix)) {
    return text.substring(prefix.length) as RemovePrefix<Text, Prefix>;
  } else {
    return text as RemovePrefix<Text, Prefix>;
  }
}

export function splitOnceOrZero(text: string, options: {separator: string, trim?: boolean}): ([string]|[string, string]) {
  const pos = text.indexOf(options.separator);
  if (pos < 0) {
    return [text];
  }
  const left = text.substring(0, pos);
  const right = text.substring(pos + 1);
  if (options.trim === true) {
    return [left.trim(), right.trim()];
  } else {
    return [left, right];
  }
}

export function splitOnceOrFail(text: string, options: {separator: string, trim?: boolean}): [string, string] {
  const split = splitOnceOrZero(text, options);
  if (split.length !== 2) {
    throw new Error(`Expected exactly one separator in '${text}'`);
  } else {
    return split;
  }
}

export function identity<T>(value: T): T {
  return value;
}

export function romanNumeral(value: number): string {
  let remainder = value;
  let buffer = '';
  while (remainder > 0) {
    if (remainder >= 100) {
      buffer += 'c';
      remainder -= 100;
    } else if (remainder >= 90) {
      buffer += 'xc';
      remainder -= 90;
    } else if (remainder >= 50) {
      buffer += 'l';
      remainder -= 50;
    } else if (remainder >= 40) {
      buffer += 'xl';
      remainder -= 40;
    } else if (remainder >= 10) {
      buffer += 'x';
      remainder -= 10;
    } else if (remainder >= 9) {
      buffer += 'ix';
      remainder -= 9;
    } else if (remainder >= 5) {
      buffer += 'v';
      remainder -= 5;
    } else if (remainder >= 4) {
      buffer += 'iv';
      remainder -= 4;
    } else {
      buffer += 'i';
      remainder -= 1;
    }
  }
  return buffer;
}

export function wrap(text: string, maxWidth: number): string {
  let buffer = '';
  let remainder = text;
  while (remainder.length > 0) {
    if (buffer.length > 0) {
      buffer += '\n';
    }
    if (remainder.length <= maxWidth) {
      buffer += remainder;
      break;
    }
    let lastWrapPos = -1;
    let hardNewLine = false;
    for (let i = 0; i < maxWidth; i++) {
      if (remainder[i] === '\n') {
        lastWrapPos = i;
        hardNewLine = true;
        break;
      } else if (/[\s,\.\?\!]/.test(remainder[i])) {
        lastWrapPos = i;
      }
    }
    if (lastWrapPos < 0) {
      lastWrapPos = maxWidth;
    }
    buffer += remainder.substring(0, lastWrapPos + 1).trimEnd();
    remainder = remainder.substring(lastWrapPos + 1);
    if (hardNewLine) {
      remainder = remainder.trimStart();
    }
  }
  return buffer;
}

export function formatError(ex: Error|string): string {
  if (typeof ex === 'string') {
    return ex;
  } else {
    const errorName = (ex.name && ex.name.toLowerCase() !== 'error') ? ex.name : '';
    const errorMessage = ex.message || '';
    const errorFull = (errorName && errorMessage) ? `${errorName} - ${errorMessage}` : (errorName + errorMessage);
    return errorFull;
  }
}