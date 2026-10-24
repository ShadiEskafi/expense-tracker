import { describe, it, expect } from 'vitest';
import {
  buildCardDescription,
  determineTargetList,
  buildChecklists,
  generateSyncPlan,
  syncCardChecklists
} from './trello-sync.js';

describe('Trello Synchronization & Project Tracking Layer', () => {
  const sampleFeatures = [
    {
      id: 'F001',
      name: 'Local-First IndexedDB Schema',
      behavior: 'Dexie client initialized',
      verification: 'npm test src/db/db.test.js',
      state: 'passing',
      evidence: 'All 9 tests passed'
    },
    {
      id: 'F002',
      name: 'Monetary Precision Engine',
      behavior: 'Converts currency strings to minor units',
      verification: 'npm test src/utils/currency.test.js',
      state: 'passing',
      evidence: 'All 34 tests passed'
    },
    {
      id: 'F003',
      name: 'Deterministic Category Pre-seeding',
      behavior: 'Pre-populates default categories',
      verification: 'npm test src/services/category.test.js',
      state: 'passing',
      evidence: 'All 19 tests passed'
    },
    {
      id: 'F004',
      name: 'Account Management & Balance Service',
      behavior: 'Calculates balances from ledger',
      verification: 'npm test src/services/account.test.js',
      state: 'not-started',
      evidence: null
    },
    {
      id: 'F005',
      name: 'Transaction CRUD',
      behavior: 'Records, edits, soft-deletes transactions',
      verification: 'npm test src/services/transaction.test.js',
      state: 'not-started',
      evidence: null
    }
  ];

  const featuresMap = {};
  for (const f of sampleFeatures) {
    featuresMap[f.id] = f;
  }

  describe('1. Card Formatting & Descriptions', () => {
    it('builds comprehensive card description with all required Harness sections', () => {
      const desc = buildCardDescription(sampleFeatures[0]);
      expect(desc).toContain('### Feature ID\nF001');
      expect(desc).toContain('### Behavior\nDexie client initialized');
      expect(desc).toContain('### Verification\nnpm test src/db/db.test.js');
      expect(desc).toContain('### Harness State\npassing');
      expect(desc).toContain('### Evidence\nAll 9 tests passed');
      expect(desc).toContain('### Commit\n0067ace');
      expect(desc).toContain('### Completion Date\n2026-10-24');
    });

    it('omits commit and evidence sections for not-started features', () => {
      const desc = buildCardDescription(sampleFeatures[3]); // F004
      expect(desc).toContain('### Feature ID\nF004');
      expect(desc).toContain('### Harness State\nnot-started');
      expect(desc).not.toContain('### Commit\n');
      expect(desc).not.toContain('### Evidence\n');
    });
  });

  describe('2. State to List Mapping', () => {
    it('maps passing features directly to Done', () => {
      expect(determineTargetList(sampleFeatures[0], featuresMap)).toBe('Done');
      expect(determineTargetList(sampleFeatures[1], featuresMap)).toBe('Done');
      expect(determineTargetList(sampleFeatures[2], featuresMap)).toBe('Done');
    });

    it('maps active features to In Progress', () => {
      const activeFeature = { ...sampleFeatures[3], state: 'active' };
      expect(determineTargetList(activeFeature, featuresMap)).toBe('In Progress');
    });

    it('maps blocked features to Blocked', () => {
      const blockedFeature = { ...sampleFeatures[3], state: 'blocked' };
      expect(determineTargetList(blockedFeature, featuresMap)).toBe('Blocked');
    });

    it('maps not-started with satisfied dependencies to Ready', () => {
      // F004 depends on F001 and F002, which are both passing
      expect(determineTargetList(sampleFeatures[3], featuresMap)).toBe('Ready');
    });

    it('maps not-started with unsatisfied dependencies to Backlog', () => {
      // F005 depends on F004, which is not passing
      expect(determineTargetList(sampleFeatures[4], featuresMap)).toBe('Backlog');
    });
  });

  describe('3. Card Completion Checklists', () => {
    it('creates 3 required checklists with all items checked for passing features', () => {
      const checklists = buildChecklists(sampleFeatures[0]); // passing
      expect(checklists).toHaveLength(3);
      expect(checklists[0].name).toBe('Implementation');
      expect(checklists[1].name).toBe('Verification');
      expect(checklists[2].name).toBe('Harness State');

      // All items should be checked
      for (const cl of checklists) {
        for (const item of cl.items) {
          expect(item.checked).toBe(true);
        }
      }
    });

    it('creates checklists with items unchecked for non-passing features', () => {
      const checklists = buildChecklists(sampleFeatures[3]); // not-started
      for (const cl of checklists) {
        for (const item of cl.items) {
          expect(item.checked).toBe(false);
        }
      }
    });
  });

  describe('4. Sync Plan Generation & Invariants', () => {
    it('generates a valid plan respecting WIP=1 and 1:1 mapping', () => {
      const plan = generateSyncPlan(sampleFeatures);
      expect(plan.total_features).toBe(5);
      expect(plan.cards).toHaveLength(5);
      expect(plan.distribution.Done).toEqual(['F001', 'F002', 'F003']);
      expect(plan.distribution.Ready).toEqual(['F004']);
      expect(plan.distribution.Backlog).toEqual(['F005']);
      expect(plan.distribution['In Progress']).toHaveLength(0);
      expect(plan.is_wip_valid).toBe(true);
    });
  });

  describe('5. Card Checklist Live Synchronization', () => {
    it('updates existing incomplete checkItems to complete when feature is passing', async () => {
      const calls = [];
      const mockFetch = async (endpoint, apiKey, token, options) => {
        calls.push({ endpoint, options });
        return { id: 'mock-id' };
      };

      const existingChecklists = [
        {
          id: 'cl-1',
          name: 'Implementation',
          checkItems: [
            { id: 'item-1', name: 'Feature implemented', state: 'incomplete' }
          ]
        }
      ];

      const targetChecklists = [
        {
          name: 'Implementation',
          items: [{ name: 'Feature implemented', checked: true }]
        }
      ];

      await syncCardChecklists('card-123', existingChecklists, targetChecklists, 'key', 'token', mockFetch);

      expect(calls).toHaveLength(1);
      expect(calls[0].endpoint).toBe('/cards/card-123/checkItem/item-1');
      expect(calls[0].options.method).toBe('PUT');
      expect(calls[0].options.params.state).toBe('complete');
    });

    it('does nothing when checkItems already match target state (idempotent)', async () => {
      const calls = [];
      const mockFetch = async (endpoint, apiKey, token, options) => {
        calls.push({ endpoint, options });
        return { id: 'mock-id' };
      };

      const existingChecklists = [
        {
          id: 'cl-1',
          name: 'Implementation',
          checkItems: [
            { id: 'item-1', name: 'Feature implemented', state: 'complete' }
          ]
        }
      ];

      const targetChecklists = [
        {
          name: 'Implementation',
          items: [{ name: 'Feature implemented', checked: true }]
        }
      ];

      await syncCardChecklists('card-123', existingChecklists, targetChecklists, 'key', 'token', mockFetch);

      expect(calls).toHaveLength(0);
    });
  });
});
