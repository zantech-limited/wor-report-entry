import {randomInt} from 'node:crypto';
import type {Storage} from './storage';

export async function databaseIdentifier(db:Storage, create = true):Promise<string> {
  const key='database-identifier';
  let row=await db.prepare('SELECT value FROM meta WHERE key = ?').get(key);
  if (!row && create) {
    const code=String(randomInt(10000,100000));
    await db.query('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING',[key,code]);
    row=await db.prepare('SELECT value FROM meta WHERE key = ?').get(key);
  }
  if (!row || !/^\d{5}$/.test(String(row.value))) throw new Error('Database identifier is missing or invalid. Open Admin on the original instance first.');
  return String(row.value);
}

export async function verifyDatabaseIdentifier(db:Storage, expected:string) {
  if(!/^\d{5}$/.test(expected)) throw new Error('Enter the permanent five-digit database identifier.');
  const code=await databaseIdentifier(db,false);
  if(code!==expected) throw new Error('Database identifier does not match. No connection settings were changed.');
  return code;
}
