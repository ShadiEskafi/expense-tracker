import Dexie from 'dexie';

export const DB_NAME = 'ExpenseTrackerDB';
export const DB_VERSION = 1;

export const SCHEMA_V1 = {
  accounts: 'id, user_id, name, type, is_archived, deleted_at, updated_at, sync_version',
  categories: 'id, user_id, slug, type, is_default, deleted_at, updated_at, sync_version',
  transactions: 'id, user_id, type, date, category_id, account_id, destination_account_id, deleted_at, updated_at, sync_version, *tags',
  offline_mutation_queue: 'id, entity_type, entity_id, status, client_timestamp',
  conflict_audit_log: 'id, entity_type, entity_id, resolved_at',
  settings: 'key, updated_at'
};

export class ExpenseDatabase extends Dexie {
  constructor(dbName = DB_NAME, options = {}) {
    super(dbName, options);

    this.version(DB_VERSION).stores(SCHEMA_V1);

    this.accounts = this.table('accounts');
    this.categories = this.table('categories');
    this.transactions = this.table('transactions');
    this.offline_mutation_queue = this.table('offline_mutation_queue');
    this.conflict_audit_log = this.table('conflict_audit_log');
    this.settings = this.table('settings');
  }

  /**
   * Resets all tables in the database (useful for testing, logout, or state wipe)
   */
  async resetDatabase() {
    await this.transaction('rw', this.tables, async () => {
      await Promise.all(this.tables.map((table) => table.clear()));
    });
  }
}

export const db = new ExpenseDatabase();
