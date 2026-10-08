import { appSchema, tableSchema } from '@nozbe/watermelondb';

export const schema = appSchema({
  version: 1,
  tables: [
    tableSchema({
      name: 'documents',
      columns: [
        { name: 'server_id', type: 'string', isIndexed: true },
        { name: 'type', type: 'string', isIndexed: true },
        { name: 'counterparty_name', type: 'string' },
        { name: 'file_path', type: 'string' },
        { name: 'file_size', type: 'number' },
        { name: 'status', type: 'string' }, // pending, processing, completed, failed
        { name: 'confidence', type: 'number' },
        { name: 'extracted_data', type: 'string' }, // JSON stringified
        { name: 'uploaded_at', type: 'number' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
        { name: 'synced_at', type: 'number', isOptional: true },
        { name: 'sync_pending', type: 'boolean' },
      ],
    }),
    tableSchema({
      name: 'transactions',
      columns: [
        { name: 'server_id', type: 'string', isIndexed: true },
        { name: 'document_id', type: 'string', isIndexed: true },
        { name: 'type', type: 'string' }, // income, expense, transfer
        { name: 'category', type: 'string' },
        { name: 'amount', type: 'number' },
        { name: 'currency', type: 'string' },
        { name: 'description', type: 'string' },
        { name: 'date', type: 'number' },
        { name: 'payee', type: 'string' },
        { name: 'account', type: 'string' },
        { name: 'notes', type: 'string', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
        { name: 'synced_at', type: 'number', isOptional: true },
        { name: 'sync_pending', type: 'boolean' },
      ],
    }),
    tableSchema({
      name: 'properties',
      columns: [
        { name: 'server_id', type: 'string', isIndexed: true },
        { name: 'name', type: 'string' },
        { name: 'type', type: 'string' }, // residential, commercial, land
        { name: 'address', type: 'string' },
        { name: 'city', type: 'string' },
        { name: 'state', type: 'string' },
        { name: 'postal_code', type: 'string' },
        { name: 'purchase_price', type: 'number' },
        { name: 'current_value', type: 'number' },
        { name: 'acquisition_date', type: 'number' },
        { name: 'ownership_percentage', type: 'number' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
        { name: 'synced_at', type: 'number', isOptional: true },
        { name: 'sync_pending', type: 'boolean' },
      ],
    }),
    tableSchema({
      name: 'sync_queue',
      columns: [
        { name: 'entity_type', type: 'string' }, // document, transaction, property
        { name: 'entity_id', type: 'string', isIndexed: true },
        { name: 'operation', type: 'string' }, // create, update, delete
        { name: 'payload', type: 'string' }, // JSON stringified
        { name: 'retry_count', type: 'number' },
        { name: 'last_error', type: 'string', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'attempted_at', type: 'number', isOptional: true },
      ],
    }),
    tableSchema({
      name: 'sync_log',
      columns: [
        { name: 'status', type: 'string' }, // success, error, pending
        { name: 'entity_type', type: 'string' },
        { name: 'sync_duration_ms', type: 'number' },
        { name: 'items_synced', type: 'number' },
        { name: 'error_message', type: 'string', isOptional: true },
        { name: 'timestamp', type: 'number' },
      ],
    }),
  ],
});
