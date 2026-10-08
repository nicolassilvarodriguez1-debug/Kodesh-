import json, re, unicodedata, difflib, collections
B=json.load(open('/home/claude/kodesh-/biblia-rvr.json'))
A=[json.loads(x) for x in open('Bible-Geocoding-Data/data/ancient.jsonl')]
def strip(s): return ''.join(c for c in unicodedata.normalize('NFD',s) if unicodedata.category(c)!='Mn')
def key(s):
    s=strip(s).lower().replace('-','').replace(' ','')
    for a,b in [('th','t'),('ph','f'),('ch','c'),('sh','s'),('kh','c'),('k','c'),('q','c'),('z','s'),('v','b'),('y','i'),('j','i'),('w','u'),('h','')]: s=s.replace(a,b)
    s=re.sub(r'(.)\1',r'\1',s)
    return s
TOK=re.compile(r"[A-ZÁÉÍÓÚÑ][\wáéíóúñü]*(?:-[\wáéíóúñü]+)*")
import collections as _c
LOW=_c.Counter(w for b in B.values() for c in b.values() for t in c.values() for w in re.findall(r"\b[a-záéíóúñü]+\b",t))
places=[]; byverse=collections.defaultdict(list); stats=collections.Counter()
for p in A:
    ids=p.get('identifications') or []
    ll=None; conf=0
    for i in ids:
        for r in i.get('resolutions',[]):
            if r.get('lonlat'): ll=r['lonlat']; break
        if ll: conf=(i.get('score') or {}).get('time_total',0); break
    if not ll: stats['nocoord']+=1; continue
    lon,lat=map(float,ll.split(','))
    en=set((p.get('translation_name_counts') or {}).keys()) | {re.sub(r'\s+\d+$','',p['friendly_id'])}
    enk=[key(x) for x in en]
    votes=collections.Counter(); hits=[]
    for v in (p.get('verses') or []):
        m=re.match(r'^(\w+) (\d+):(\d+)$',v['usx']); 
        if not m: continue
        b,c,vs=m.group(1),m.group(2),m.group(3)
        t=B.get(b,{}).get(c,{}).get(vs)
        if not t: continue
        toks=TOK.findall(t)
        cands=toks+[a+' '+b2 for a,b2 in zip(toks,toks[1:]) if a not in ('Y','El','La','Los','Las','De','Del','En','A','Al','O','E') and (a+' '+b2) in t]
        best=None;bs=0
        for tk in cands:
            k=key(tk)
            if len(k)<2 or (len(k)<3 and k not in enk): continue
            sc=max(difflib.SequenceMatcher(None,k,e).ratio() for e in enk)
            if sc>bs: bs,best=sc,tk
        if best and bs>=0.78:
            if LOW[best.lower()]>15:
                i=t.find(best)
                pre=t[:i].rstrip()
                if i<=0 or pre.endswith(('.',':',';','?','!','¿','¡')): continue
            votes[best]+=1; hits.append((b,int(c),int(vs),best))
    if not votes: stats['nomatch']+=1; continue
    name,n=votes.most_common(1)[0]
    tot=len(p.get('verses') or [])
    if n < max(1,0.3*min(tot,40)) : stats['weak']+=1; continue
    forms=[f for f,k in votes.items() if (k>=max(1,n*0.15) and difflib.SequenceMatcher(None,key(f),key(name)).ratio()>=0.6) or difflib.SequenceMatcher(None,key(f),key(name)).ratio()>=0.85]
    pid=p['id']
    places.append({'id':pid,'n':name,'f':forms,'en':p['friendly_id'],'ll':[round(lon,4),round(lat,4)],'t':(p.get('types') or ['?'])[0],'c':conf})
    for (b,c,vs,form) in hits:
        if form in forms: byverse[(b,c)].append([vs,pid,form])
    stats['ok']+=1
print(stats, len(places))
json.dump({'places':places,'byverse':{f'{b}:{c}':v for (b,c),v in byverse.items()}},open('places-raw.json','w'),ensure_ascii=False)
for x in places[:0]: pass
import random
random.seed(1)

