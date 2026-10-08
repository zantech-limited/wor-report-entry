import {Storage,saveConfig,pauseWrites,type StorageConfig} from './storage';
import {verifyDatabaseIdentifier} from './database-identity';

export async function connectExistingStorage(config:StorageConfig) {
  if(config.engine==='sqlite') throw new Error('Shared connection requires a remote database.');
  const target=new Storage(config);
  try {
    const code=await verifyDatabaseIdentifier(target,config.databaseCode ?? '');
    // Verify the app schema before saving credentials; do not create or copy data.
    await target.query('SELECT id FROM reports LIMIT 1');
    await target.query('SELECT key FROM meta WHERE key = ?',['seeded']);
    saveConfig({...config,databaseCode:code});
    pauseWrites();
    return code;
  } finally {await target.close();}
}
