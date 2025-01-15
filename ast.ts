import * as path from 'path';
import {readFileSync} from 'fs';

import {ExportedDeclarations, JSDocTagInfo, Symbol, Type, TypeChecker} from 'ts-morph';
import {Project, ts} from 'ts-morph';

import { MetaMethod, MetaParameter, MetaType, MetaInterface, MetaObjectType, MetaUnknownType, MetaVoidType, MetaObjectProperty, MetaScalarProperty, MetaTypeRef, MetaMember, MetaScalarType, MetaCollectionType } from './metaInterface';
import { AddKeyPrefix, isNotNil } from './util';
import { PackageJson, Simplify } from 'type-fest';

type MappedObjectReader<ValueMap extends Record<string, unknown>> = <Key extends keyof ValueMap>(key: Key) => ValueMap[Key];
type FlagObjectReader<T, Flags extends Record<string, unknown>> = ((flags: Flags) => T) & {
  withPrefix<Prefix extends string>(prefix: Prefix): ((flags: AddKeyPrefix<Flags, `${Prefix}_`>) => T);
};
type AnyObjectReader = MappedObjectReader<any> | FlagObjectReader<any, any>;

type ObjectBuilder<T, Flags extends Record<string, unknown>> =
  (flags: Flags) => T;

type BaseObjectReaderRegistry<Mappings extends Record<string, AnyObjectReader>> = {
  [K in keyof Mappings]: Mappings[K];
};

class ObjectReaderRegistry<Mappings extends Record<string, AnyObjectReader>> {
  constructor(private readonly mappings: Mappings) {}

  add<TypeName extends string, Reader extends AnyObjectReader>(typeName: TypeName, reader: Reader): ObjectReaderRegistry<Simplify<Mappings & Record<TypeName, Reader>>> {
    const newThis = this as ObjectReaderRegistry<any>;
    newThis.mappings[typeName] = reader;
    return newThis;
  }
  get<TypeName extends keyof Mappings>(typeName: TypeName): Mappings[TypeName] {
    return this.mappings[typeName];
  }
}

export function mappedConstantObjectReader<ValueMap extends Record<string, unknown>>(map: ValueMap): MappedObjectReader<ValueMap> {
  return <Key extends keyof ValueMap>(key: Key) => map[key];
}

export function flagObjectReader<TBase, FlagsBase extends Record<string, unknown> = Record<string, unknown>>(builder?: ObjectBuilder<TBase, FlagsBase>): FlagObjectReader<TBase, FlagsBase> {
  const baseReader = ((flags: FlagsBase) => {
    if (builder != null) {
      return builder(flags);
    } else {
      return flags as unknown as TBase;
    }
  }) as FlagObjectReader<TBase, FlagsBase>;
  baseReader.withPrefix = <Prefix extends string>(prefix: Prefix) => (flags: AddKeyPrefix<FlagsBase, `${Prefix}_`>) => {
    const filteredFlags = 
      Object.fromEntries(
        Object.entries(flags)
          .filter(([key]) => key.startsWith(prefix + '_'))
          .map(([key, value]) => [
            key.substring(prefix.length + 1),
            value,
          ])
      ) as FlagsBase;
      return baseReader(filteredFlags);
  }
  return baseReader;
}


const a = {foo: 'bar', baz: 1} as const;
const f = mappedConstantObjectReader(a);
const g = f('baz');

const h = flagObjectReader((values: {foo: number, bar: string}) => {
  if (values.foo > 5) {
    return {bar: values.bar};
  } else {
    return {foo: values.foo};
  }
});
const y = h.withPrefix('thing' as const)({thing_foo: 5, thing_bar: 'hi'});


function getProgramInterface(exportedDeclarations: ReadonlyMap<string, ExportedDeclarations[]>): ExportedDeclarations {
  const defaultExport = exportedDeclarations.get('default');
  if (defaultExport != null && defaultExport.length > 0) {
    return defaultExport[0];
  }
  const programInterfaceExport = exportedDeclarations.get('ProgramInterface');
  if (programInterfaceExport != null && programInterfaceExport.length > 0) {
    return programInterfaceExport[0];
  }
  throw new Error('Found no default export or export named ProgramInterface in program source file');
}

export class ProgramTypeAnalyzer {
  private readonly project: Project;
  private readonly typeChecker: TypeChecker;
  private readonly programInterface: ExportedDeclarations;

  constructor(private readonly fileName: string) {
    this.project = new Project({
      tsConfigFilePath: path.resolve(path.dirname(fileName), 'tsconfig.json'),
    });
    const file = this.project.getSourceFile(fileName);
    if (file == null) {
      throw new Error('File does not exist???')
    }
    const exportedDeclarations = file.getExportedDeclarations();
    const programInterface = getProgramInterface(exportedDeclarations);
    this.programInterface = programInterface;
    this.typeChecker = this.project.getTypeChecker();
  }

  getPackageJson(): PackageJson {
    const scriptPackagePath = path.dirname(this.fileName);
    const scriptPackageJsonPath = path.join(scriptPackagePath, 'package.json');
    const rawContents = readFileSync(scriptPackageJsonPath, {encoding: 'utf-8'});
    return JSON.parse(rawContents) as PackageJson;
  }

  extractMembers(type: Type): Record<string, MetaMember> {
    const rawMembers = this.typeChecker.getPropertiesOfType(type).map(m => ({name: m.getName(), member: m, type: m.getTypeAtLocation(this.programInterface)}));

    const methods = rawMembers.filter(m => isFunction(m.type)).map(m => this.toMethodFromSymbol(m)).filter(isNotNil);
    const properties = rawMembers.filter(m => !isFunction(m.type));

    const objects = properties.filter(m => m.type.isObject()).map(p => this.toObjectPropertyFromSymbol(p) as MetaObjectProperty).filter(isNotNil);
    const values = properties.filter(m => !m.type.isObject()).map(p => this.toScalarPropertyFromSymbol(p) as MetaScalarProperty).filter(isNotNil);

    return Object.fromEntries([...objects, ...values, ...methods].map(m => [m.name, m]));
  }

  buildInterface(): MetaInterface {
    return {
      members: this.extractMembers(this.programInterface.getType()),
      package: this.getPackageJson(),
    };
  }

  private toObjectFromSymbol({name, type}: {name: string|undefined, type: Type}): MetaObjectType|undefined {
    return {
      kind: 'objectType',
      name,
      members: this.extractMembers(type),
    };
  }
  private toObjectPropertyFromSymbol({name, member, type}: {name: string, member: Symbol, type: Type}): MetaObjectProperty|MetaScalarProperty|undefined {
    const dataType = this.toMetaType(type) as MetaTypeRef<MetaObjectType|MetaCollectionType>;
    const description = member.getDeclarations()[0].getChildren().find(c => c.isKind(ts.SyntaxKind.JSDoc))?.getCommentText();
    if (dataType == null) {
      return undefined;
    }
    return {
      kind: 'objectProperty',
      name,
      description,
      dataType,
    };
  }
  private toScalarPropertyFromSymbol({name, member, type}: {name: string, member: Symbol, type: Type}): MetaObjectProperty|MetaScalarProperty|undefined {
    const dataType = this.toMetaType(type) as MetaTypeRef<MetaScalarType>;
    const description = member.getDeclarations()[0].getChildren().find(c => c.isKind(ts.SyntaxKind.JSDoc))?.getCommentText();
    if (dataType == null) {
      return undefined;
    }
    return {
      kind: 'scalarProperty',
      name,
      description,
      dataType,
    };
  }
  private toMethodFromSymbol({name, type}: {name: string, type: Type}): MetaMethod|undefined {
    // TODO: Support multiple call signatures
    const primarySignature = type.getCallSignatures()[0];
    const description = primarySignature.getDocumentationComments()[0]?.getText();
    const {params, summary} = extractRelevantJsDocTags(primarySignature.getJsDocTags());
    const parameters: MetaParameter[] = primarySignature.getParameters().map(p => {
      const valueDeclaration = p.getValueDeclaration();
      const valueType = valueDeclaration == null ? p.getDeclaredType() : p.getTypeAtLocation(valueDeclaration);
      const metaType = this.toMetaType(valueType, MetaUnknownType);
      const name = p.getName();
      return {
        kind: 'parameter',
        name,
        dataType: metaType,
        description: params[name],
      };
    });
    const returnType = awaitedMorphType(primarySignature.getReturnType());
    const returnDataType = returnType.isVoid() ? MetaVoidType : this.toMetaType(returnType, MetaUnknownType);
    return {
      kind: 'method',
      name,
      description,
      summary,
      parameters,
      returnDataType,
    };
  }

  private toMetaType<DefaultType extends MetaUnknownType|undefined = undefined>(type: Type, defaultType?: DefaultType): MetaTypeRef|DefaultType {
    if (isPromise(type)) {
      // We always await automatically, so we don't care about the difference
      return this.toMetaType(awaitedMorphType(type));
    }
    const {nullable, nonNullType} = isNullableType(type);
    if (nonNullType.isBigInt()) {
      return {nullable, type: 'bigint'};
    } else if (nonNullType.isBoolean()) {
      return {nullable, type: 'boolean'};
    } else if (nonNullType.isNumber()) {
      return {nullable, type: 'number'};
    } else if (nonNullType.isString()) {
      return {nullable, type: 'string'};
    } else if (isFunction(nonNullType)) {
      return defaultType as DefaultType;
    } else if (nonNullType.isObject()) {
      const name = nonNullType.isAnonymous() ?  undefined : nonNullType.getText();
      const objectType = this.toObjectFromSymbol({name, type: nonNullType});
      return objectType ? {nullable, type: objectType} : defaultType as DefaultType;
    } else {
      return defaultType as DefaultType;
    }
  }
}

export function humanReadableType(type: MetaTypeRef|MetaType|MetaUnknownType): string {
  if (typeof type === 'string') {
    return type;
  } else if ('keyDataType' in type) {
    return `Map<${humanReadableType(type.keyDataType)}, ${humanReadableType(type.valueDataType)}>`;
  } else if ('valueDataType' in type) {
    return humanReadableType(type.valueDataType) + '[]';
  } else if ('type' in type) {
    return humanReadableType(type.type);
  } else {
    return type.name ?? 'unknown';
  }
}

export function isTypeNullable(type: MetaTypeRef|'unknown'): boolean {
  if (typeof type === 'object' && 'type' in type) {
    return type.nullable;
  } else {
    return false;
  }
}

interface RelevantJsDocTags {
  params: Record<string, string|undefined>;
  summary?: string;
}

function extractRelevantJsDocTags(tags: JSDocTagInfo[]): RelevantJsDocTags {
  const relevantTags = {
    params: {},
  } as RelevantJsDocTags;

  for (const tag of tags) {
    switch (tag.getName()) {
      case 'param':
        const {parameterName, text} = expandJsDocParamTag(tag.getText());
        relevantTags.params[parameterName] = text;
        break;
      case 'summary':
        relevantTags.summary = expandSymbolDisplay(tag.getText()).text;
        break;
    }
  }
  return relevantTags;
}

function expandJsDocParamTag(parts: ts.SymbolDisplayPart[]): {parameterName: string, text?: string} {
  // let parameterName!: string;
  // let text: string|undefined;
  // for (const part of parts) {
  //   if (part.kind === 'parameterName') {
  //     parameterName = part.text;
  //   } else if (text == null) {
  //     text = part.text;
  //   } else {
  //     text += part.text;
  //   }
  // }
  // return {parameterName, text};
  return expandSymbolDisplay(parts, ['parameterName']);
}

function expandSymbolDisplay<T extends string>(parts: ts.SymbolDisplayPart[], specialKinds: T[] = []): Record<T, string> & {text?: string} {
  let attributes = {} as Record<T, string>;
  let text = '';
  const remainingKinds = new Set(specialKinds);
  for (const part of parts) {
    switch (part.kind) {
      case 'text':
      case 'space':
        text += part.text;
        break;
      default:
        if (isItemOfSet(part.kind, remainingKinds)) {
          attributes[part.kind] = part.text;
          remainingKinds.delete(part.kind);
        } else {
          throw new Error(`Unexpected symbol kind: ${part.kind}`);
        }
    }
  }
  text = text.trim();
  return {...attributes, text: text.length === 0 ? undefined : text};
}

function isItemOfSet<T extends string>(item: string, set: Set<T>): item is T {
  return set.has(item as T);
}

function isFunction(type: Type): boolean {
  return type.getCallSignatures().length > 0;
}

function isPromise(type: Type): boolean {
  return type.getTargetType()?.getText() === 'Promise<T>';
}

function isNullableType(type: Type): {nullable: boolean, nonNullType: Type} {
  if (!type.isUnion()) {
    return {nullable: false, nonNullType: type};
  }
  let nullable = false;
  let nonNullType: Type|undefined;
  const unionedTypes = type.getUnionTypes();
  for (const t of unionedTypes) {
    if (t.isNull() || t.isUndefined() || t.isVoid() || t.isNever()) {
      nullable = true;
    } else if (nonNullType == null) {
      nonNullType = t;
    }
  }
  if (nonNullType == null) {
    throw new Error(`No standard type found in union: ${type.getText()}`);
  }
  return {
    nullable, nonNullType
  };
}

// function isNullableMetaType(metaType: MetaType): boolean {
//   return typeof metaType === 'object' && 'nullable' in metaType && metaType.nullable;
// }

function awaitedMorphType(type: Type): Type {
  if (!isPromise(type)) {
    return type;
  } else {
    return type.getTypeArguments()[0];
  }
}

// function getJsDocComment(node: JSDocableNode): string|undefined {
//   const jsDocs = node.getJsDocs();
//   for (const jsDoc of jsDocs) {
//     const commentText = jsDoc.getCommentText();
//     if (commentText) {
//       return commentText;
//     }
//   }
//   return undefined;
// }

// function getJsDocParameters(node: JSDocableNode): Record<string, JSDocParameterTag> {
//   return Object.fromEntries(node.getJsDocs().filter(jsDoc => jsDoc.isKind(ts.SyntaxKind.JSDocParameterTag)).map(t => [t.getName(), t]));
// }


// function simplifyMetaType(explicitType: MetaExplicitType): MetaType {
//   return explicitType;
  // if (!explicitType.nullable && typeof explicitType.type === 'string') {
  //   return explicitType.type;
  // } else {
  //   return explicitType;
  // }
// }

// function toMetaInterface(declaration: TsMorphTypeDeclaration): MetaInterface|undefined {
//   if (declaration.isKind(ts.SyntaxKind.InterfaceDeclaration)) {
//     return {
//       properties: declaration.getProperties().map(m => toMetaProperty(m)).filter(isNotNil),
//       methods: declaration.getMethods().map(m => toMetaMethod(m)).filter(isNotNil),
//     };
//   } else {
//     return undefined;
//   }
// }

// function toMetaObject(declaration: TsMorphTypeDeclaration, jsDocParamOverride?: JSDocParameterTag): MetaObject|undefined {
//   if (declaration.isKind(ts.SyntaxKind.InterfaceDeclaration)) {
//     return {
//       name: declaration.getName(),
//       description: jsDocParamOverride?.getText() || getJsDocComment(declaration),
//       properties: declaration.getProperties().map(m => toMetaProperty(m)).filter(isNotNil),
//       methods: declaration.getMethods().map(m => toMetaMethod(m)).filter(isNotNil),
//     };
//   } else {
//     return undefined;
//   }
// }

// function toMetaProperty(declaration: PropertySignature): MetaProperty|undefined {
//   const dataType = toMetaType(declaration.getType());
//   if (dataType == null) {
//     return undefined;
//   }
//     return {
//       name: declaration.getName(),
//       description: getJsDocComment(declaration),
//       optional: declaration.hasQuestionToken(),
//       dataType,
//     };
// }
// function toMetaMethod(declaration: MethodSignature|MethodDeclaration|FunctionDeclaration): MetaMethod|undefined {
//   const name = declaration.getName();
//   if (name == null) {
//     return undefined;
//   }
//   const jsDocParams = getJsDocParameters(declaration);
//   return {
//     name,
//     description: getJsDocComment(declaration),
//     parameters: declaration.getParameters().map(p => toMetaParameter(p, jsDocParams[p.getName()])).filter(isNotNil),
//   };
// }



// function toMetaParameter(declaration: ParameterDeclaration, jsDocTag?: JSDocParameterTag): MetaParameter|undefined {
//   const dataType = toMetaType(declaration.getType());
//   if (dataType == null) {
//     return undefined;
//   }
//   return {
//     name: declaration.getName(),
//     description: jsDocTag?.getText(),
//     optional: declaration.isOptional(),
//     dataType,
//   };
// }
