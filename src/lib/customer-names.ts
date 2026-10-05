export function normalizedCustomer(name:string) {return name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g,'');}
export function similarCustomer(left:string,right:string) {
  const a=normalizedCustomer(left),b=normalizedCustomer(right);
  if(!a || !b) return false;
  if(a===b) return true;
  if(Math.min(a.length,b.length)<5 || Math.abs(a.length-b.length)>3) return false;
  let previous=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=1;i<=a.length;i++) {
    const next=[i];
    for(let j=1;j<=b.length;j++) next[j]=Math.min(next[j-1]+1,previous[j]+1,previous[j-1]+(a[i-1]===b[j-1]?0:1));
    previous=next;
  }
  return previous[b.length]<=Math.max(a.length,b.length)*0.2;
}
