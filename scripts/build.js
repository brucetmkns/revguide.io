#!/usr/bin/env node

/**
 * RevGuide Extension Build Script
 *
 * Minifies JavaScript and CSS files for production distribution.
 * Run with --dev flag to skip minification (for debugging).
 *
 * Usage:
 *   npm run build        # Production build (minified)
 *   npm run build:dev    # Development build (unminified)
 */

const fs = require('fs');
const path = require('path');
const { minify } = require('terser');
const CleanCSS = require('clean-css');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

const isDev = process.argv.includes('--dev');

// Files/directories to exclude from the build
const EXCLUDE = [
  '.git',
  '.github',
  '.claude',
  '.vercel',
  '.DS_Store',
  'node_modules',
  'dist',
  'docs',
  'supabase',
  'api',
  'backups',
  'scripts',
  'tests',
  'library-data',
  'website',
  'RevGuide',
  '.env',
  '.env.local',
  '.env.example',
  'package.json',
  'package-lock.json',
  '.eslintrc.json',
  '.gitignore',
  'vercel.json',
  // Markdown files (except PRIVACY.md which may be needed)
  'CHANGELOG.md',
  'LEARNINGS.md',
  'README.md',
  'ROADMAP.md',
  'HUBSPOT_DOM_STRUCTURE.md',
  'INSTALL.md'
];

// Files to copy without processing (already minified or binary)
const COPY_AS_IS = [
  'admin/lib/supabase.min.js',
  '.png',
  '.ico',
  '.svg',
  '.woff',
  '.woff2',
  '.ttf'
];

// Terser configuration for JavaScript minification
const TERSER_OPTIONS = {
  compress: {
    drop_console: false,  // Keep console.log for debugging in production
    drop_debugger: true,
    passes: 2
  },
  mangle: {
    reserved: [
      // Preserve global class/function names that are referenced externally
      'AdminPanel',
      'AdminShared',
      'RevGuideAuth',
      'RevGuideDB',
      'RevGuideHubSpot',
      'SidePanel',
      'BannersModule',
      'WikiModule',
      'SidepanelModule',
      'PresentationsModule',
      'RulesEngine'
    ]
  },
  format: {
    comments: false
  }
};

// Clean-CSS configuration
const CLEANCSS_OPTIONS = {
  level: 2
};

// Stats tracking
const stats = {
  js: { original: 0, minified: 0, files: 0 },
  css: { original: 0, minified: 0, files: 0 },
  other: { files: 0 }
};

/**
 * Check if a path should be excluded
 */
function shouldExclude(relativePath) {
  const parts = relativePath.split(path.sep);
  return EXCLUDE.some(exc => parts.includes(exc) || relativePath.startsWith(exc));
}

/**
 * Check if a file should be copied without processing
 */
function shouldCopyAsIs(filePath) {
  return COPY_AS_IS.some(pattern => filePath.includes(pattern));
}

/**
 * Recursively get all files in a directory
 */
function getAllFiles(dir, baseDir = dir) {
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(baseDir, fullPath);

    if (shouldExclude(relativePath)) continue;

    if (entry.isDirectory()) {
      files.push(...getAllFiles(fullPath, baseDir));
    } else {
      files.push({ fullPath, relativePath });
    }
  }

  return files;
}

/**
 * Ensure directory exists
 */
function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Minify JavaScript file
 */
async function minifyJS(content, filePath) {
  if (isDev) return content;

  try {
    const result = await minify(content, TERSER_OPTIONS);
    if (result.error) {
      console.error(`  Error minifying ${filePath}:`, result.error);
      return content;
    }
    return result.code;
  } catch (err) {
    console.error(`  Error minifying ${filePath}:`, err.message);
    return content;
  }
}

/**
 * Minify CSS file
 */
function minifyCSS(content, filePath) {
  if (isDev) return content;

  try {
    const result = new CleanCSS(CLEANCSS_OPTIONS).minify(content);
    if (result.errors.length > 0) {
      console.error(`  Error minifying ${filePath}:`, result.errors);
      return content;
    }
    return result.styles;
  } catch (err) {
    console.error(`  Error minifying ${filePath}:`, err.message);
    return content;
  }
}

/**
 * Process a single file
 */
async function processFile({ fullPath, relativePath }) {
  const destPath = path.join(DIST, relativePath);
  ensureDir(destPath);

  const ext = path.extname(fullPath).toLowerCase();

  // Copy binary files and already-minified files as-is
  if (shouldCopyAsIs(fullPath)) {
    fs.copyFileSync(fullPath, destPath);
    stats.other.files++;
    return;
  }

  // Process based on file type
  if (ext === '.js') {
    const content = fs.readFileSync(fullPath, 'utf8');
    const minified = await minifyJS(content, relativePath);
    fs.writeFileSync(destPath, minified);

    stats.js.original += content.length;
    stats.js.minified += minified.length;
    stats.js.files++;

  } else if (ext === '.css') {
    const content = fs.readFileSync(fullPath, 'utf8');
    const minified = minifyCSS(content, relativePath);
    fs.writeFileSync(destPath, minified);

    stats.css.original += content.length;
    stats.css.minified += minified.length;
    stats.css.files++;

  } else {
    // Copy other files (HTML, JSON, images, etc.) as-is
    fs.copyFileSync(fullPath, destPath);
    stats.other.files++;
  }
}

/**
 * Format bytes to human readable
 */
function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

/**
 * Main build function
 */
async function build() {
  console.log(`\n🔧 RevGuide Extension Build`);
  console.log(`   Mode: ${isDev ? 'Development (no minification)' : 'Production (minified)'}\n`);

  // Clean dist directory
  if (fs.existsSync(DIST)) {
    fs.rmSync(DIST, { recursive: true });
  }
  fs.mkdirSync(DIST);

  // Get all files to process
  const files = getAllFiles(ROOT);
  console.log(`   Processing ${files.length} files...\n`);

  // Process files
  for (const file of files) {
    await processFile(file);
  }

  // Print stats
  console.log(`\n📊 Build Statistics:`);
  console.log(`   JavaScript: ${stats.js.files} files`);
  if (!isDev) {
    const jsReduction = ((1 - stats.js.minified / stats.js.original) * 100).toFixed(1);
    console.log(`      ${formatBytes(stats.js.original)} → ${formatBytes(stats.js.minified)} (${jsReduction}% smaller)`);
  }

  console.log(`   CSS: ${stats.css.files} files`);
  if (!isDev) {
    const cssReduction = ((1 - stats.css.minified / stats.css.original) * 100).toFixed(1);
    console.log(`      ${formatBytes(stats.css.original)} → ${formatBytes(stats.css.minified)} (${cssReduction}% smaller)`);
  }

  console.log(`   Other: ${stats.other.files} files`);

  // Total size
  const totalOriginal = stats.js.original + stats.css.original;
  const totalMinified = stats.js.minified + stats.css.minified;
  if (!isDev && totalOriginal > 0) {
    const totalReduction = ((1 - totalMinified / totalOriginal) * 100).toFixed(1);
    console.log(`\n   Total reduction: ${formatBytes(totalOriginal)} → ${formatBytes(totalMinified)} (${totalReduction}% smaller)`);
  }

  console.log(`\n✅ Build complete! Output: dist/\n`);
}

// Run build
build().catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});
