"use client";
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {Button} from './ui/button';
import {Input} from './ui/input';
import {Label} from './ui/label';
import {masterHref} from '@/lib/desk-filters';
type Customer={name:string;jobs:number;active:boolean;preferred:string;similar:string[]};
export function CustomersPage(){
  const [customers,setCustomers]=useState<Customer[]>([]);
  const [allowed,setAllowed]=useState(false);
  const [ready,setReady]=useState(false);
  const [search,setSearch]=useState('');
  const [name,setName]=useState('');
  const [original,setOriginal]=useState('');
  const [removed,setRemoved]=useState(false);
  const [pending,setPending]=useState(false);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  useEffect(()=>{void(async()=>{
    try{
      const [catalog,session]=await Promise.all([fetch('/api/admin/customers'),fetch('/api/admin/session')]);
      if(!catalog.ok)throw new Error('Could not load customers.');
      setCustomers((await catalog.json()).customers);setAllowed((await session.json()).authenticated);
    }catch(e){setError(e instanceof Error?e.message:'Could not load customers.');}finally{setReady(true);}
  })();},[]);
  async function save(body:unknown){
    setPending(true);setError('');setMessage('');
    try{
      const response=await fetch('/api/admin/customers',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      const data=await response.json();if(!response.ok)throw new Error(data.error);
      setCustomers(data.customers);setName('');setOriginal('');setMessage('Customer dropdown updated for future work orders. Historical names are unchanged. Reload Entry to refresh autofill.');
    }catch(e){setError(e instanceof Error?e.message:'Could not save customers.');}finally{setPending(false);}
  }
  return <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 sm:px-6">
    <header><h1 className="text-2xl font-semibold">Customers</h1><p className="mt-1 text-sm text-muted-foreground">Alphabetical customer directory and possible spelling variations.</p></header>
    {error && <p role="alert" className="rounded-xl border bg-destructive/10 p-4 text-destructive">{error}</p>}
    <p role="status" className={message?'rounded-xl border bg-accent p-4 text-sm':'sr-only'}>{message}</p>
    {!ready?<p>Loading customers…</p>:<>
      {!allowed && <p className="rounded-xl border bg-card p-4 text-sm">Read-only view. <Link className="text-primary underline" href="/admin">Unlock Admin</Link> to edit or consolidate names.</p>}
      {allowed && <form className="grid gap-3 rounded-xl border bg-card p-5 sm:grid-cols-[1fr_auto]" onSubmit={e=>{e.preventDefault();void save({name,active:true,...(original && original!==name?{names:[original],preferred:name}:{})});}}>
        <div className="grid gap-2"><Label htmlFor="customer-name">{original?'Preferred customer name':'New customer'}</Label><Input id="customer-name" value={name} onChange={e=>setName(e.target.value)} /></div>
        <div className="flex items-end gap-2"><Button type="button" variant="ghost" onClick={()=>{setName('');setOriginal('');}}>Clear</Button><Button type="submit" disabled={pending||!name.trim()}>{original?'Save preferred name':'Add customer'}</Button></div>
      </form>}
      <div className="flex flex-wrap items-end gap-4"><div className="grid flex-1 gap-2"><Label htmlFor="customer-search">Search customers</Label><Input id="customer-search" value={search} onChange={e=>setSearch(e.target.value)} /></div><label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={removed} onChange={e=>setRemoved(e.target.checked)}/>Show removed or consolidated</label></div>
      <p className="text-sm text-muted-foreground">{customers.filter(c=>c.active).length} active customer names. Similar names are suggestions for review, not automatic matches.</p>
      <ul className="divide-y rounded-xl border bg-card">
        {customers.filter(c=>(removed||c.active)&&c.name.toLowerCase().includes(search.toLowerCase())).map(c=><li key={c.name} className="grid gap-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-medium">{c.name}</p><Link className="text-sm text-primary underline" href={masterHref({customer:c.name})}>{c.jobs} historical work orders</Link>{c.preferred&&<p className="text-xs text-muted-foreground">Future name: {c.preferred}</p>}{!c.active&&!c.preferred&&<p className="text-xs text-muted-foreground">Removed from dropdowns</p>}</div>
            {allowed&&<div className="flex gap-2"><Button variant="outline" onClick={()=>{setOriginal(c.name);setName(c.name);}}>Edit</Button><Button variant="ghost" disabled={pending} onClick={()=>void save({name:c.name,active:!c.active})}>{c.active?'Remove from dropdown':'Restore to dropdown'}</Button></div>}
          </div>
          {c.active&&c.similar.length>0&&<details className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm"><summary className="cursor-pointer font-medium">Possible similar names ({c.similar.length})</summary><p className="mt-2 text-xs">Confirm these are the same customer. Consolidation combines future dropdown and autofill suggestions; past work orders remain unchanged.</p><ul className="mt-3 space-y-2">{c.similar.map(other=><li key={other} className="flex flex-wrap items-center justify-between gap-2"><span>{other}</span>{allowed&&<Button disabled={pending} variant="outline" onClick={()=>void save({name:c.name,active:true,names:[c.name,other],preferred:c.name})}>Use {c.name} for both</Button>}</li>)}</ul></details>}
        </li>)}
      </ul>
    </>}
  </div>;
}
