import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {writeWorkbook} from '../src/lib/excel';
import {blankLine,type Report} from '../src/lib/model';
async function main(){
mkdirSync('.checks/bulk-ui',{recursive:true});
for(const i of [1,2]){
const report:Report={id:`bulk-${i}`,title:'Bulk QA',preparedBy:'Bulk import QA',sourceFilename:null,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),prefixMap:[],lines:[{...blankLine(String(i)),wor:'BULK-UI-QA',date:'2026-10-05',customer:`Bulk QA ${i}`,copycount:'1234567'},{...blankLine('55'),wor:'N/A',date:'2026-10-06',customer:`Bulk NA ${i}`}]};
writeFileSync(`.checks/bulk-ui/qa-${i}.xlsm`,await writeWorkbook(readFileSync('templates/monthly-service-report.xlsm'),report));
}
writeFileSync('.checks/bulk-ui/qa-invalid.xlsm','Invalid workbook test');
}
main();
