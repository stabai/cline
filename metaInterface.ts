import { PackageJson } from "type-fest";

export type MetaScalarType = 'bigint'|'boolean'|'number'|'string';

export interface MetaObjectType extends MetaPropertyBag {
  kind: 'objectType';
  name?: string;
  description?: string;
}

export interface MetaArrayType {
  kind: 'arrayType';
  valueDataType: MetaTypeRef;
}

export interface MetaRecordType {
  kind: 'recordType';
  keyDataType: 'string'|'number';
  valueDataType: MetaTypeRef;
}

export type MetaCollectionType = MetaArrayType | MetaRecordType;

export type MetaType = MetaScalarType | MetaCollectionType | MetaObjectType;
export interface MetaTypeRef<T extends MetaType = MetaType> {
  type: T;
  nullable: boolean;
}

export const MetaUnknownType = 'unknown' as const;
export type MetaUnknownType = typeof MetaUnknownType;

export const MetaVoidType = 'void' as const;
export type MetaVoidType = typeof MetaVoidType;



export interface MetaInterface extends MetaPropertyBag {
  description?: string;
  package: PackageJson;
}

export interface MetaInterfaceLike {
  description?: string;
  package: object;
  members: Record<string, unknown>;
}



export interface MetaObjectProperty extends MetaTaggable {
  kind: 'objectProperty';
  name: string;
  description?: string;
  dataType: MetaTypeRef<MetaCollectionType | MetaObjectType>;
}
export interface MetaScalarProperty extends MetaTaggable {
  kind: 'scalarProperty';
  name: string;
  description?: string;
  dataType: MetaTypeRef<MetaScalarType>;
}
export interface MetaMethod extends MetaTaggable {
  kind: 'method';
  name: string;
  description?: string;
  parameters: MetaParameter[];
  returnDataType: MetaTypeRef|MetaUnknownType|MetaVoidType;
}

export type MetaMember = MetaObjectProperty|MetaScalarProperty|MetaMethod;




export interface MetaParameter {
  kind: 'parameter';
  name: string;
  description?: string;
  dataType: MetaTypeRef|MetaUnknownType;
}








export function hasParameters(obj: unknown): obj is {parameters: MetaParameter[]} {
  return obj != null && typeof obj === 'object' && 'parameters' in obj && Array.isArray(obj.parameters);
}

export function hasDescription(obj: unknown): obj is {description: string} {
  return obj != null && typeof obj === 'object' && 'description' in obj && obj.description != null;
}

export function isPropertyBag(obj: unknown): obj is MetaPropertyBag {
  if (obj == null || typeof obj !== 'object') {
    return false;
  }
  return 'members' in obj && obj.members != null && typeof obj.members === 'object';
}

export function hasTag<T extends keyof MetaTaggable>(obj: MetaTaggable, tag: T): obj is Record<T, NonNullable<MetaTaggable[T]>> {
  return obj != null && typeof obj === 'object' && tag in obj && (obj as Record<T, unknown>)[tag] != null;
}




interface MetaPropertyBag {
  members: Record<string, MetaMember>;
}

interface MetaTaggable {
  summary?: string;
  seeAlso?: string;
  aliases?: string[];
  default?: string;
  example?: string;
  ignore?: boolean;
  access?: 'private'|'protected'|'package'|'public';
}

export function summarizeMeta(context: MetaInterface|MetaMember|MetaType|MetaParameter, maxLength = 60): string|undefined {
  if (typeof context !== 'object') {
    return undefined;
  } else if ('summary' in context && context.summary) {
    return truncateText(context.summary, maxLength);    
  } else if ('description' in context && context.description) {
    return truncateText(context.description, maxLength);    
  } else {
    return undefined;
  }
}

export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  } else {
    let truncated = text.substring(0, maxLength - 1).replace(/\W*\s+\S*$/, '').trim();
    return truncated + '…';
  }
}