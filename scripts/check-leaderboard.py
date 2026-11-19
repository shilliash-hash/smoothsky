"""Integration check using a locally minted preview session; never prints credentials."""
import asyncio
import json
from pathlib import Path
from playwright.async_api import async_playwright


async def main():
    with (Path.home() / '.cache/lovable-auth/session.json').open() as file:
        minted = json.load(file)
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        page = await browser.new_page(viewport={"width": 1280, "height": 1800})
        await page.goto('http://localhost:8080')
        await page.evaluate('([k,v]) => localStorage.setItem(k,v)', [minted['storage_key'], json.dumps(minted['session'])])
        result = await page.evaluate('''async () => {
          const {supabase: db} = await import('/src/integrations/supabase/client.ts');
          const ranking = await db.rpc('get_public_leaderboard');
          if (ranking.error) throw ranking.error;
          const forbidden = ['email','user_id','company_id','telemetry'];
          if (ranking.data.some(row => forbidden.some(key => key in row))) throw Error('Private ranking field');
          const access = await db.rpc('is_admin');
          if (!access.data) {
            const edit = await db.rpc('set_company_supporter', {p_company: crypto.randomUUID(), p_supporter:true});
            const users = await db.rpc('admin_company_supporters');
            if (edit.error?.code !== '42501' || users.error?.code !== '42501') throw Error('Supporter permission failure');
          }
          const company = await db.from('companies').select('*').maybeSingle();
          if (company.error) throw company.error;
          if (company.data) {
            const [cash, fleet, bases, ledger, flights] = await Promise.all([
              db.from('company_ledger').select('balance_after').order('id', {ascending:false}).limit(1),
              db.from('fleet_aircraft').select('*'), db.from('company_fobs').select('*'),
              db.from('company_ledger').select('amount,reference,entry_type').in('entry_type',['FOB_SETUP','FOB_MODULE']),
              db.from('flights').select('status,passengers,estimated_minutes,settlement')
            ]);
            for (const response of [cash,fleet,bases,ledger,flights]) if (response.error) throw response.error;
            const activeBases = new Set(bases.data.filter(b=>!b.closed_at).map(b=>b.id));
            const expected = Number(cash.data[0]?.balance_after ?? 0)
              + fleet.data.filter(f=>!f.returned_at).reduce((sum,f)=>sum+Number(f.ownership==='OWNED'?f.purchase_price:f.lease_deposit),0)
              + ledger.data.filter(l=>activeBases.has(l.reference)).reduce((sum,l)=>sum+Number(l.amount),0);
            const own = ranking.data.find(row=>row.icao_code===company.data.icao_code);
            if (!own || Math.abs(Number(own.net_worth)-expected)>0.005) throw Error('Net worth mismatch');
            const completed = flights.data.filter(f=>f.status==='COMPLETED');
            if (Number(own.flight_count)!==completed.length) throw Error('Completed-flight count mismatch');
            if (Number(own.passengers)!==completed.reduce((sum,f)=>sum+f.passengers,0)) throw Error('Passenger count mismatch');
            const hours = completed.reduce((sum,f)=>sum+Number(f.settlement?.minutes??f.estimated_minutes)/60,0);
            if (Math.abs(Number(own.flight_hours)-hours)>0.000001) throw Error('Simulated hours mismatch');
          }
          return {ranking:true,privacy:true,permissions:true,ownerTotals:!!company.data};
        }''')
        print(result)
        await browser.close()


asyncio.run(main())