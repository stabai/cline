import { Cli } from "./cli";
import programMetaInterface from "./programMetaInterface.json";

const program = {
  /** Tests foozball. */
  foo: {
    /** Gets the dude's first name */
    name: 'shawn',
    /** Gets some random stuff. */
    stuff: () => {
      console.log(Math.random());
    },
    /**
     * Uses bats to transform bazzes in a barological pattern. This is completely irreversible and
     * may cause the destruction of the universe.
     * 
     * @param baz The baz to use for the process.
     * @param bat The bat to apply.
     */
    bar: (baz: string, bat?: string) => {
      console.log(baz);
      console.log(bat);
    },
  },
  /** Manages goobers. */
  goob: {
    /** Gets the dude's middle name. */
    middleName: 'cameron',
    /** Gets the dude's last name. */
    lastName: 'tabai',
  },
  /** Gets the version of the app. */
  version: () => {
    return Cli.instance.packageVersion() ?? 'unknown';
  }
};
export default program;

Cli.run(program, programMetaInterface, {
  commandName: 'demo',
  autoHelp: true,
});
