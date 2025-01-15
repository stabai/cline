import { Cli } from "./cli";

const programInterfaceTsFileName = process.argv[2];
const jsonOutputFileName = process.argv[3] ?? 'programMetaInterface.json';

if (programInterfaceTsFileName == null) {
  throw new Error('Must specify a program interface TypeScript file as an argument');
}
Cli.generateProgramInterface(programInterfaceTsFileName, jsonOutputFileName).then(() => console.log(`Generated program meta interface metadata to ${jsonOutputFileName}`));
