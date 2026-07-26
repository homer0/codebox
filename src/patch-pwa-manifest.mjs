import { readFile, writeFile } from 'fs/promises';

/**
 * Replaces code-server's PWA manifest route with codebox's generated manifest.
 *
 * The generated manifest keeps code-server's {{BASE}} placeholder so its asset
 * paths continue to work behind a reverse proxy.
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
  const handlerEnd = '\n}));\nlet mintKeyPromise;';
  const [manifestContent, routesContent] = await Promise.all([
    readFile(manifestPath, 'utf8'),
    readFile(routesPath, 'utf8'),
  ]);
  const handlerStartIndex = routesContent.indexOf(handlerStart);
  const handlerEndIndex = routesContent.indexOf(handlerEnd, handlerStartIndex);
  if (
    handlerStartIndex === -1 ||
    handlerEndIndex === -1 ||
    routesContent.indexOf(handlerStart, handlerStartIndex + handlerStart.length) !== -1
  ) {
    throw new Error('Unable to locate the code-server manifest handler');
  }

  const manifest = JSON.parse(manifestContent);
  const manifestJson = JSON.stringify(manifest, null, manifestIndentation);
  const handler = `exports.router.get("/manifest.json", (req, res) => {
    res.writeHead(200, { "Content-Type": "application/manifest+json" });
    res.end((0, http_1.replaceTemplates)(req, ${JSON.stringify(manifestJson)}));
});`;
  const updatedRoutes =
    routesContent.slice(0, handlerStartIndex) +
    handler +
    routesContent.slice(handlerEndIndex + '\n}));'.length);

  await writeFile(routesPath, updatedRoutes);
};

main().catch((error) => {
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});
