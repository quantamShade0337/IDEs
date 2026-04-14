import JSZip from 'jszip';
import { saveAs } from 'file-saver';

export const exportProject = async ({ title, html, css, js }) => {
  const zip = new JSZip();
  const name = title.replace(/[^a-z0-9]/gi, '-').toLowerCase() || 'project';

  const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
${html}
<script src="script.js"></script>
</body>
</html>`;

  zip.file('index.html', fullHtml);
  zip.file('styles.css', css);
  zip.file('script.js', js);
  zip.file('README.md', `# ${title}\n\nExported from WebIDE.\n\nOpen \`index.html\` in your browser to preview.\n`);

  const blob = await zip.generateAsync({ type: 'blob' });
  saveAs(blob, `${name}.zip`);
};
