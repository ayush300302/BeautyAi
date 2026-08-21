/**
 * test_azure_live.js — Directly test Azure App Service Live Endpoint
 */

const https = require('https');

function getAzureHealth() {
  return new Promise((resolve, reject) => {
    https.get('https://beautyai-recommender-app.azurewebsites.net/api/health', res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, data }));
    }).on('error', reject);
  });
}

function postAzureChat(msg) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({ message: msg });
    const req = https.request('https://beautyai-recommender-app.azurewebsites.net/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, data }));
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function runAzureLiveTest() {
  console.log("\n=========================================================================");
  console.log("  Testing LIVE Azure Endpoint: https://beautyai-recommender-app.azurewebsites.net");
  console.log("=========================================================================\n");

  console.log("1. GET /api/health:");
  try {
    const health = await getAzureHealth();
    console.log(`Status Code: ${health.statusCode}`);
    console.log(`Response Data:\n${health.data}`);
  } catch(e) {
    console.error(`Health Test Failed: ${e.message}`);
  }

  console.log("\n2. POST /api/chat (\"What ingredients help with acne?\"):");
  try {
    const start = Date.now();
    const chat = await postAzureChat("What ingredients help with acne?");
    const elapsed = Date.now() - start;
    console.log(`Status Code: ${chat.statusCode}`);
    console.log(`Elapsed Time: ${elapsed} ms`);
    console.log(`Content-Type Header: ${chat.headers['content-type']}`);
    console.log(`Response Data:\n${chat.data}`);
  } catch(e) {
    console.error(`Chat Test Failed: ${e.message}`);
  }

  console.log("\n=========================================================================\n");
}

runAzureLiveTest();
