import * as fs from 'fs/promises';
import * as path from 'path';

import { hasDescription, hasParameters, isPropertyBag, MetaInterface, MetaInterfaceLike, MetaMember, MetaMethod, MetaObjectProperty, MetaParameter, MetaScalarProperty, MetaType, summarizeMeta } from './metaInterface';
import { humanReadableType, isTypeNullable, ProgramTypeAnalyzer } from './ast';
import { ColumnPrinter } from './output/columns';
import { fg, format, formatter, style } from './output/format';
import { formatError } from './util';

const FLAG_NO_VALUES = ['no', '0', 'off', 'false'];
const FLAG_YES_VALUES = ['yes', '1', 'on', 'true'];

function booleanFlagValue(value: string|undefined, {defaultValue}: {defaultValue: boolean}): boolean {
  if (!value) {
    return defaultValue;
  }
  const lowerValue = value.toLowerCase();
  if (FLAG_NO_VALUES.includes(lowerValue)) {
    return false;
  } else if (FLAG_YES_VALUES.includes(lowerValue)) {
    return true;
  } else {
    throw new Error(`Illegal boolean flag value: ${value} (expected one of ${[...FLAG_NO_VALUES, FLAG_YES_VALUES]})`);
  }
}

const DEBUG_MODE = booleanFlagValue(process.env.DEBUG, {defaultValue: false});

const FLAG_PREFIX = '--';

export type ValueHandler = (value: unknown) => void;
export type ErrorHandler = (ex: Error) => unknown;


export interface CliOptions {
  autoHelp?: boolean;
  commandName?: string;
  programInterfaceTsFileName?: string;

  errorHandler?: ErrorHandler;
  valueHandler?: ValueHandler;
}

function failGracefully<T extends Error>(ex: T): never {
  Cli.print.error(ex);
  const exitCode = ('exitCode' in ex && typeof ex.exitCode === 'number') ? ex.exitCode : 1;
  process.exit(exitCode);
}

export class Cli<ProgramInterface extends Record<PropertyKey, unknown>> implements CliOptions {
  private constructor(private program: ProgramInterface, metaInterface: MetaInterfaceLike, options: CliOptions) {
    Object.assign(this, options);
    if (!this.commandName) {
      this.commandName = path.basename(process.argv[1]);
    }
    this.metaInterface = metaInterface as MetaInterface;
  }

  static instance: Cli<any>;

  argv!: string[];
  runtimePath!: string;
  scriptPath!: string;
  rawArgs!: string[];

  metaInterface: MetaInterface;

  positionalArgs!: string[];
  flags!: Record<string, unknown>;

  autoHelp = true;
  commandName!: string;

  errorHandler: ErrorHandler = (ex: Error) => {
    failGracefully(ex);
  };
  valueHandler: ValueHandler = (value: unknown) => {
    if (typeof value === 'object') {
      console.dir(value, {depth: null});
    } else {
      console.log(value);
    }
  };

  static async generateProgramInterface(programInterfaceTsFileName: string, jsonOutputFileName: string): Promise<MetaInterface> {
    const metaInterface = new ProgramTypeAnalyzer(programInterfaceTsFileName).buildInterface();
    await fs.writeFile(jsonOutputFileName, JSON.stringify(metaInterface, null, 2));
    return metaInterface;
  }

  static readonly print = {
    header(text: string, options: {pre?: string, post?: string} = {}): void {
      const {pre = '', post = ''} = options;
      console.log(`\n${pre}${style.bold(text)}${post}\n`);
    },
    error(textOrError: string|Error, options: {pre?: string, post?: string} = {}): void {
      const {pre = '', post = ''} = options;
      console.error(`${pre}${format('ERROR:', style.bold, fg.red)} ${formatError(textOrError)}${post}\n`);
    },
    warning(textOrError: string|Error, options: {pre?: string, post?: string} = {}): void {
      const {pre = '', post = ''} = options;
      console.warn(`${pre}${format('WARNING:', style.bold, fg.yellow)} ${formatError(textOrError)}${post}\n`);
    },
  } as const;


  private async handleFailure(fn: () => unknown): Promise<unknown> {
    if (!DEBUG_MODE) {
      return await fn();
    } else {
      try {
        return await fn();
      } catch (ex) {
        return await this.errorHandler(ex as Error);
      }
    }
  };

  packageVersion(): string|undefined {
    return this.metaInterface.package.version;
  }

  private static of<ProgramInterface extends Record<PropertyKey, unknown>>(program: ProgramInterface, metaInterface: MetaInterfaceLike, options: CliOptions = {}): Cli<ProgramInterface> {
    if (Cli.instance != null) {
      throw failGracefully(new Error('Cli is a singleton, cannot create multiple instances'));
    }
    const inst = new Cli(program, metaInterface, options);
    Cli.instance = inst;
    return inst;
  }
  public static run<ProgramInterface extends Record<PropertyKey, unknown>>(program: ProgramInterface, metaInterface: MetaInterfaceLike, options: CliOptions = {}): Promise<void> {
    return Cli.of(program, metaInterface, options).run();
  }

  private parseArgs(argv: string[] = process.argv): void {
    const [runtimePath, scriptPath, ...rawArgs] = argv;
    Object.assign(this, {argv, runtimePath, scriptPath, rawArgs});
  }

  async run(): Promise<void> {
    this.handleFailure(() => this.runInternal());
  }

  showHelp = (...path: string[]) => {
    let contextProp: MetaMember|undefined;
    let context: MetaInterface|MetaMethod|MetaType = this.metaInterface;
    if (Cli.instance.flags['debug']) {
      console.dir(context, {depth: null});
    }
    for (const component of path) {
      if (!isPropertyBag(context)) {
        throw new Error(`Invalid command path: ${path}`);
      }
      const newContext: MetaMember|undefined = context.members[component];
      if (newContext == null) {
        throw new Error(`Unknown command or group: ${component}`);
      }
      contextProp = newContext;
      if ('dataType' in newContext) {
        if (typeof newContext.dataType === 'object' && 'type' in newContext.dataType) {
          context = newContext.dataType.type;
        } else {
          context = newContext.dataType;
        }
      } else {
        context = newContext;
      }
    }

    const contextLabel = this.commandName + path.map(s => ' ' + s).join('');
    Cli.print.header('NAME');
    if (typeof context === 'object' && 'summary' in context && context.summary) {
      console.log('    ' + contextLabel + ' - ' + context.summary);
    } else {
      console.log('    ' + contextLabel);
    }

    const {groups, commands, parameters} = extractMetaItems(context);

    Cli.print.header('USAGE');
    let usageText = style.bold(contextLabel);
    if (isPropertyBag(context)) {
      if (groups.length > 0) {
        usageText += ' ' + style.underline('GROUP');
      }
      if (commands.length > 0) {
        if (groups.length > 0) {
          usageText += ' |';
        }
        usageText += ' ' + style.underline('COMMAND');
      }
    }
    for (const parameter of parameters) {
      let name = style.italic(parameter.name);
      if (isTypeNullable(parameter.dataType)) {
        name = '[' + name + ']';
      }
      usageText += ' ' + name;
    }
    console.log('    ' + usageText);

    if (hasDescription(contextProp)) {
      Cli.print.header('DESCRIPTION');
      console.log('    ' + contextProp.description);
    }
    
    if (parameters.length > 0) {
      Cli.print.header('PARAMETERS');
      const parameterColumns = new ColumnPrinter({
        rowPrefix: '      ',
        columnFormatters: {0: formatter(fg.blue, style.bold), 1: style.italic},
        dataSets: {
          parameters: parameters.map(p => [p.name, humanReadableType(p.dataType), buildParameterDescription(p)]),
        },
      });
      parameterColumns.printDataSet('parameters');
    }

    if (groups.length === 0 && commands.length === 0) {
      return;
    }

    const columns = new ColumnPrinter({
        rowPrefix: '      ',
        columnFormatters: {0: formatter(fg.blue, style.bold)},
        dataSets: {
          groups: groups.map(p => [p.name, summarizeMeta(p)]),
          commands: commands.map(m => [m.name, summarizeMeta(m)]),
        },
      });
    if (groups.length > 0) {
      Cli.print.header('GROUPS');
      console.log(`    ${style.underline('GROUP')} is one of the following:`);
      console.log();
      columns.printDataSet('groups');
    }
    if (commands.length > 0) {
      Cli.print.header('COMMANDS');
      console.log(`    ${style.underline('COMMAND')} is one of the following:`);
      console.log();
      columns.printDataSet('commands');
    }
  }

  private async runInternal(): Promise<void> {
    const positionalArgs: unknown[] = [];
    const flags: Record<string, unknown> = {};

    this.parseArgs();
    let context: unknown = this.program;
    let contextDepth = 0;
    let contextFinal = false;

    for (const arg of this.rawArgs) {
      if (this.autoHelp && contextDepth === 0 && arg.toLowerCase() === 'help') {
        contextDepth++;
        context = this.showHelp;
        contextFinal = true;
        continue;
      }
      const contextProp = (context as Record<string, unknown>)[arg];
      if (!contextFinal && contextProp != null) {
        switch (typeof contextProp) {
          case 'bigint':
          case 'boolean':
          case 'number':
          case 'string':
          case 'function':
            context = contextProp;
            contextDepth++;
            contextFinal = true;
            break;
          case 'object':
            context = contextProp;
            contextDepth++;
            break;            
        }
      } else if (arg.startsWith(FLAG_PREFIX)) {
        const [name, ...values] = arg.substring(FLAG_PREFIX.length).split('=');
        const value = values.join('=');
        flags[name] = value;
      } else {
        positionalArgs.push(arg);
      }
    }
    Object.assign(this, {positionalArgs, flags});
    switch (typeof context) {
      case 'bigint':
      case 'boolean':
      case 'number':
      case 'string':
        this.valueHandler(context);
        break;
      case 'function':
        const returnValue = await context(...positionalArgs);
        if (returnValue != null) {
          this.valueHandler(returnValue);
        }
        break;
      default:
        failGracefully(new Error('i dunno what to do'));
    }
  }
}

function extractMetaItems(context: MetaInterface|MetaType|MetaMethod): {groups: MetaObjectProperty[], commands: (MetaScalarProperty|MetaMethod)[], parameters: MetaParameter[]} {
  const parameters = hasParameters(context) ? context.parameters : [];
  if (!isPropertyBag(context)) {
    return {groups: [], commands: [], parameters};
  }
  const groups: MetaObjectProperty[] = [];
  const commands: (MetaScalarProperty|MetaMethod)[] = [];

  const members = Object.values(context.members).sort((a, b) => a.name.localeCompare(b.name));
  for (const member of members) {
    switch (member.kind) {
      case 'objectProperty':
        groups.push(member);
        break;
      case 'scalarProperty':
      case 'method':
        commands.push(member);
        break;
    }
  }
  return {groups, commands, parameters};
}

function buildParameterDescription(parameter: MetaParameter): string {
  const description: string[] = [];
  if (isTypeNullable(parameter.dataType)) {
    description.push('(Optional)');
  }
  const summary = summarizeMeta(parameter);
  if (summary) {
    description.push(summary);
  }
  return description.join(' ');
}
