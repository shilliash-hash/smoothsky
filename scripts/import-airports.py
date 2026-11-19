"""Generate reviewable SQL for European OurAirports import (no credentials).
Usage: python3 scripts/import-airports.py /tmp/airports.csv /tmp/runways.csv > /tmp/airports-import.sql
Apply the reviewed data-only SQL with Lovable Cloud data tools, not a migration.
Source: https://ourairports.com/data/ (public domain).
"""
import csv,sys
from collections import defaultdict
runways=defaultdict(list)
with open(sys.argv[2]) as f:
 for r in csv.DictReader(f):
  if r['closed']=='0' and r['length_ft']:runways[r['airport_ident']].append(r)
def sql(value):return 'NULL' if value is None else "'"+str(value).replace("'","''")+"'"
rows={}
with open(sys.argv[1]) as f:
 for a in csv.DictReader(f):
  if a['continent']!='EU' or a['type'] not in ('small_airport','medium_airport','large_airport'):continue
  ident=(a['icao_code'] or a.get('gps_code') or a['ident']).upper();r=max(runways[a['ident']],key=lambda r:float(r['length_ft']),default={});length=round(float(r['length_ft'])) if r else None
  size=(7 if length and length>=12000 else 6) if a['type']=='large_airport' else (5 if length and length>=8000 else 4) if a['type']=='medium_airport' else (3 if length and length>=4000 else 2 if length and length>=2000 else 1)
  military=any(term in (a['name']+' '+a.get('keywords','')).lower() for term in ('air base','airbase','military','naval air','army air','raf ','flughorst','air force','aerodrome militaire')) or ident in ('EPOK','EEEI','EKSP')
  if military:
   paved=[x for x in runways[a['ident']] if any(term in x['surface'].upper() for term in ('ASP','CON','PEM','BIT','TAR','PAV'))]
   if not paved:continue
   r=max(paved,key=lambda x:float(x['length_ft']));length=round(float(r['length_ft']));size=3 if length>=4000 else 2 if length>=2000 else 1
  rows[ident]=[ident,a['iata_code'] or None,a['name'],a['municipality'] or a['name'],a['iso_country'],a['latitude_deg'],a['longitude_deg'],round(float(a['elevation_ft'])) if a['elevation_ft'] else None,a['type'],size,length,r.get('surface') or None,'OurAirports (public domain)','provisional military infrastructure curve' if military else 'provisional infrastructure curve']
cols='icao,iata,name,city,country,lat,lon,elevation_ft,airport_type,size,longest_runway_ft,runway_surface,data_source,classification_source'.split(',')
values=list(rows.values())
for i in range(0,len(values),250):
 print('INSERT INTO public.airports('+','.join(cols)+') VALUES '+','.join('('+','.join(sql(x) for x in r)+')' for r in values[i:i+250])+' ON CONFLICT(icao) DO UPDATE SET '+','.join(c+'=excluded.'+c for c in cols[1:])+';')
