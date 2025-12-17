#!/usr/bin/env node
/**
 * RevGuide Test Runner
 *
 * Run all tests: node tests/run-tests.js
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const testsDir = path.join(__dirname);

async function runTest(testFile) {
  return new Promise((resolve) => {
    console.log(`\n📁 Running ${path.basename(testFile)}...`);
    console.log('-'.repeat(50));

    const proc = spawn('node', [testFile], {
      stdio: 'inherit',
      cwd: path.dirname(testFile)
    });

    proc.on('close', (code) => {
      resolve(code === 0);
    });

    proc.on('error', (err) => {
      console.error(`Failed to run ${testFile}:`, err.message);
      resolve(false);
    });
  });
}

async function main() {
  console.log('\n🚀 RevGuide Test Suite\n');
  console.log('='.repeat(50));

  // Find all test files
  const testFiles = fs.readdirSync(testsDir)
    .filter(f => f.endsWith('.test.js'))
    .map(f => path.join(testsDir, f));

  if (testFiles.length === 0) {
    console.log('No test files found!');
    process.exit(1);
  }

  console.log(`Found ${testFiles.length} test file(s)`);

  let allPassed = true;
  const results = [];

  for (const testFile of testFiles) {
    const passed = await runTest(testFile);
    results.push({ file: path.basename(testFile), passed });
    if (!passed) allPassed = false;
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('\n📊 Test Summary\n');

  for (const { file, passed } of results) {
    console.log(`  ${passed ? '✅' : '❌'} ${file}`);
  }

  const passedCount = results.filter(r => r.passed).length;
  console.log(`\n  Total: ${passedCount}/${results.length} test files passed\n`);

  process.exit(allPassed ? 0 : 1);
}

main().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
