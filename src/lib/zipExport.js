import JSZip from 'jszip';
import { saveAs } from 'file-saver';

export const exportProject = async ({ title, html, css, js, files }) => {
  const zip = new JSZip();
  const name = (title || 'project').replace(/[^a-z0-9]/gi, '-').toLowerCase();

  // Prefer files array if available
  if (files && files.length > 0) {
    // Find main html/css/js for the linked index.html
    const htmlFile = files.find(f => f.name === 'index.html' || f.name.endsWith('.html'));
    const cssFile = files.find(f => f.name === 'styles.css' || f.name.endsWith('.css'));
    const jsFile = files.find(f => f.name === 'script.js' || f.name.endsWith('.js') || f.name.endsWith('.jsx'));

    // Write all files as-is
    for (const file of files) {
      zip.file(file.name, file.content || '');
    }

    // If there's no index.html that links the others, generate one
    if (htmlFile && (cssFile || jsFile)) {
      const hasLinkTag = htmlFile.content?.includes('<link') || htmlFile.content?.includes('<script');
      if (!hasLinkTag) {
        const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  ${cssFile ? `<link rel="stylesheet" href="${cssFile.name}" />` : ''}
</head>
<body>
${htmlFile.content || ''}
${jsFile ? `<script src="${jsFile.name}"><\/script>` : ''}
</body>
</html>`;
        zip.file(htmlFile.name, fullHtml);
      }
    }
  } else {
    // Legacy flat project format
    const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
${html || ''}
<script src="script.js"><\/script>
</body>
</html>`;
    zip.file('index.html', fullHtml);
    zip.file('styles.css', css || '');
    zip.file('script.js', js || '');
  }

  zip.file('README.md', `# ${title}\n\nExported from WebIDE.\n\nOpen \`index.html\` in your browser to preview.\n`);

  const blob = await zip.generateAsync({ type: 'blob' });
  saveAs(blob, `${name}.zip`);
};
