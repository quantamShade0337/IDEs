// Security sandbox — detects and warns about suspicious patterns in user code.
// Does NOT block execution (user owns their code); instead surfaces warnings
// so the user knows what's running. The iframe sandbox CSP remains the true defense.

const MALWARE_PATTERNS = [
  // Cryptomining fingerprints
  { pattern: /CryptoNote|cryptonight|monero.*miner|coinhive|coin-hive|cryptoloot/i, label: 'Cryptocurrency miner', severity: 'high' },
  // Keylogging / clipboard hijacking
  { pattern: /document\.(addEventListener|on(keydown|keyup|keypress))\s*[=(]/i, label: 'Keyboard event listener', severity: 'medium' },
  { pattern: /navigator\.clipboard\.write\s*\(/i, label: 'Clipboard write access', severity: 'medium' },
  // Credential harvesting patterns
  { pattern: /password.*fetch|fetch.*password|XMLHttpRequest.*password/i, label: 'Potential credential exfiltration', severity: 'high' },
  // Obfuscation red flags
  { pattern: /eval\s*\(\s*(atob|unescape|decodeURIComponent)\s*\(/i, label: 'Obfuscated eval execution', severity: 'high' },
  { pattern: /Function\s*\(\s*['"](return this|eval)/i, label: 'Dynamic function construction', severity: 'high' },
  // Phishing-style full-page overlays
  { pattern: /position\s*:\s*fixed[\s\S]{0,100}100vw[\s\S]{0,100}100vh/i, label: 'Full-page overlay (possible phishing)', severity: 'medium' },
  // iframe injection
  { pattern: /document\.write\s*\([\s\S]*iframe/i, label: 'Dynamic iframe injection', severity: 'medium' },
  // localStorage/cookie dumping to remote
  { pattern: /localStorage\.getItem[\s\S]{0,100}fetch\(/i, label: 'LocalStorage exfiltration attempt', severity: 'high' },
  { pattern: /document\.cookie[\s\S]{0,100}(fetch|XMLHttpRequest|Image\(\))/i, label: 'Cookie exfiltration attempt', severity: 'high' },
  // WebRTC IP leak (note: blocked by CSP connect-src, but still flag)
  { pattern: /RTCPeerConnection|RTCSessionDescription/i, label: 'WebRTC (may expose local IP)', severity: 'low' },
  // Redirect attempts
  { pattern: /window\.(location|top\.location)\s*=\s*['"][^'"]{4,}/i, label: 'Redirect attempt', severity: 'medium' },
];

/**
 * Scans HTML, CSS, and JS for suspicious patterns.
 * Returns an array of warning objects: { label, severity, context }
 */
export function scanCode(html, css, js) {
  const warnings = [];

  const sources = [
    { name: 'JS', code: js || '' },
    { name: 'HTML', code: html || '' },
    { name: 'CSS', code: css || '' },
  ];

  for (const { name, code } of sources) {
    for (const { pattern, label, severity } of MALWARE_PATTERNS) {
      const match = code.match(pattern);
      if (match) {
        // Extract surrounding context (up to 60 chars)
        const idx = match.index || 0;
        const snippet = code.slice(Math.max(0, idx - 20), idx + 40).replace(/\n/g, ' ').trim();
        warnings.push({ label, severity, source: name, snippet });
      }
    }
  }

  return warnings;
}

/**
 * Returns severity level as a number for sorting.
 */
export function severityLevel(s) {
  return { high: 3, medium: 2, low: 1 }[s] || 0;
}

/**
 * Returns whether a set of warnings is "high risk" (has any high-severity item).
 */
export function isHighRisk(warnings) {
  return warnings.some(w => w.severity === 'high');
}
