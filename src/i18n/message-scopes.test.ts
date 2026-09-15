import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import uk from "../../messages/uk.json";
import { messageScopes, selectMessages } from "./message-scopes";

const app = resolve("src/app");
const options: ts.CompilerOptions = { moduleResolution: ts.ModuleResolutionKind.Bundler, baseUrl: process.cwd(), paths: { "@/*": ["src/*"] }, jsx: ts.JsxEmit.Preserve };
const parsed = new Map<string, { namespaces: string[]; imports: string[]; scopes: string[] }>();

// Follow static AND lazy imports. This is a coverage alarm, not a production
// message picker: runtime keys remain unrestricted within each whole namespace.
function inspect(file: string) {
  const cached = parsed.get(file);
  if (cached) return cached;
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  const result = { namespaces: [] as string[], imports: [] as string[], scopes: [] as string[] };
  const hooks = new Set(["useTranslations"]);
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier) || statement.moduleSpecifier.text !== "next-intl") continue;
    const bindings = statement.importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) for (const binding of bindings.elements) {
      if ((binding.propertyName ?? binding.name).text === "useTranslations") hooks.add(binding.name.text);
    }
  }
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && hooks.has(node.expression.getText(source))) {
      const namespace = node.arguments[0];
      if (!namespace || !ts.isStringLiteral(namespace)) throw new Error(`${file}: review message ownership for a dynamic/root namespace`);
      result.namespaces.push(namespace.text);
    }
    if (ts.isCallExpression(node) && node.expression.getText(source) === "useMessages" && !file.endsWith("/i18n/scoped-intl-provider.tsx")) {
      throw new Error(`${file}: review access to the scoped dictionary`);
    }
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(source) === "DomainMessages") {
      for (const attribute of node.attributes.properties) if (ts.isJsxAttribute(attribute) && attribute.name.getText(source) === "scope" && attribute.initializer && ts.isStringLiteral(attribute.initializer)) result.scopes.push(attribute.initializer.text);
    }
    let specifier: ts.Expression | undefined;
    if (ts.isImportDeclaration(node) && !node.importClause?.isTypeOnly) specifier = node.moduleSpecifier;
    if (ts.isExportDeclaration(node) && !node.isTypeOnly) specifier = node.moduleSpecifier;
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) specifier = node.arguments[0];
    if (specifier && ts.isStringLiteral(specifier)) {
      const target = ts.resolveModuleName(specifier.text, file, options, ts.sys).resolvedModule;
      if (target && !target.isExternalLibraryImport) result.imports.push(target.resolvedFileName);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  parsed.set(file, result);
  return result;
}

function namespaces(file: string, seen = new Set<string>()): string[] {
  if (seen.has(file)) return [];
  seen.add(file);
  const source = inspect(file);
  return [...source.namespaces, ...source.imports.flatMap((target) => namespaces(target, seen))];
}

describe("domain message ownership", () => {
  it("selects whole, identical namespaces for both locales and rejects missing dictionaries", () => {
    for (const [scope, names] of Object.entries(messageScopes)) {
      expect(new Set(names).size, scope).toBe(names.length);
      for (const name of names) expect(Object.keys(en[name]).sort(), name).toEqual(Object.keys(uk[name]).sort());
    }
    expect(selectMessages(en, "root")).toEqual({ Common: en.Common, Account: en.Account });
    expect(() => selectMessages({}, "equipment")).toThrow("Equipment");
    expect(readFileSync(join(app, "layout.tsx"), "utf8")).toContain('selectMessages(messages, "root")');
  });

  const routes = readdirSync(app, { recursive: true, encoding: "utf8" }).filter((file) => /(?:^|\/)(page|layout|loading|error|not-found)\.tsx$/.test(file));
  for (const route of routes) it(`covers static/lazy UI without duplicate ancestor payloads: ${route}`, () => {
    const file = join(app, route);
    const owners = [file];
    for (let directory = dirname(file); directory.startsWith(app); directory = dirname(directory)) {
      const layout = join(directory, "layout.tsx");
      if (layout !== file && existsSync(layout)) owners.push(layout);
    }
    const available: string[] = [...messageScopes.root];
    for (const owner of owners) for (const scope of inspect(owner).scopes) {
      const entry = Object.entries(messageScopes).find(([name]) => name === scope);
      if (!entry) throw new Error(`Unknown scope ${scope}`);
      available.push(...entry[1]);
    }
    expect(available.length).toBe(new Set(available).size);
    for (const namespace of new Set(owners.flatMap((owner) => namespaces(owner)))) expect(available, `${route}: ${namespace}`).toContain(namespace);
  });
});
