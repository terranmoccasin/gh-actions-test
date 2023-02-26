import * as ts from "typescript";
import { writeFileSync, readdirSync, readFileSync } from "mz/fs";
import path from "path";
import { fetchMetadata, Mintlist } from "./generator";

const mintlistsPath = path.resolve("./src/mintlists");
const generatedPath = path.resolve("./src/generated");
const mintlistsFileNames = readdirSync(mintlistsPath);
const TOKENLIST_SUFFIX = "TOKENLIST";
const MINTLIST_SUFFIX = "MINTLIST";
const EMPTY_FILE = ts.createSourceFile("empty.ts", "", ts.ScriptTarget.Latest);

async function generate() {
  const importStatements: [string, string][] = [];
  const exportStatements: [string, string][] = [];
  const printer = ts.createPrinter();
  for (const fileName of mintlistsFileNames) {
    const mintlist = JSON.parse(readFileSync(`${mintlistsPath}/${fileName}`, "utf-8")) as Mintlist;
    const tokenlist = await fetchMetadata(mintlist);

    writeFileSync(
      `${generatedPath}/${toTokenlistJsonName(fileName)}`,
      JSON.stringify(tokenlist, null, 2)
    );

    importStatements.push(createImportDeclarations(printer, fileName));
    // exportStatements.push(createExpo)
  }

  const source = importStatements.map((s) => s.join("\n")).join("\n\n");
  writeFileSync(`${generatedPath}/index.ts`, source);
}

function createImportDeclarations(printer: ts.Printer, mintlistName: string): [string, string] {
  const tokenId = ts.factory.createIdentifier(toIdentifier(mintlistName, TOKENLIST_SUFFIX));
  const tokenImportStatement = ts.factory.createImportDeclaration(
    undefined,
    ts.factory.createImportClause(false, tokenId, undefined),
    ts.factory.createStringLiteral(`./${toTokenlistJsonName(mintlistName)}`)
  );

  const mintId = ts.factory.createIdentifier(toIdentifier(mintlistName, MINTLIST_SUFFIX));
  const mintImportStatement = ts.factory.createImportDeclaration(
    undefined,
    ts.factory.createImportClause(false, mintId, undefined),
    ts.factory.createStringLiteral(`../mintlists/${mintlistName}`)
  );

  return [
    printer.printNode(ts.EmitHint.Unspecified, mintImportStatement, EMPTY_FILE),
    printer.printNode(ts.EmitHint.Unspecified, tokenImportStatement, EMPTY_FILE),
  ];
}

function toCamelCase(str: string) {
  return str
    .replace(/\s(.)/g, function ($1) {
      return $1.toUpperCase();
    })
    .replace(/\s/g, "")
    .replace(/^(.)/, function ($1) {
      return $1.toLowerCase();
    });
}

function toTokenlistJsonName(mintlistName: string): string {
  return mintlistName.replace(".mintlist", ".tokenlist");
}

function toIdentifier(mintlistName: string, suffix: string): string {
  const parts = mintlistName.split(".");
  const name = parts[0].replace("-", "_").toUpperCase();
  return `${name}_${suffix}`;
}

// generate()
//   .then(() => {
//     console.log("Done");
//   })
//   .catch((e) => {
//     console.error("Error", e);
//   });
