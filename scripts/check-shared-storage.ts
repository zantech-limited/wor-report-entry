import assert from 'node:assert/strict';
import {Storage,defaultConfig,validateConfig,readConfig} from '../src/lib/storage';
import {databaseIdentifier,verifyDatabaseIdentifier} from '../src/lib/database-identity';
import {connectExistingStorage} from '../src/lib/shared-storage';
async function main(){
assert(process.env.DATA_DIR?.includes('.checks'));
const config=validateConfig({...defaultConfig,engine:'supabase',host:'aws-0-test.pooler.supabase.com',port:5432,database:'postgres',username:'postgres.test',password:'test',tls:true});
assert.equal(config.engine,'supabase');
assert.throws(()=>validateConfig({...config,tls:false}),/requires TLS/);
assert.throws(()=>validateConfig({...config,databaseCode:'1234'}),/identifier/);
const first=new Storage(defaultConfig);await first.initialize();
const codes=await Promise.all(Array.from({length:8},()=>databaseIdentifier(first)));
assert(codes.every(code=>code===codes[0]));assert.match(codes[0],/^\d{5}$/);
await first.close();
const second=new Storage(defaultConfig);await second.initialize();
assert.equal(await databaseIdentifier(second),codes[0]);
await verifyDatabaseIdentifier(second,codes[0]);
await assert.rejects(()=>verifyDatabaseIdentifier(second,codes[0]==='10000'?'10001':'10000'),/does not match/);
assert.equal(await databaseIdentifier(second),codes[0]);
await assert.rejects(()=>connectExistingStorage({...defaultConfig,databaseCode:codes[0]}),/remote database/);
assert.equal(readConfig().engine,'sqlite');
await second.close();
console.log('Supabase config, TLS requirement, five-digit identifier persistence, race safety, wrong-code rejection and local-data protection passed');
}
main().catch(error=>{console.error(error);process.exit(1)});
