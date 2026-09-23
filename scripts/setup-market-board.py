"""Set up requested real-data sources, then add compatible widgets via public APIs."""
import time
import uuid
import httpx

with httpx.Client(base_url='http://127.0.0.1:8000',timeout=30) as client:
    for source_id in ('tushare-ashare','tushare-indices'):
        response=client.post(f'/api/market-sources/{source_id}/sync');response.raise_for_status()
        for _ in range(180):
            sources=client.get('/api/market-sources').json()['sources']
            source=next(s for s in sources if s['id']==source_id)
            if source['state']['status']!='running':
                print(source_id,source['state'],flush=True)
                if source['state']['status']!='ready':raise RuntimeError('Source sync failed; no widgets added.')
                break
            time.sleep(1)
        else:raise RuntimeError('Sync still running; inspect source page.')
    catalog=client.get('/api/widgets/catalog').json()['widgets']
    board=client.get('/api/boards/finance').json()
    existing={w['kind'] for g in board['groups'] for w in g['widgets']}
    groups=[]
    for title,kinds in [('A 股全景',['market-map','market-breadth']),('指数与行业',['index-board','industry-board'])]:
        widgets=[]
        for kind in kinds:
            if kind in existing:continue
            definition=next(w for w in catalog if w['kind']==kind)
            dataset=next(d for d in definition['datasets'] if d['compatible'] and d.get('read_only'))
            widgets.append({'id':str(uuid.uuid4()),'kind':kind,'sources':{definition['slot']:dataset['id']},'size':definition['default_size'],'options':{'area':'total_mv'}})
        if widgets:groups.append({'id':str(uuid.uuid4()),'title':title,'widgets':widgets})
    if groups:
        saved=client.put('/api/boards/finance',json={'revision':board['revision'],'groups':board['groups']+groups});saved.raise_for_status()
        print('Saved finance board revision',saved.json()['revision'],'new groups',len(groups),flush=True)
