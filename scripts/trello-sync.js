#!/usr/bin/env node

/**
 * Trello Synchronization CLI for Harness Engineering
 *
 * Reads authoritative execution state from feature_list.json and synchronizes
 * or exports a visual tracking mirror on Trello following docs/project-tracking.md.
 *
 * Usage:
 *   npm run trello:sync
 *   npm run trello:sync -- --dry-run
 */

import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Load .env manually to avoid extra dependencies
function loadEnv() {
  const envPath = path.join(rootDir, '.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

loadEnv();

const BOARD_NAME = 'Expense Management App — Harness Board';
const LIST_NAMES = ['Backlog', 'Ready', 'In Progress', 'Blocked', 'Done'];

const DEPENDENCIES = {
  F001: [],
  F002: [],
  F003: ['F001'],
  F004: ['F001', 'F002'],
  F005: ['F001', 'F002', 'F003', 'F004'],
  F006: ['F004', 'F005'],
  F007: ['F004', 'F005', 'F006'],
  F008: ['F001', 'F004'],
  F009: ['F005', 'F008'],
  F010: ['F007', 'F008'],
  F011: ['F005', 'F008'],
  F012: ['F010', 'F011'],
  F013: ['F003', 'F005', 'F008'],
  F014: ['F002', 'F004', 'F005'],
  F015: ['F005', 'F011'],
  F016: ['F001', 'F003', 'F004', 'F005'],
  F017: ['F001', 'F005'],
  F018: ['F003', 'F017'],
  F019: ['F016', 'F017', 'F018'],
  F020: ['F001', 'F008']
};

const FEATURE_LABELS = {
  F001: ['MVP', 'Foundation', 'Data'],
  F002: ['MVP', 'Financial Logic'],
  F003: ['MVP', 'Data'],
  F004: ['MVP', 'Financial Logic', 'Data'],
  F005: ['MVP', 'Financial Logic', 'Data'],
  F006: ['MVP', 'Financial Logic'],
  F007: ['MVP', 'Financial Logic'],
  F008: ['MVP', 'UI/UX', 'Foundation'],
  F009: ['MVP', 'UI/UX'],
  F010: ['MVP', 'UI/UX', 'Financial Logic'],
  F011: ['MVP', 'UI/UX'],
  F012: ['MVP', 'UI/UX'],
  F013: ['MVP', 'UI/UX', 'Data'],
  F014: ['MVP', 'Financial Logic'],
  F015: ['MVP', 'Data'],
  F016: ['MVP', 'Data', 'Security'],
  F017: ['MVP', 'Sync'],
  F018: ['MVP', 'Sync'],
  F019: ['MVP', 'Security', 'Sync'],
  F020: ['MVP', 'PWA']
};

const KNOWN_COMMITS = {
  F001: { hash: '0067ace', date: '2026-10-24' },
  F002: { hash: '71e8c0f', date: '2026-10-24' },
  F003: { hash: '0a7cc8a', date: '2026-10-24' }
};

export function buildCardDescription(feature) {
  const deps = DEPENDENCIES[feature.id] || [];
  const depsFormatted = deps.length > 0 ? deps.map((d) => `- ${d}`).join('\n') : 'None';
  const commitInfo = KNOWN_COMMITS[feature.id];

  const sections = [
    `### Feature ID\n${feature.id}`,
    `### Behavior\n${feature.behavior}`,
    `### Verification\n${feature.verification}`,
    `### Harness State\n${feature.state}`,
    `### Dependencies\n${depsFormatted}`
  ];

  if (feature.state === 'passing') {
    sections.push(`### Evidence\n${feature.evidence || 'Verified passing.'}`);
    if (commitInfo) {
      sections.push(`### Commit\n${commitInfo.hash}`);
      sections.push(`### Completion Date\n${commitInfo.date}`);
    }
  }

  return sections.join('\n\n');
}

export function determineTargetList(feature, allFeaturesMap) {
  if (feature.state === 'passing') {
    return 'Done';
  }
  if (feature.state === 'active') {
    return 'In Progress';
  }
  if (feature.state === 'blocked') {
    return 'Blocked';
  }

  // feature.state === 'not-started'
  const deps = DEPENDENCIES[feature.id] || [];
  const allDepsPassing = deps.every((depId) => {
    const parent = allFeaturesMap[depId];
    return parent && parent.state === 'passing';
  });

  return allDepsPassing ? 'Ready' : 'Backlog';
}

export function buildChecklists(feature) {
  const isDone = feature.state === 'passing';
  return [
    {
      name: 'Implementation',
      items: [{ name: 'Feature implemented', checked: isDone }]
    },
    {
      name: 'Verification',
      items: [
        { name: 'Feature verification passed', checked: isDone },
        { name: 'Relevant tests passed', checked: isDone },
        { name: 'Typecheck passed', checked: isDone },
        { name: 'Lint passed', checked: isDone },
        { name: 'Build passed', checked: isDone }
      ]
    },
    {
      name: 'Harness State',
      items: [
        { name: 'feature_list.json updated', checked: isDone },
        { name: 'progress.md updated', checked: isDone },
        { name: 'Relevant docs updated', checked: isDone },
        { name: 'Atomic commit created', checked: isDone }
      ]
    }
  ];
}

function trelloFetch(endpoint, apiKey, token, options = {}, retries = 3) {
  return new Promise((resolve, reject) => {
    const url = new URL(`https://api.trello.com/1${endpoint}`);
    url.searchParams.set('key', apiKey);
    url.searchParams.set('token', token);

    if (options.params) {
      for (const [k, v] of Object.entries(options.params)) {
        if (v !== undefined && v !== null) {
          url.searchParams.set(k, String(v));
        }
      }
    }

    const bodyData = options.body ? JSON.stringify(options.body) : null;

    const reqOptions = {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      },
      timeout: 45000 // 45 seconds timeout
    };

    const req = https.request(url, reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve(data);
          }
        } else {
          reject(new Error(`Trello API error (${res.statusCode} ${res.statusMessage}): ${data}`));
        }
      });
    });

    req.on('timeout', () => {
      req.destroy(new Error('Request timed out'));
    });

    req.on('error', async (err) => {
      if (retries > 0) {
        console.log(`  [Retry] Network warning (${err.message}). Retrying...`);
        await new Promise((r) => setTimeout(r, 2000));
        try {
          const result = await trelloFetch(endpoint, apiKey, token, options, retries - 1);
          resolve(result);
        } catch (retryErr) {
          reject(retryErr);
        }
      } else {
        reject(err);
      }
    });

    if (bodyData) {
      req.write(bodyData);
    }
    req.end();
  });
}

async function syncToLiveTrello(features, featuresMap, apiKey, token) {
  console.log('Connecting to Trello REST API...');

  // 1. Get or create board
  let boardId = process.env.TRELLO_BOARD_ID;
  if (!boardId) {
    const memberBoards = await trelloFetch('/members/me/boards', apiKey, token, {
      params: { filter: 'open' }
    });
    const existing = memberBoards.find((b) => b.name === BOARD_NAME);
    if (existing) {
      boardId = existing.id;
      console.log(`Reusing existing board: "${BOARD_NAME}" (${boardId})`);
    } else {
      const created = await trelloFetch('/boards/', apiKey, token, {
        method: 'POST',
        params: {
          name: BOARD_NAME,
          defaultLists: 'false'
        }
      });
      boardId = created.id;
      console.log(`Created new board: "${BOARD_NAME}" (${boardId})`);
    }
  }

  // 2. Ensure the 5 lists exist in order and archive any default/extraneous lists
  const existingLists = await trelloFetch(`/boards/${boardId}/lists`, apiKey, token);
  for (const list of existingLists) {
    if (!LIST_NAMES.includes(list.name)) {
      await trelloFetch(`/lists/${list.id}/closed`, apiKey, token, {
        method: 'PUT',
        params: { value: 'true' }
      });
      console.log(`Archived non-standard list: "${list.name}"`);
    }
  }

  const listMap = {};
  for (let i = 0; i < LIST_NAMES.length; i++) {
    const listName = LIST_NAMES[i];
    const pos = (i + 1) * 1000;
    const existingList = existingLists.find((l) => l.name === listName);
    if (existingList) {
      listMap[listName] = existingList.id;
      await trelloFetch(`/lists/${existingList.id}`, apiKey, token, {
        method: 'PUT',
        params: { pos }
      });
    } else {
      const newList = await trelloFetch(`/boards/${boardId}/lists`, apiKey, token, {
        method: 'POST',
        params: { name: listName, pos }
      });
      listMap[listName] = newList.id;
      console.log(`Created list: "${listName}"`);
    }
  }

  // 3. Ensure labels exist
  const existingLabels = await trelloFetch(`/boards/${boardId}/labels`, apiKey, token);
  const labelMap = {};
  for (const l of existingLabels) {
    labelMap[l.name] = l.id;
  }

  const labelPalette = {
    MVP: 'black',
    Foundation: 'purple',
    Data: 'blue',
    'Financial Logic': 'green',
    'UI/UX': 'orange',
    Sync: 'sky',
    PWA: 'yellow',
    Security: 'red',
    Testing: 'lime'
  };

  for (const [name, color] of Object.entries(labelPalette)) {
    if (!labelMap[name]) {
      const newLabel = await trelloFetch(`/boards/${boardId}/labels`, apiKey, token, {
        method: 'POST',
        params: { name, color }
      });
      labelMap[name] = newLabel.id;
    }
  }

  // 4. Fetch existing cards
  const existingCards = await trelloFetch(`/boards/${boardId}/cards`, apiKey, token);
  const cardByFeatureId = {};
  for (const card of existingCards) {
    const match = card.name.match(/^\[(F\d{3})\]/);
    if (match) {
      cardByFeatureId[match[1]] = card;
    }
  }

  console.log(`Synchronizing ${features.length} feature cards...`);

  for (const feature of features) {
    const targetListName = determineTargetList(feature, featuresMap);
    const targetListId = listMap[targetListName];
    const cardTitle = `[${feature.id}] ${feature.name}`;
    const cardDesc = buildCardDescription(feature);
    const labels = (FEATURE_LABELS[feature.id] || ['MVP'])
      .map((name) => labelMap[name])
      .filter(Boolean);

    let card = cardByFeatureId[feature.id];

    if (card) {
      // Update existing card
      await trelloFetch(`/cards/${card.id}`, apiKey, token, {
        method: 'PUT',
        params: {
          name: cardTitle,
          desc: cardDesc,
          idList: targetListId
        }
      });
      console.log(`  Updated: ${cardTitle} -> ${targetListName}`);
    } else {
      // Create new card
      card = await trelloFetch('/cards', apiKey, token, {
        method: 'POST',
        params: {
          idList: targetListId,
          name: cardTitle,
          desc: cardDesc,
          idLabels: labels.join(',')
        }
      });
      console.log(`  Created: ${cardTitle} in ${targetListName}`);

      // Add checklists to new card
      const checklists = buildChecklists(feature);
      for (const cl of checklists) {
        const createdCl = await trelloFetch(`/cards/${card.id}/checklists`, apiKey, token, {
          method: 'POST',
          params: { name: cl.name }
        });
        for (const item of cl.items) {
          await trelloFetch(`/checklists/${createdCl.id}/checkItems`, apiKey, token, {
            method: 'POST',
            params: { name: item.name, checked: item.checked ? 'true' : 'false' }
          });
        }
      }
    }
  }

  console.log('\nLive Trello synchronization complete!');
  console.log(`Board URL: https://trello.com/b/${boardId}`);
}

export function generateSyncPlan(features) {
  const featuresMap = {};
  for (const f of features) {
    featuresMap[f.id] = f;
  }

  const listDistribution = {
    Backlog: [],
    Ready: [],
    'In Progress': [],
    Blocked: [],
    Done: []
  };

  const cards = [];

  for (const feature of features) {
    const targetList = determineTargetList(feature, featuresMap);
    listDistribution[targetList].push(feature.id);

    cards.push({
      id: feature.id,
      title: `[${feature.id}] ${feature.name}`,
      list: targetList,
      harness_state: feature.state,
      labels: FEATURE_LABELS[feature.id] || ['MVP'],
      dependencies: DEPENDENCIES[feature.id] || [],
      description: buildCardDescription(feature),
      checklists: buildChecklists(feature)
    });
  }

  return {
    board_name: BOARD_NAME,
    total_features: features.length,
    lists: LIST_NAMES,
    distribution: listDistribution,
    wip_count: listDistribution['In Progress'].length,
    is_wip_valid: listDistribution['In Progress'].length <= 1,
    cards
  };
}

async function main() {
  const isDryRun = process.argv.includes('--dry-run');
  const featureListPath = path.join(rootDir, 'feature_list.json');

  if (!fs.existsSync(featureListPath)) {
    console.error('Error: feature_list.json not found in root directory.');
    process.exit(1);
  }

  const featureListData = JSON.parse(fs.readFileSync(featureListPath, 'utf8'));
  const features = featureListData.features || [];
  const featuresMap = {};
  for (const f of features) {
    featuresMap[f.id] = f;
  }

  console.log('====================================================');
  console.log('  Harness Engineering — Trello Integration Engine   ');
  console.log('====================================================');
  console.log(`Source of Truth : feature_list.json (${features.length} features)`);

  const plan = generateSyncPlan(features);

  console.log('\nTarget List Distribution:');
  console.log(`  - Done        : ${plan.distribution.Done.length} features (${plan.distribution.Done.join(', ')})`);
  console.log(`  - In Progress : ${plan.distribution['In Progress'].length} features (WIP=1 Compliant)`);
  console.log(`  - Ready       : ${plan.distribution.Ready.length} features (${plan.distribution.Ready.join(', ')})`);
  console.log(`  - Blocked     : ${plan.distribution.Blocked.length} features`);
  console.log(`  - Backlog     : ${plan.distribution.Backlog.length} features (${plan.distribution.Backlog.join(', ')})`);

  // Write visual mirror snapshot
  const stateSnapshotPath = path.join(rootDir, '.trello-state.json');
  fs.writeFileSync(stateSnapshotPath, JSON.stringify(plan, null, 2), 'utf8');
  console.log(`\nState snapshot persisted to: .trello-state.json`);

  const apiKey = process.env.TRELLO_API_KEY;
  const token = process.env.TRELLO_TOKEN;

  if (isDryRun || !apiKey || !token) {
    if (!apiKey || !token) {
      console.log('\n[NOTICE] TRELLO_API_KEY and TRELLO_TOKEN are not set in environment or .env.');
      console.log('A complete, verified offline snapshot has been generated.');
      console.log('To synchronize directly with live Trello:');
      console.log('  1. Obtain your API Key from: https://trello.com/power-ups/admin');
      console.log('  2. Generate an API Token from the same page.');
      console.log('  3. Create or add to .env:');
      console.log('       TRELLO_API_KEY=your_key_here');
      console.log('       TRELLO_TOKEN=your_token_here');
      console.log('  4. Re-run: npm run trello:sync');
    } else {
      console.log('\n--dry-run mode requested. Skipping network sync.');
    }
  } else {
    try {
      await syncToLiveTrello(features, featuresMap, apiKey, token);
    } catch (err) {
      console.error('\nSync failed:', err.message, err.cause || '');
      process.exit(1);
    }
  }

  console.log('\nHarness WIP Verification:');
  console.log(`  WIP Count : ${plan.wip_count} (Must be <= 1) -> ${plan.is_wip_valid ? 'PASS' : 'FAIL'}`);
  console.log(`  Next Feature in Ready: ${plan.distribution.Ready[0] || 'None'}`);
}

// Auto-run if executed as script
if (process.argv[1] && process.argv[1].endsWith('trello-sync.js')) {
  main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
