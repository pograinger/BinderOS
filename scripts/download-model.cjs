/**
 * Download quantized ONNX model files for Xenova/all-MiniLM-L6-v2.
 *
 * This script runs ONCE at install time on the developer machine (pnpm postinstall:models).
 * It downloads the model files from HuggingFace Hub into public/models/,
 * which is then served by Vite as static assets at /models/ at runtime.
 *
 * CRITICAL: These files are downloaded here (developer machine), NOT in the browser.
 * The browser never makes network calls to HuggingFace CDN.
 * Add public/models/ to .gitignore (binary files, ~22MB).
 *
 * Usage:
 *   node scripts/download-model.cjs
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const MODEL_NAME = 'Xenova/all-MiniLM-L6-v2';
const MODEL_DIR = path.join(__dirname, '..', 'public', 'models', MODEL_NAME);

// Required model files from HuggingFace Hub
const REQUIRED_FILES = [
  'onnx/model_quantized.onnx',
  'tokenizer.json',
  'tokenizer_config.json',
  'config.json',
];

const HF_BASE_URL = 'https://huggingface.co';

/**
 * Download a file from a URL to a local path.
 * Follows redirects properly, resolving relative Location headers.
 */
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const dest = fs.createWriteStream(destPath);
    let redirectCount = 0;

    const request = (requestUrl) => {
      if (redirectCount > 10) {
        reject(new Error('Too many redirects'));
        return;
      }

      const parsedUrl = new URL(requestUrl);
      const transport = parsedUrl.protocol === 'https:' ? https : http;

      transport.get(requestUrl, (res) => {
        // Follow redirects
        if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
          const location = res.headers['location'];
          if (!location) {
            reject(new Error(`Redirect without Location header from ${requestUrl}`));
            return;
          }
          redirectCount++;
          // Resolve relative redirect URLs against the base URL
          let nextUrl;
          try {
            nextUrl = new URL(location, requestUrl).href;
          } catch {
            reject(new Error(`Invalid redirect URL: ${location} from ${requestUrl}`));
            return;
          }
          // Drain the response body before following redirect
          res.resume();
          request(nextUrl);
          return;
        }

        if (res.statusCode !== 200) {
          dest.close();
          fs.unlink(destPath, () => {});
          reject(new Error(`HTTP ${res.statusCode} for ${requestUrl}`));
          return;
        }

        res.pipe(dest);
        dest.on('finish', () => {
          dest.close();
          resolve();
        });
      }).on('error', (err) => {
        dest.close();
        fs.unlink(destPath, () => {}); // Clean up partial file
        reject(err);
      });
    };

    dest.on('error', (err) => {
      reject(err);
    });

    request(url);
  });
}

async function main() {
  // Check if model already exists (all required files present and non-empty)
  const allExist = REQUIRED_FILES.every((file) => {
    const filePath = path.join(MODEL_DIR, file);
    try {
      const stat = fs.statSync(filePath);
      return stat.size > 0;
    } catch {
      return false;
    }
  });

  if (allExist) {
    console.log(`[download-model] Model already present at ${MODEL_DIR} — skipping download.`);
    return;
  }

  console.log('[download-model] Downloading ONNX model for local semantic search...');
  console.log(`[download-model] Model: ${MODEL_NAME}`);
  console.log(`[download-model] Destination: ${MODEL_DIR}`);
  console.log('[download-model] This runs once at install time. The browser will never fetch from HuggingFace.');

  // Create directory structure
  for (const file of REQUIRED_FILES) {
    const dir = path.dirname(path.join(MODEL_DIR, file));
    fs.mkdirSync(dir, { recursive: true });
  }

  // Download each required file
  for (const file of REQUIRED_FILES) {
    const url = `${HF_BASE_URL}/${MODEL_NAME}/resolve/main/${file}`;
    const destPath = path.join(MODEL_DIR, file);

    // Skip if already downloaded and non-empty
    try {
      const stat = fs.statSync(destPath);
      if (stat.size > 0) {
        console.log(`[download-model]   Already downloaded: ${file}`);
        continue;
      }
    } catch {
      // File doesn't exist, continue to download
    }

    console.log(`[download-model]   Downloading ${file}...`);
    try {
      await downloadFile(url, destPath);
      console.log(`[download-model]   Done: ${file}`);
    } catch (err) {
      console.error(`[download-model]   FAILED: ${file}: ${err.message}`);
      console.error('[download-model] Download failed. Semantic search will be unavailable.');
      console.error('[download-model] Re-run: node scripts/download-model.cjs');
      process.exit(1);
    }
  }

  console.log('[download-model] Model downloaded successfully. Semantic search is ready.');
}

main().catch((err) => {
  console.error('[download-model] Unexpected error:', err);
  process.exit(1);
});
