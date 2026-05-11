export function parsePackageJson(files = []) {
  const pkgFile = files.find((file) => file.name === 'package.json');
  if (!pkgFile?.content) return null;

  try {
    return JSON.parse(pkgFile.content);
  } catch {
    return null;
  }
}

export function detectWorkspaceKind(files = []) {
  const manifest = parsePackageJson(files);
  const deps = {
    ...(manifest?.dependencies || {}),
    ...(manifest?.devDependencies || {}),
  };

  if (deps.next) return { kind: 'next', label: 'Next.js', packageProject: true };
  if (deps.vite) return { kind: 'vite', label: 'Vite', packageProject: true };
  if (deps.react || deps['react-dom']) return { kind: 'react', label: 'React', packageProject: true };
  if (manifest?.scripts?.dev || manifest?.scripts?.start) return { kind: 'node', label: 'Node.js', packageProject: true };
  if (manifest) return { kind: 'package', label: 'Package app', packageProject: true };
  return { kind: 'static', label: 'Static HTML', packageProject: false };
}
