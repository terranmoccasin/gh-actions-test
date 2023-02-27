import * as ts from "typescript";
import { writeFileSync, readdirSync, readFileSync, existsSync, mkdirSync } from "mz/fs";
import path from "path";
import yargs from "yargs";
import {
  CoinGeckoProvider,
  FileSystemProvider,
  MetaplexProvider,
  Mintlist,
  SolanaFmProvider,
  TokenFetcher,
  Tokenlist,
  TokenMetadata,
} from "@orca-so/token-sdk";
import { Connection } from "@solana/web3.js";

// TODO(tmoc): Figure out why this is needed...
const EMPTY_FILE = ts.createSourceFile("empty.ts", "", ts.ScriptTarget.Latest);

const { argv } = yargs(process.argv).options({
  mintlistsDir: { type: "string", demandOption: true },
  outDir: { type: "string", demandOption: true },
  overridesPath: { type: "string", demandOption: false },
});

async function generate() {
  const { fetcher, mintlistsPath, generatedPath, mintlistsFiles, relativeMintlistsPath, printer } =
    await createContext(argv);

  const importStatements: [string, string][] = [];
  const exportStatements: [string, string][] = [];
  for (const fileName of mintlistsFiles) {
    // TODO(tmoc): Add type safety checking for invalid files
    const mintlist = JSON.parse(readFileSync(`${mintlistsPath}/${fileName}`, "utf-8")) as Mintlist;
    const tokenlist = await fetchTokenlist(fetcher, mintlist);

    writeFileSync(
      `${generatedPath}/${toTokenlistJsonName(fileName)}`,
      JSON.stringify(tokenlist, null, 2)
    );

    importStatements.push(createImports(printer, relativeMintlistsPath, fileName));
    exportStatements.push(createExports(printer, fileName));
  }

  const imports = importStatements.map((s) => s.join("\n")).join("\n\n");
  const exports = exportStatements.map((s) => s.join("\n")).join("\n\n");
  const tokenSdkImports = createTokenSdkImports(printer);

  // TODO(tmoc): Create a file stream and write to it instead of creating a string in memory
  writeFileSync(`${generatedPath}/index.ts`, `${tokenSdkImports}\n\n${imports}\n\n${exports}`);
}

interface Context {
  fetcher: TokenFetcher;
  mintlistsPath: string;
  generatedPath: string;
  relativeMintlistsPath: string;
  mintlistsFiles: string[];
  printer: ts.Printer;
}

interface Args {
  mintlistsDir: string;
  outDir: string;
  overridesPath?: string;
}

type MetadataOverrides = Record<string, Partial<TokenMetadata>>;

async function createContext({ mintlistsDir, outDir, overridesPath }: Args): Promise<Context> {
  const connection = new Connection(
    process.env.SOLANA_NETWORK || "https://api.mainnet-beta.solana.com"
  );
  const fetcher = TokenFetcher.from(connection);
  if (overridesPath) {
    // TODO(tmoc): Add type safety checking for invalid files
    const overrides = JSON.parse(
      readFileSync(path.resolve(overridesPath), "utf-8")
    ) as MetadataOverrides;
    fetcher.addProvider(new FileSystemProvider(overrides));
  }
  fetcher
    .addProvider(new MetaplexProvider(connection))
    .addProvider(new SolanaFmProvider({ concurrency: 5, intervalMs: 1000 }))
    .addProvider(new CoinGeckoProvider({ concurrency: 1, intervalMs: 1000 }));

  const mintlistsPath = path.resolve(mintlistsDir);
  const generatedPath = path.resolve(outDir);
  const relativeMintlistsPath = path.relative(generatedPath, mintlistsPath);
  const mintlistsFiles = readdirSync(mintlistsPath);

  const printer = ts.createPrinter();

  if (!existsSync(generatedPath)) {
    mkdirSync(generatedPath);
  }

  return { fetcher, mintlistsPath, generatedPath, mintlistsFiles, relativeMintlistsPath, printer };
}

async function fetchTokenlist(fetcher: TokenFetcher, mintlist: Mintlist): Promise<Tokenlist> {
  console.log(`Fetching metadata for ${mintlist.name} - ${mintlist.mints.length} mints`);
  const tokens = await fetcher.findMany(mintlist.mints);
  return {
    name: mintlist.name,
    tokens: Object.values(tokens),
  };
}

function createTokenSdkImports(printer: ts.Printer): string {
  const node = ts.factory.createImportDeclaration(
    undefined,
    ts.factory.createImportClause(
      false,
      undefined,
      ts.factory.createNamedImports([
        ts.factory.createImportSpecifier(false, undefined, ts.factory.createIdentifier("Mintlist")),
        ts.factory.createImportSpecifier(
          false,
          undefined,
          ts.factory.createIdentifier("Tokenlist")
        ),
      ])
    ),
    ts.factory.createStringLiteral("@orca-so/token-sdk")
  );
  return printer.printNode(
    ts.EmitHint.Unspecified,
    node,
    ts.createSourceFile("", "", ts.ScriptTarget.Latest)
  );
}

function createImports(
  printer: ts.Printer,
  relativeMintlistsPath: string,
  mintlistName: string
): [string, string] {
  const tokenlistName = toTokenlistJsonName(mintlistName);
  const tokenId = ts.factory.createIdentifier(toImportIdentifier(tokenlistName));
  const tokenImportStatement = ts.factory.createImportDeclaration(
    undefined,
    ts.factory.createImportClause(false, tokenId, undefined),
    ts.factory.createStringLiteral(`./${tokenlistName}`)
  );

  const mintId = ts.factory.createIdentifier(toImportIdentifier(mintlistName));
  const mintImportStatement = ts.factory.createImportDeclaration(
    undefined,
    ts.factory.createImportClause(false, mintId, undefined),
    ts.factory.createStringLiteral(`${relativeMintlistsPath}/${mintlistName}`)
  );

  return [
    printer.printNode(ts.EmitHint.Unspecified, mintImportStatement, EMPTY_FILE),
    printer.printNode(ts.EmitHint.Unspecified, tokenImportStatement, EMPTY_FILE),
  ];
}

function createExports(printer: ts.Printer, mintlistName: string): [string, string] {
  const exportTokenlistStatement = ts.factory.createVariableStatement(
    [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
    ts.factory.createVariableDeclarationList(
      [
        ts.factory.createVariableDeclaration(
          toExportIdentifier(mintlistName, "TOKENLIST"),
          undefined,
          ts.factory.createTypeReferenceNode("Tokenlist"),
          ts.factory.createIdentifier(toImportIdentifier(toTokenlistJsonName(mintlistName)))
        ),
      ],
      ts.NodeFlags.Const
    )
  );

  const exportMintlistStatement = ts.factory.createVariableStatement(
    [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
    ts.factory.createVariableDeclarationList(
      [
        ts.factory.createVariableDeclaration(
          toExportIdentifier(mintlistName, "MINTLIST"),
          undefined,
          ts.factory.createTypeReferenceNode("Mintlist"),
          ts.factory.createIdentifier(toImportIdentifier(mintlistName))
        ),
      ],
      ts.NodeFlags.Const
    )
  );

  return [
    printer.printNode(ts.EmitHint.Unspecified, exportMintlistStatement, EMPTY_FILE),
    printer.printNode(ts.EmitHint.Unspecified, exportTokenlistStatement, EMPTY_FILE),
  ];
}

function toImportIdentifier(mintlistName: string): string {
  const parts = toUpperCamelCase(mintlistName).split(".");
  return parts[0].split("-").concat(parts[1]).join("");
}

function toUpperCamelCase(str: string) {
  return str.replace(/(\w)(\w*)/g, function (_, g1, g2) {
    return g1.toUpperCase() + g2.toLowerCase();
  });
}

function toTokenlistJsonName(mintlistName: string): string {
  return mintlistName.replace(".mintlist", ".tokenlist");
}

function toExportIdentifier(mintlistName: string, suffix: string): string {
  const parts = mintlistName.split(".");
  const name = parts[0].replace("-", "_").toUpperCase();
  return `${name}_${suffix}`;
}

generate()
  .then(() => {
    console.log("Done");
  })
  .catch((e) => {
    console.error("Error", e);
  });
