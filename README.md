# Cline

*(I know the name sucks)*

A proof-of-concept framework for automatically building CLIs from TypeScript code.

**Note: This is not a complete framework and you should not depend on it**

## Demo setup

The code here is both the framework and a demo app demonstrating its use. To set up the workspace, do the following:

1. Run `npm install`
2. If you don't already have `bun`, [install it](https://bun.sh/docs/installation)

To run the demo, run:

```shell
npm run dev:demo -- help
```

(Anything after the `--` gets forwarded to the demo CLI)

## What is this?

Cline lets you easily write a CLI application by writing normal TypeScript code.

Create a `YOURTOOLNAME.ts` file that defines all of the functionality you want inside of a wrapper object:

```typescript
const program = {
  /** Manages foozball. */
  foo: {
    /** Gets some random stuff. */
    stuff: () => {
      console.log(Math.random());
    },
    /** Greets a person. */
    hi(name: string): {
      console.log(`Hello, ${name}`);
    },
  },
};

export default program;
```

Run the generator on that file:

```shell
bun generate.ts YOURTOOLNAME.ts
```

Then import the generated app definition at the top of your file...

```typescript
import programMetaInterface from "./programMetaInterface.json";
```

and add the CLI runner to the bottom of your file:
```typescript
Cli.run(program, programMetaInterface, {
  commandName: 'yourtoolname',
  autoHelp: true,
});
```

Now you can run your tool! Try this:

```shell
bun YOURTOOLNAME.ts -- help
```

Type information and docstrings are used to generate beautiful help screens and smart arg parsers!

## How does this work?

[ts-morph](https://ts-morph.com/) and a bit of dark sorcery that was beamed into my mind from some extradimensional entity. For the purposes of this exercise, we'll assume that entity to be benevolent.

*Translation: I wrote a bunch of stuff, didn't document it, and then later stumbled upon it again and wondered what maniac wrote it.*

https://x.com/CodeWisdom/status/971393535810424832
