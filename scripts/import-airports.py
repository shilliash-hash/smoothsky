"""Import OurAirports Europe CSVs; credentials read only from environment.
Usage: python3 scripts/import-airports.py /tmp/airports.csv /tmp/runways.csv
Dataset: https://ourairports.com/data/ (public domain). Fuel stays unknown.
"""
import csv,json,os,sys,urllib.request
from collections import defaultdict
runways=defaultdict(list)
with open(sys.argv[2]) as f:
    for r in csv.DictReader(f):
        if r['closed']=='0' and r['length_ft']: runways[r['airport_ident']].append(r)
rows=[]
with open(sys.argv[1]) as f:
    for a in csv.DictReader(f):
        if a['continent']!='EU' or a['type'] not in ('small_airport','medium_airport','large_airport'): continue
        ident=a['icao_code'] or a['ident']
        r=max(runways[a['ident']],key=lambda r:float(r['length_ft']),default={})
        length=round(float(r['length_ft'])) if r else None
        size= (7 if length and length>=12000 else 6) if a['type']=='large_airport' else (5 if length and length>=8000 else 4) if a['type']=='medium_airport' else (3 if length and length>=4000 else 2 if length and length>=2000 else 1)
        rows.append(dict(icao=ident,iata=a['iata_code'] or None,name=a['name'],city=a['municipality'] or a['name'],country=a['iso_country'],lat=float(a['latitude_deg']),lon=float(a['longitude_deg']),elevation_ft=round(float(a['elevation_ft'])) if a['elevation_ft'] else None,airport_type=a['type'],size=size,longest_runway_ft=length,runway_surface=r.get('surface') or None,data_source='OurAirports (public domain)',classification_source='provisional infrastructure curve'))
url=os.environ['SUPABASE_URL'].rstrip('/')+'/rest/v1/airports?on_conflict=icao'
key=os.environ['SUPABASE_SERVICE_ROLE_KEY']
for i in range(0,len(rows),250):
    req=urllib.request.Request(url,data=json.dumps(rows[i:i+250]).encode(),headers={'apikey':key,'Authorization':'Bearer '+key,'Content-Type':'application/json','Prefer':'resolution=merge-duplicates,return=minimal'},method='POST')
    with urllib.request.urlopen(req) as res: assert res.status in (200,201,204)
print('Imported European airports:',len(rows),'with runway data:',sum(r['longest_runway_ft'] is not None for r in rows))
