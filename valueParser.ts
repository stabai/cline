import { identity, splitOnceOrZero, splitOnceOrFail } from "./util";

export type Parser<Type> = (text: string) => Type;

export interface ParserRegistryOptions {
  parsers: Record<string, Parser<unknown>>;
  arraySeparator?: string;
  recordKeyValueSeparator?: string;
  recordEntrySeparator?: string;
}

export class ParserRegistry {
  private readonly parsers: Record<string, Parser<unknown>>;
  readonly arraySeparator: string;
  readonly recordEntrySeparator: string;
  readonly recordKeyValueSeparator: string;

  constructor(options: ParserRegistryOptions) {
    this.parsers = {
      'string': String,
      'number': Number,
      'bigint': BigInt,
      'boolean': Boolean,
      'date': Date.parse,
      'undefined': identity,
      'unknown': identity,
      'any': identity,
      ...options.parsers,
    };
      this.arraySeparator = options.arraySeparator ?? ',';
      this.recordEntrySeparator = options.recordEntrySeparator ?? ',';
      this.recordKeyValueSeparator = options.recordKeyValueSeparator ?? '=';
  }

  parse(typeName: string, text: string): unknown {
    if (typeName in this.parsers) {
      return this.parsers[typeName](text);
    }
    const parsedTypeName = parseTypeName(typeName);
    if (ARRAY_BASE_TYPE_NAMES.includes(parsedTypeName.typeName as ArrayBaseTypeName)) {
      const [elementTypeName] = parsedTypeName.typeParameters.map(t => t.typeName);
      return this.parseArray(elementTypeName, text);
    } else if (RECORD_BASE_TYPE_NAMES.includes(parsedTypeName.typeName as RecordBaseTypeName)) {
      const [keyTypeName, valueTypeName] = parsedTypeName.typeParameters.map(t => t.typeName);
      return this.parseRecord(keyTypeName as KeyBaseTypeName, valueTypeName, text);
    } else {
      throw new Error(`No parser for type: ${typeName}`);
    }
  }

  private parseArray(elementTypeName: string, text: string): unknown[] {
    const reader = this.parsers[elementTypeName];
    if (reader == null) {
      throw new Error(`No parser for type: ${elementTypeName}`);
    }
    return text.split(this.arraySeparator).map(t => reader(t));
  }

  private parseRecord(keyTypeName: KeyBaseTypeName, valueTypeName: string, text: string): Record<string|number, unknown> {
    const keyReader = this.parsers[keyTypeName];
    const valueReader = this.parsers[valueTypeName];
    if (keyReader == null) {
      throw new Error(`No parser for type: ${keyTypeName}`);
    }
    if (valueReader == null) {
      throw new Error(`No parser for type: ${valueTypeName}`);
    }
    const entryStrings = text.split(this.recordEntrySeparator);
    const entryTuples = entryStrings.map(s => splitOnceOrZero(s, {separator: this.recordKeyValueSeparator}));
    const typedEntries = entryTuples.map(([key, value]) => [keyReader(key), value == null ? undefined : valueReader(value)]);
    return Object.fromEntries(typedEntries);
  }
}

function getArrayElementTypeName<T extends string>(typeName: ArrayTypeName<T>): T {
  if (typeName.endsWith('[]')) {
    return typeName.substring(0, typeName.length - 2) as T;
  } else {
    const begin = typeName.indexOf('<');
    const end = typeName.lastIndexOf('>');
    return typeName.substring(begin + 1, end) as T;
  }
}

function getMapEntryTypeName<Key extends KeyBaseTypeName, Value extends string>(typeName: RecordTypeName<Key, string>): {keyTypeName: Key, valueTypeName: Value} {
  const begin = typeName.indexOf('<');
  const end = typeName.lastIndexOf('>');
  const entry = typeName.substring(begin + 1, end);
  const [keyTypeName, valueTypeName] = splitOnceOrFail(entry, {separator: ',', trim: true}) as [Key, Value];
  return {keyTypeName, valueTypeName};
}

class StringReader {
  constructor(private readonly str: String, private position = 0) {}

  read(): string|undefined {
    return this.str[this.position++];
  }
  eof(): boolean {
    return this.position >= this.str.length;
  }
}

interface GenericTypeName {
  typeName: string;
  typeParameters: GenericTypeName[]
}

function parseTypeName(typeName: string): GenericTypeName {
  if (typeName.endsWith('[]')) {
    const elementType: GenericTypeName = {typeName: getArrayElementTypeName(typeName as ArrayTypeName<string>), typeParameters: []};
    return {typeName: 'Array', typeParameters: [elementType]};
  } else {
    const reader = new StringReader(typeName);
    return readTypeNameFromReader(reader);
  }
}

function readTypeNameFromReader(reader: StringReader): GenericTypeName {
  let nameOver = false;
  let typeOver = false;
  let buffer = '';
  const typeParameters: GenericTypeName[] = [];
  while (!reader.eof()) {
    const ch = reader.read();
    if (ch == null) {
      break;
    }
    if (ch === ' ') {
      if (buffer.length > 0) {
        nameOver = true;
      }
      continue;
    } else if (!nameOver && !typeOver && isIdentifierChar(ch, buffer.length)) {
      buffer += ch;
      continue;
    }
    nameOver = true;
    if (ch === '<' || ch === ',') {
      typeParameters.push(readTypeNameFromReader(reader));
    } else if (ch === '>') {
      typeOver = true;
    } else {
      throw new Error(`Failed to read type name '${buffer}${ch}'`);
    }
  }
  return {typeName: buffer, typeParameters};
}

function isIdentifierChar(ch: string, position: number) {
  if (ch >= 'a' && ch <= 'z') {
    return true;
  } else if (ch >= 'A' && ch <= 'Z') {
    return true;
  } else if (ch >= 'A' && ch <= 'Z') {
    return true;
  } else if (ch === '_' || ch === '$') {
    return true;
  } else if (position > 0 && ch >= '0' && ch <= '9') {
    return true;
  } else {
    return false;
  }
}

const ARRAY_BASE_TYPE_NAMES = ['Array','ReadonlyArray','Set','ReadonlySet'] as const;
const RECORD_BASE_TYPE_NAMES = ['Record','Map','ReadonlyMap'] as const;
type KeyBaseTypeName = 'string'|'number';
type ArrayBaseTypeName = typeof ARRAY_BASE_TYPE_NAMES[number];
type RecordBaseTypeName = typeof RECORD_BASE_TYPE_NAMES[number];
type ArrayTypeName<Element extends string> = `${Element}[]`|`${ArrayBaseTypeName}<${Element}>`;
type RecordTypeName<Key extends KeyBaseTypeName, Element extends string> = `${RecordBaseTypeName}<${Key}, ${Element}>`;

