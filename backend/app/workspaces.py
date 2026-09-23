"""Small persisted workspace resources; no synthetic experiment results."""
import json
from contextlib import closing
from datetime import datetime, timezone
from typing import Literal
import uuid
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, model_validator
from .routes import connect

router=APIRouter(prefix='/api')

class Room(BaseModel):
    id: str = Field(min_length=1,max_length=80)
    name: str = Field(min_length=1,max_length=40)
    x: float = Field(ge=0,le=20,allow_inf_nan=False)
    y: float = Field(ge=0,le=14,allow_inf_nan=False)
    width: float = Field(ge=1,le=20,allow_inf_nan=False)
    height: float = Field(ge=1,le=14,allow_inf_nan=False)

class Furniture(BaseModel):
    id: str = Field(min_length=1,max_length=80)
    roomId: str = Field(min_length=1,max_length=80)
    kind: Literal['sofa','bed','desk','table','chair','wardrobe','plant','rug']
    x: float = Field(ge=0,le=20,allow_inf_nan=False)
    y: float = Field(ge=0,le=14,allow_inf_nan=False)
    width: float = Field(gt=0,le=20,allow_inf_nan=False)
    height: float = Field(gt=0,le=14,allow_inf_nan=False)
    rotation: Literal[0,90,180,270] = 0

class HomeLayout(BaseModel):
    rooms: list[Room] = Field(min_length=1,max_length=30)
    furniture: list[Furniture] = Field(max_length=200)

    @model_validator(mode='after')
    def geometry(self):
        ids=[r.id for r in self.rooms]+[f.id for f in self.furniture]
        if len(set(ids))!=len(ids): raise ValueError('duplicate ids')
        for index,r in enumerate(self.rooms):
            if not r.name.strip() or r.x+r.width>20.001 or r.y+r.height>14.001: raise ValueError('room out of bounds')
            for other in self.rooms[index+1:]:
                if r.x<other.x+other.width-.01 and r.x+r.width>other.x+.01 and r.y<other.y+other.height-.01 and r.y+r.height>other.y+.01: raise ValueError('rooms overlap')
        for f in self.furniture:
            r=next((r for r in self.rooms if r.id==f.roomId),None)
            if not r or f.x+f.width>r.width+.001 or f.y+f.height>r.height+.001: raise ValueError('furniture out of bounds')
            if f.kind!='rug':
                for other in self.furniture:
                    if other.id!=f.id and other.roomId==f.roomId and other.kind!='rug' and f.x<other.x+other.width-.01 and f.x+f.width>other.x+.01 and f.y<other.y+other.height-.01 and f.y+f.height>other.y+.01: raise ValueError('furniture overlap')
        return self

@router.get('/home/layout')
def get_home():
    with closing(connect()) as db:
        row=db.execute("SELECT value FROM app_metadata WHERE key='home_layout'").fetchone()
    return json.loads(row['value']) if row else {'layout':None,'saved_at':None}

@router.put('/home/layout')
def save_home(layout:HomeLayout):
    result={'layout':layout.model_dump(),'saved_at':datetime.now(timezone.utc).isoformat()}
    with closing(connect()) as db,db:
        db.execute("INSERT OR REPLACE INTO app_metadata VALUES ('home_layout',?)",(json.dumps(result,ensure_ascii=False),))
    return result

class ResearchProject(BaseModel):
    name:str=Field(min_length=1,max_length=100)
    hypothesis:str=Field(default='',max_length=10000)

@router.get('/research/projects')
def list_projects():
    with closing(connect()) as db:
        rows=db.execute("SELECT value FROM app_metadata WHERE key LIKE 'project:%'").fetchall()
    return {'projects':sorted([json.loads(r['value']) for r in rows],key=lambda p:p['updated_at'],reverse=True)}

@router.post('/research/projects',status_code=201)
def create_project(body:ResearchProject):
    if not body.name.strip():raise HTTPException(400,'研究名称不能为空。')
    project={'id':str(uuid.uuid4()),'name':body.name.strip(),'hypothesis':body.hypothesis,'status':'draft','updated_at':datetime.now(timezone.utc).isoformat()}
    with closing(connect()) as db,db:db.execute('INSERT INTO app_metadata VALUES (?,?)',('project:'+project['id'],json.dumps(project,ensure_ascii=False)))
    return project

@router.put('/research/projects/{identifier}')
def update_project(identifier:str,body:ResearchProject):
    if not body.name.strip():raise HTTPException(400,'研究名称不能为空。')
    with closing(connect()) as db,db:
        row=db.execute('SELECT value FROM app_metadata WHERE key=?',('project:'+identifier,)).fetchone()
        if not row:raise HTTPException(404,'研究不存在。')
        project={**json.loads(row['value']),**body.model_dump(),'name':body.name.strip(),'updated_at':datetime.now(timezone.utc).isoformat()}
        db.execute('UPDATE app_metadata SET value=? WHERE key=?',(json.dumps(project,ensure_ascii=False),'project:'+identifier))
    return project

@router.delete('/research/projects/{identifier}')
def delete_project(identifier:str):
    with closing(connect()) as db,db:result=db.execute('DELETE FROM app_metadata WHERE key=?',('project:'+identifier,))
    if not result.rowcount:raise HTTPException(404,'研究不存在。')
    return {'deleted':True}

@router.get('/research/catalog')
def catalog():
    with closing(connect()) as db:
        rows=db.execute('SELECT cache_key,payload,fetched_at FROM market_cache ORDER BY fetched_at DESC').fetchall()
    return {'datasets':[{'key':r['cache_key'],'symbol':json.loads(r['payload']).get('symbol'),'rows':len(json.loads(r['payload']).get('rows',[])),'source':'Tushare daily','adjustment':'未复权','fetched_at':r['fetched_at']} for r in rows]}
