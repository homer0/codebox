import { readFile, writeFile } from 'fs/promises';

/**
 * Replaces code-server's PWA manifest route with codebox's generated manifest.
 *
 * The generated manifest keeps code-server's {{BASE}} placeholder so its asset paths
 * continue to work behind a reverse proxy.
 */
const argumentStartIndex = 2;
const manifestIndentation = 2;

const main = async () => {
  const [manifestPath, routesPath] = process.argv.slice(argumentStartIndex);
  if (!manifestPath || !routesPath) {
    throw new Error('Expected manifest and routes file paths');
  }

  // These markers make an upstream route change fail visibly instead of
  // modifying an unrelated section of the compiled code-server source.
  const handlerStart = 'exports.router.get("/manifest.json",';
  const upstreamClose = '\n}));';
  const nextDeclaration = '\nlet mintKeyPromise;';
  const patchedStart = `${handlerStart} (req, res) => {
    res.writeHead(200, { "Content-Type": "application/manifest+json" });
    res.end((0, http_1.replaceTemplates)(req, `;
  const patchedClose = '));\n});';
  const [manifestContent, routesContent] = await Promise.all([
    readFile(manifestPath, 'utf8'),
    readFile(routesPath, 'utf8'),
  ]);
  const handlerStartIndex = routesContent.indexOf(handlerStart);
  if (
    handlerStartIndex === -1 ||
    routesContent.indexOf(handlerStart, handlerStartIndex + handlerStart.length) !== -1
  ) {
    throw new Error('Unable to locate the code-server manifest handler');
  }

  // Recognize the exact shape written by Codebox, including older installs.
  const patchedContentIndex = handlerStartIndex + patchedStart.length;
  const patchedEndIndex = routesContent.indexOf(
    patchedClose + nextDeclaration,
    patchedContentIndex,
  );
  const hasExistingPatch =
    routesContent.startsWith(patchedStart, handlerStartIndex) &&
    patchedEndIndex !== -1 &&
    /^"(?:[^"\\\n]|\\.)*"$/.test(
      routesContent.slice(patchedContentIndex, patchedEndIndex),
    );
  const upstreamEndIndex = routesContent.indexOf(
    upstreamClose + nextDeclaration,
    handlerStartIndex,
  );
  if (!hasExistingPatch && upstreamEndIndex === -1) {
    throw new Error('Unable to locate the code-server manifest handler');
  }
  const handlerEndIndex = hasExistingPatch
    ? patchedEndIndex + patchedClose.length
    : upstreamEndIndex + upstreamClose.length;

  const manifest = JSON.parse(manifestContent);
  const manifestJson = JSON.stringify(manifest, null, manifestIndentation);
  const handler = `${patchedStart}${JSON.stringify(manifestJson)}${patchedClose}`;
  const updatedRoutes =
    routesContent.slice(0, handlerStartIndex) +
    handler +
    routesContent.slice(handlerEndIndex);

  if (updatedRoutes === routesContent) return;
  await writeFile(routesPath, updatedRoutes);
};

main().catch((error) => {
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});
