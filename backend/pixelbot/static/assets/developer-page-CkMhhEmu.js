import{c as k,r as c,j as e,a as C,b as Y,C as X,P as D,D as Ne}from"./index-7FiO0rL-.js";import{u as Te,L as Ce}from"./use-mount-effect-pwSB-oNJ.js";import{B as E}from"./badge-D_7SOFZF.js";import{I as Pe}from"./input-ClQDI0Z-.js";import{P as S,c as j,e as Q,u as Ie,g as W}from"./index-D1dBSYOi.js";import{c as Se}from"./index-Bo8p-Ime.js";import{u as Z}from"./index-jrh_Tlh7.js";import{u as Ee,P as ke}from"./index-BWq0lebQ.js";import{u as ee}from"./index-B4buw7D_.js";import{D as te}from"./download-Bui1-sKp.js";import{T as J}from"./terminal-BWcaf7eB.js";import{C as z}from"./copy-BfZSlh8-.js";import{T as Fe}from"./table-2-CUoCwBUy.js";import{C as Ae}from"./chevron-down-FOB2PNQV.js";import{C as oe}from"./check-BDCntIUM.js";import"./index-DkTN3sbU.js";const Re=[["path",{d:"M12 7v14",key:"1akyts"}],["path",{d:"M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z",key:"ruj8y"}]],Le=k("book-open",Re);const Oe=[["path",{d:"M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1",key:"ezmyqa"}],["path",{d:"M16 21h1a2 2 0 0 0 2-2v-5c0-1.1.9-2 2-2a2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1",key:"e1hn23"}]],U=k("braces",Oe);const Me=[["path",{d:"M15 3h6v6",key:"1q9fwt"}],["path",{d:"M10 14 21 3",key:"gplh6r"}],["path",{d:"M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6",key:"a6xqqp"}]],A=k("external-link",Me);const Ge=[["path",{d:"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z",key:"1oefj6"}],["path",{d:"M14 2v5a1 1 0 0 0 1 1h5",key:"wfsgrz"}],["path",{d:"M10 12a1 1 0 0 0-1 1v1a1 1 0 0 1-1 1 1 1 0 0 1 1 1v1a1 1 0 0 0 1 1",key:"1oajmo"}],["path",{d:"M14 18a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1 1 1 0 0 1-1-1v-1a1 1 0 0 0-1-1",key:"mpwhp6"}]],ae=k("file-braces",Ge);const De=[["path",{d:"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z",key:"1oefj6"}],["path",{d:"M14 2v5a1 1 0 0 0 1 1h5",key:"wfsgrz"}],["path",{d:"M8 13h2",key:"yr2amv"}],["path",{d:"M14 13h2",key:"un5t4a"}],["path",{d:"M8 17h2",key:"2yhykz"}],["path",{d:"M14 17h2",key:"10kma7"}]],qe=k("file-spreadsheet",De);var q="rovingFocusGroup.onEntryFocus",$e={bubbles:!1,cancelable:!0},F="RovingFocusGroup",[V,re,Ue]=Se(F),[Ve,se]=Q(F,[Ue]),[ze,He]=Ve(F),ne=c.forwardRef((t,o)=>e.jsx(V.Provider,{scope:t.__scopeRovingFocusGroup,children:e.jsx(V.Slot,{scope:t.__scopeRovingFocusGroup,children:e.jsx(Ke,{...t,ref:o})})}));ne.displayName=F;var Ke=c.forwardRef((t,o)=>{const{__scopeRovingFocusGroup:l,orientation:a,loop:s=!1,dir:i,currentTabStopId:n,defaultCurrentTabStopId:x,onCurrentTabStopIdChange:f,onEntryFocus:g,preventScrollOnEntryFocus:d=!1,...m}=t,h=c.useRef(null),_=Ie(o,h),w=W(i),[P,u]=ee({prop:n,defaultProp:x??null,onChange:f,caller:F}),[b,N]=c.useState(!1),r=Ee(g),p=re(l),y=c.useRef(!1),[I,K]=c.useState(0);return c.useEffect(()=>{const v=h.current;if(v)return v.addEventListener(q,r),()=>v.removeEventListener(q,r)},[r]),e.jsx(ze,{scope:l,orientation:a,dir:w,loop:s,currentTabStopId:P,onItemFocus:c.useCallback(v=>u(v),[u]),onItemShiftTab:c.useCallback(()=>N(!0),[]),onFocusableItemAdd:c.useCallback(()=>K(v=>v+1),[]),onFocusableItemRemove:c.useCallback(()=>K(v=>v-1),[]),children:e.jsx(S.div,{tabIndex:b||I===0?-1:0,"data-orientation":a,...m,ref:_,style:{outline:"none",...t.style},onMouseDown:j(t.onMouseDown,()=>{y.current=!0}),onFocus:j(t.onFocus,v=>{const ye=!y.current;if(v.target===v.currentTarget&&ye&&!b){const B=new CustomEvent(q,$e);if(v.currentTarget.dispatchEvent(B),!B.defaultPrevented){const G=p().filter(T=>T.focusable),je=G.find(T=>T.active),we=G.find(T=>T.id===P),_e=[je,we,...G].filter(Boolean).map(T=>T.ref.current);ce(_e,d)}}y.current=!1}),onBlur:j(t.onBlur,()=>N(!1))})})}),le="RovingFocusGroupItem",ie=c.forwardRef((t,o)=>{const{__scopeRovingFocusGroup:l,focusable:a=!0,active:s=!1,tabStopId:i,children:n,...x}=t,f=Z(),g=i||f,d=He(le,l),m=d.currentTabStopId===g,h=re(l),{onFocusableItemAdd:_,onFocusableItemRemove:w,currentTabStopId:P}=d;return c.useEffect(()=>{if(a)return _(),()=>w()},[a,_,w]),e.jsx(V.ItemSlot,{scope:l,id:g,focusable:a,active:s,children:e.jsx(S.span,{tabIndex:m?0:-1,"data-orientation":d.orientation,...x,ref:o,onMouseDown:j(t.onMouseDown,u=>{a?d.onItemFocus(g):u.preventDefault()}),onFocus:j(t.onFocus,()=>d.onItemFocus(g)),onKeyDown:j(t.onKeyDown,u=>{if(u.key==="Tab"&&u.shiftKey){d.onItemShiftTab();return}if(u.target!==u.currentTarget)return;const b=Je(u,d.orientation,d.dir);if(b!==void 0){if(u.metaKey||u.ctrlKey||u.altKey||u.shiftKey)return;u.preventDefault();let r=h().filter(p=>p.focusable).map(p=>p.ref.current);if(b==="last")r.reverse();else if(b==="prev"||b==="next"){b==="prev"&&r.reverse();const p=r.indexOf(u.currentTarget);r=d.loop?Ye(r,p+1):r.slice(p+1)}setTimeout(()=>ce(r))}}),children:typeof n=="function"?n({isCurrentTabStop:m,hasTabStop:P!=null}):n})})});ie.displayName=le;var Be={ArrowLeft:"prev",ArrowUp:"prev",ArrowRight:"next",ArrowDown:"next",PageUp:"first",Home:"first",PageDown:"last",End:"last"};function Xe(t,o){return o!=="rtl"?t:t==="ArrowLeft"?"ArrowRight":t==="ArrowRight"?"ArrowLeft":t}function Je(t,o,l){const a=Xe(t.key,l);if(!(o==="vertical"&&["ArrowLeft","ArrowRight"].includes(a))&&!(o==="horizontal"&&["ArrowUp","ArrowDown"].includes(a)))return Be[a]}function ce(t,o=!1){const l=document.activeElement;for(const a of t)if(a===l||(a.focus({preventScroll:o}),document.activeElement!==l))return}function Ye(t,o){return t.map((l,a)=>t[(o+a)%t.length])}var Qe=ne,We=ie,M="Tabs",[Ze]=Q(M,[se]),de=se(),[et,H]=Ze(M),pe=c.forwardRef((t,o)=>{const{__scopeTabs:l,value:a,onValueChange:s,defaultValue:i,orientation:n="horizontal",dir:x,activationMode:f="automatic",...g}=t,d=W(x),[m,h]=ee({prop:a,onChange:s,defaultProp:i??"",caller:M});return e.jsx(et,{scope:l,baseId:Z(),value:m,onValueChange:h,orientation:n,dir:d,activationMode:f,children:e.jsx(S.div,{dir:d,"data-orientation":n,...g,ref:o})})});pe.displayName=M;var me="TabsList",ue=c.forwardRef((t,o)=>{const{__scopeTabs:l,loop:a=!0,...s}=t,i=H(me,l),n=de(l);return e.jsx(Qe,{asChild:!0,...n,orientation:i.orientation,dir:i.dir,loop:a,children:e.jsx(S.div,{role:"tablist","aria-orientation":i.orientation,...s,ref:o})})});ue.displayName=me;var xe="TabsTrigger",he=c.forwardRef((t,o)=>{const{__scopeTabs:l,value:a,disabled:s=!1,...i}=t,n=H(xe,l),x=de(l),f=ge(n.baseId,a),g=ve(n.baseId,a),d=a===n.value;return e.jsx(We,{asChild:!0,...x,focusable:!s,active:d,children:e.jsx(S.button,{type:"button",role:"tab","aria-selected":d,"aria-controls":g,"data-state":d?"active":"inactive","data-disabled":s?"":void 0,disabled:s,id:f,...i,ref:o,onMouseDown:j(t.onMouseDown,m=>{!s&&m.button===0&&m.ctrlKey===!1?n.onValueChange(a):m.preventDefault()}),onKeyDown:j(t.onKeyDown,m=>{[" ","Enter"].includes(m.key)&&n.onValueChange(a)}),onFocus:j(t.onFocus,()=>{const m=n.activationMode!=="manual";!d&&!s&&m&&n.onValueChange(a)})})})});he.displayName=xe;var be="TabsContent",fe=c.forwardRef((t,o)=>{const{__scopeTabs:l,value:a,forceMount:s,children:i,...n}=t,x=H(be,l),f=ge(x.baseId,a),g=ve(x.baseId,a),d=a===x.value,m=c.useRef(d);return c.useEffect(()=>{const h=requestAnimationFrame(()=>m.current=!1);return()=>cancelAnimationFrame(h)},[]),e.jsx(ke,{present:s||d,children:({present:h})=>e.jsx(S.div,{"data-state":d?"active":"inactive","data-orientation":x.orientation,role:"tabpanel","aria-labelledby":f,hidden:!h,id:g,tabIndex:0,...n,ref:o,style:{...t.style,animationDuration:m.current?"0s":void 0},children:h&&i})})});fe.displayName=be;function ge(t,o){return`${t}-trigger-${o}`}function ve(t,o){return`${t}-content-${o}`}var tt=pe,ot=ue,at=he,rt=fe;const st=tt;function nt({className:t,...o}){return e.jsx(ot,{className:C("inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground",t),...o})}function R({className:t,...o}){return e.jsx(at,{className:C("inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium","ring-offset-background transition-all","focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2","disabled:pointer-events-none disabled:opacity-50","data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm",t),...o})}function L({className:t,...o}){return e.jsx(rt,{className:C("mt-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",t),...o})}const $="/api",lt=[{label:"Chat & Agent",endpoints:[{method:"POST",path:"/api/query",description:"Run a query through the multimodal AI agent",curl:`curl -X POST http://localhost:8000/api/query \\
  -H "Content-Type: application/json" \\
  -d '{"query": "What documents do I have?"}'`}]},{label:"Files",endpoints:[{method:"POST",path:"/api/upload",description:"Upload a file (document, image, video, audio, CSV)",curl:`curl -X POST http://localhost:8000/api/upload \\
  -F "file=@document.pdf"`},{method:"POST",path:"/api/add_url",description:"Import a file from URL",curl:`curl -X POST http://localhost:8000/api/add_url \\
  -H "Content-Type: application/json" \\
  -d '{"url": "https://example.com/image.jpg"}'`},{method:"GET",path:"/api/context_info",description:"List all uploaded files, tools, and configuration",curl:"curl http://localhost:8000/api/context_info"}]},{label:"Generation",endpoints:[{method:"POST",path:"/api/generate_image",description:"Generate an image from a text prompt",curl:`curl -X POST http://localhost:8000/api/generate_image \\
  -H "Content-Type: application/json" \\
  -d '{"prompt": "A sunset over mountains"}'`},{method:"POST",path:"/api/generate_video",description:"Generate a video from a text prompt",curl:`curl -X POST http://localhost:8000/api/generate_video \\
  -H "Content-Type: application/json" \\
  -d '{"prompt": "A timelapse of clouds"}'`},{method:"GET",path:"/api/image_history",description:"List all generated images",curl:"curl http://localhost:8000/api/image_history"}]},{label:"Prompt Lab",endpoints:[{method:"GET",path:"/api/experiments/models",description:"List available LLM models with API key status",curl:"curl http://localhost:8000/api/experiments/models"},{method:"POST",path:"/api/experiments/run",description:"Run a prompt against multiple models in parallel",curl:`curl -X POST http://localhost:8000/api/experiments/run \\
  -H "Content-Type: application/json" \\
  -d '{"user_prompt": "Explain quantum computing", "models": [{"model_id": "claude-sonnet-4-20250514"}, {"model_id": "gpt-4o"}], "temperature": 0.7}'`},{method:"GET",path:"/api/experiments/history",description:"List all past experiments",curl:"curl http://localhost:8000/api/experiments/history"}]},{label:"Data Export",endpoints:[{method:"GET",path:"/api/export/tables",description:"List all tables available for export",curl:"curl http://localhost:8000/api/export/tables"},{method:"GET",path:"/api/export/json/{table}",description:"Export a table as JSON",curl:"curl -o export.json http://localhost:8000/api/export/json/pixelbot_v3.chat_history?limit=100"},{method:"GET",path:"/api/export/csv/{table}",description:"Export a table as CSV",curl:"curl -o export.csv http://localhost:8000/api/export/csv/pixelbot_v3.chat_history?limit=100"},{method:"GET",path:"/api/export/parquet/{table}",description:"Export a table as Parquet",curl:"curl -o export.parquet http://localhost:8000/api/export/parquet/pixelbot_v3.chat_history?limit=100"}]},{label:"Database",endpoints:[{method:"GET",path:"/api/db/tables",description:"List all Pixeltable tables with schemas and row counts",curl:"curl http://localhost:8000/api/db/tables"},{method:"GET",path:"/api/db/table/{path}/rows",description:"Fetch paginated rows from any table",curl:'curl "http://localhost:8000/api/db/table/pixelbot_v3.chat_history/rows?limit=10&offset=0"'},{method:"GET",path:"/api/db/timeline",description:"Unified chronological feed across all tables",curl:"curl http://localhost:8000/api/db/timeline?limit=50"}]},{label:"Memory",endpoints:[{method:"GET",path:"/api/memory",description:"List memories with a declarative Pixeltable query route",curl:"curl http://localhost:8000/api/memory"},{method:"GET",path:"/api/memory/search",description:"Semantic memory search through a Pixeltable embedding index",curl:'curl "http://localhost:8000/api/memory/search?query_text=python"'},{method:"POST",path:"/api/memory",description:"Save a new memory entry",curl:`curl -X POST http://localhost:8000/api/memory \\
  -H "Content-Type: application/json" \\
  -d '{"content": "User prefers Python", "type": "text", "context_query": "preferences"}'`}]}],it=[{label:"Connect & List Tables",description:"Initialize Pixeltable and browse the catalog",language:"python",code:`import pixeltable as pxt

# List all tables in the Pixelbot 3 catalog
for tbl in pxt.list_tables("pixelbot_v3", recursive=True):
    path = tbl.get_path()
    print(f"{path}: {tbl.count()} rows, {len(tbl.columns())} columns")`},{label:"Query Chat History",description:"Fetch and filter chat history with Pixeltable expressions",language:"python",code:`import pixeltable as pxt

t = pxt.get_table("pixelbot_v3.chat_history")

# Get recent messages
recent = (
    t.order_by(t.timestamp, asc=False)
     .select(t.role, t.content, t.timestamp)
     .limit(20)
     .collect()
)
for row in recent:
    print(f"[{row['role']}] {row['content'][:80]}...")`},{label:"Semantic Search",description:"Search across documents using embedding similarity",language:"python",code:`import pixeltable as pxt

chunks = pxt.get_table("pixelbot_v3.chunks")

# Semantic search — Gemini embed_content index (Pixeltable 0.7.7)
sim = chunks.text.similarity(string="machine learning best practices")
results = (
    chunks.where(sim > 0.5)
          .order_by(sim, asc=False)
          .select(chunks.text, sim=sim)
          .limit(10)
          .collect()
)
for r in results:
    print(f"[{r['sim']:.3f}] {r['text'][:100]}...")`},{label:"Export to Pandas",description:"Convert any table to a pandas DataFrame",language:"python",code:`import pixeltable as pxt

t = pxt.get_table("pixelbot_v3.prompt_experiments")

# Collect as pandas DataFrame
df = (
    t.select(t.task, t.model_id, t.response_time_ms, t.word_count)
     .collect()
     .to_pandas()
)

# Export to various formats
df.to_csv("experiments.csv", index=False)
df.to_parquet("experiments.parquet")
df.to_json("experiments.json", orient="records", indent=2)
print(df.describe())`},{label:"Image Similarity Search",description:"Find similar images using CLIP embeddings",language:"python",code:`import pixeltable as pxt

images = pxt.get_table("pixelbot_v3.images")

# CLIP-based text-to-image search (use string= keyword in 0.6+)
sim = images.image.similarity(string="a cat sitting on a desk")
results = (
    images.where(sim > 0.25)
          .order_by(sim, asc=False)
          .select(images.image, sim=sim)
          .limit(5)
          .collect()
)
# results contain PIL Image objects
for r in results:
    r["image"].show()`},{label:"Insert & Computed Columns",description:"Insert data and let computed columns do the work",language:"python",code:`import pixeltable as pxt
from datetime import datetime

# Insert an image — Pixeltable auto-generates:
# - CLIP embedding (for similarity search)
# - Thumbnail (96x96 PIL resize + base64)
images = pxt.get_table("pixelbot_v3.images")
images.insert([{
    "image": "/path/to/photo.jpg",  # or URL
    "uuid": "my-custom-id",
    "timestamp": datetime.now(),
    "user_id": "local_user",
}])
# All computed columns trigger automatically!`},{label:"Table Version Control",description:"Undo operations and inspect version history",language:"python",code:`import pixeltable as pxt

t = pxt.get_table("pixelbot_v3.chat_history")

# See version history
for v in t.get_versions():
    print(f"v{v.version}: {v.change_type} | "
          f"+{v.inserts} -{v.deletes} ~{v.updates}")

# Operational recovery is explicit in the CLI:
# pxt errors pixelbot_v3/chat_history
# pxt recompute pixelbot_v3/chat_history COLUMN --errors-only -f`},{label:"Data Sampling",description:"Random and stratified sampling with query.sample()",language:"python",code:`import pixeltable as pxt

t = pxt.get_table("pixelbot_v3.chat_history")

# Random 10% sample (reproducible with seed)
sample = t.sample(fraction=0.1, seed=42).collect()
print(f"Sampled {len(sample)} rows")

# Fixed count sample
five_rows = t.sample(n=5, seed=42).collect()

# Stratified sampling — equal allocation per class
by_role = t.sample(n_per_stratum=3, stratify_by=t.role, seed=42).collect()

# Combined with filters and projections
recent_sample = (
    t.where(t.role == "user")
     .sample(fraction=0.2, seed=42)
     .select(t.content, t.timestamp)
     .collect()
)`},{label:"JSON Serialization",description:"Serialize complex columns with json.dumps()",language:"python",code:`import pixeltable as pxt
from pixeltable.functions import json as pxt_json

t = pxt.get_table("pixelbot_v3.tools")

# Serialize a complex dict/list column to JSON strings
rows = (
    t.select(
        t.prompt,
        tool_json=pxt_json.dumps(t.tool_output),
    )
    .limit(10)
    .collect()
)
for r in rows:
    print(f"Q: {r['prompt'][:60]}...")
    print(f"Tools: {r['tool_json'][:120]}...")`},{label:"Video Crop",description:"Crop a rectangular region from a video",language:"python",code:`import pixeltable as pxt
from pixeltable.functions.video import crop

videos = pxt.get_table("pixelbot_v3.videos")

# Crop a 640x480 region starting at top=50, left=100
result = (
    videos.select(
        cropped=crop(videos.video, top=50, left=100, bottom=530, right=740),
    )
    .limit(1)
    .collect()
)
# result[0]["cropped"] is a path to the cropped video file`},{label:"Insert with return_rows (0.6+)",description:"Read computed columns immediately after insert",language:"python",code:`import pixeltable as pxt
from datetime import datetime

tools = pxt.get_table("pixelbot_v3.tools")
status = tools.insert([{
    "prompt": "What documents do I have?",
    "user_id": "local_user",
    "timestamp": datetime.now(),
}], return_rows=True)
# Computed pipeline columns available in status.rows[0]
print(status.rows[0]["answer"])`},{label:"Pixeltable query routes",description:"Declarative table-backed reads alongside custom FastAPI writes",language:"python",code:`# Pixelbot registers FastAPIRouter routes at startup.
# Query endpoints return {rows: [...]} envelopes:

# GET /api/memory
# GET /api/memory/search?query_text=...
# GET /api/personas
# POST /api/memory uses a custom FastAPI handler for validation and defaults

import requests
rows = requests.get("http://localhost:8000/api/memory").json()["rows"]`},{label:"Native Export (0.6+)",description:"Export tables with pxt.io.export_csv / export_json",language:"python",code:`import pixeltable as pxt
from pixeltable.io import export_csv, export_json

t = pxt.get_table("pixelbot_v3.chat_history")
export_csv(t, "/tmp/chat_history.csv")
export_json(t, "/tmp/chat_history.json")

# Or via API:
# GET /api/export/native/pixelbot_v3.chat_history?format=csv`},{label:"Pagination with offset",description:"Server-side pagination using limit(n, offset=)",language:"python",code:`import pixeltable as pxt

t = pxt.get_table("pixelbot_v3.chat_history")

# Page through results 50 at a time
page_size = 50
for page in range(3):
    rows = (
        t.select(t.role, t.content)
         .limit(page_size, offset=page * page_size)
         .collect()
    )
    print(f"Page {page + 1}: {len(rows)} rows")`}],ct=`{
  "mcpServers": {
    "pixeltable": {
      "command": "uvx",
      "args": ["mcp-server-pixeltable-developer"],
      "env": {
        "PIXELTABLE_HOME": "~/.pixeltable",
        "ANTHROPIC_API_KEY": "sk-ant-...",
        "OPENAI_API_KEY": "sk-..."
      }
    }
  }
}`;function kt(){const{addToast:t}=Y(),[o,l]=c.useState(null),a=c.useCallback((s,i)=>{navigator.clipboard.writeText(s),l(s),setTimeout(()=>l(null),2e3),i&&t(`Copied ${i}`,"success")},[t]);return e.jsx("div",{className:"h-full overflow-y-auto",children:e.jsxs("div",{className:"max-w-5xl mx-auto px-6 py-8",children:[e.jsxs("div",{className:"flex items-center gap-3 mb-8",children:[e.jsx("div",{className:"flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15",children:e.jsx(X,{className:"h-5 w-5 text-emerald-400"})}),e.jsxs("div",{children:[e.jsx("h1",{className:"text-xl font-semibold text-foreground",children:"Developer"}),e.jsx("p",{className:"text-[12px] text-muted-foreground/60",children:"Export data, browse the API, and connect to Pixeltable"})]})]}),e.jsxs(st,{defaultValue:"export",children:[e.jsxs(nt,{className:"mb-6",children:[e.jsxs(R,{value:"export",className:"gap-1.5",children:[e.jsx(te,{className:"h-3.5 w-3.5"})," Export"]}),e.jsxs(R,{value:"api",className:"gap-1.5",children:[e.jsx(J,{className:"h-3.5 w-3.5"})," API"]}),e.jsxs(R,{value:"sdk",className:"gap-1.5",children:[e.jsx(U,{className:"h-3.5 w-3.5"})," Python SDK"]}),e.jsxs(R,{value:"connect",className:"gap-1.5",children:[e.jsx(D,{className:"h-3.5 w-3.5"})," Connect"]})]}),e.jsx(L,{value:"export",children:e.jsx(dt,{copyToClipboard:a})}),e.jsx(L,{value:"api",children:e.jsxs("div",{className:"space-y-6",children:[e.jsxs("p",{className:"text-[12px] text-muted-foreground/60",children:["All endpoints are available at ",e.jsx("code",{className:"text-[11px] bg-accent px-1.5 py-0.5 rounded font-mono",children:"http://localhost:8000"}),". The backend also serves interactive docs at"," ",e.jsxs("a",{href:"http://localhost:8000/docs",target:"_blank",rel:"noopener noreferrer",className:"text-emerald-400 hover:underline",children:["/docs ",e.jsx(A,{className:"h-2.5 w-2.5 inline"})]})]}),lt.map(s=>e.jsx(mt,{group:s,copiedText:o,onCopy:a},s.label))]})}),e.jsx(L,{value:"sdk",children:e.jsxs("div",{className:"space-y-4",children:[e.jsxs("p",{className:"text-[12px] text-muted-foreground/60",children:["Access your Pixeltable data directly with the Python SDK. All tables created by Pixelbot live in the ",e.jsx("code",{className:"text-[11px] bg-accent px-1.5 py-0.5 rounded font-mono",children:"agents"})," namespace at ",e.jsx("code",{className:"text-[11px] bg-accent px-1.5 py-0.5 rounded font-mono",children:"~/.pixeltable/"}),"."]}),e.jsx("div",{className:"grid gap-4",children:it.map(s=>e.jsx(ut,{snippet:s,copiedText:o,onCopy:a},s.label))})]})}),e.jsx(L,{value:"connect",children:e.jsxs("div",{className:"space-y-6",children:[e.jsxs("div",{className:"rounded-xl border border-border/60 bg-card/40 overflow-hidden",children:[e.jsxs("div",{className:"px-5 py-4 border-b border-border/40 flex items-center gap-3",children:[e.jsx("div",{className:"h-8 w-8 rounded-lg bg-violet-500/15 flex items-center justify-center",children:e.jsx(D,{className:"h-4 w-4 text-violet-400"})}),e.jsxs("div",{children:[e.jsx("h3",{className:"text-[13px] font-semibold text-foreground",children:"Model Context Protocol (MCP)"}),e.jsx("p",{className:"text-[11px] text-muted-foreground/60",children:"Connect Claude, Cursor, or any MCP-compatible AI to your Pixeltable data"})]}),e.jsxs("a",{href:"https://github.com/pixeltable/mcp-server-pixeltable-developer",target:"_blank",rel:"noopener noreferrer",className:"ml-auto text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1",children:["GitHub ",e.jsx(A,{className:"h-2.5 w-2.5"})]})]}),e.jsxs("div",{className:"p-5 space-y-3",children:[e.jsxs("p",{className:"text-[12px] text-muted-foreground/80",children:["Add this to your MCP client configuration (e.g. ",e.jsx("code",{className:"bg-accent px-1 py-0.5 rounded text-[11px] font-mono",children:"claude_desktop_config.json"})," or Cursor settings):"]}),e.jsx(O,{code:ct,language:"json",copiedText:o,onCopy:a}),e.jsx("p",{className:"text-[11px] text-muted-foreground/50",children:"Once connected, your AI assistant can query, insert, and manage all Pixeltable tables directly."})]})]}),e.jsxs("div",{className:"rounded-xl border border-border/60 bg-card/40 overflow-hidden",children:[e.jsxs("div",{className:"px-5 py-4 border-b border-border/40 flex items-center gap-3",children:[e.jsx("div",{className:"h-8 w-8 rounded-lg bg-amber-500/15 flex items-center justify-center",children:e.jsx(U,{className:"h-4 w-4 text-amber-400"})}),e.jsxs("div",{children:[e.jsx("h3",{className:"text-[13px] font-semibold text-foreground",children:"Direct Python Access"}),e.jsx("p",{className:"text-[11px] text-muted-foreground/60",children:"Access the same data Pixelbot uses from any Python script or notebook"})]})]}),e.jsxs("div",{className:"p-5 space-y-3",children:[e.jsx(O,{code:`pip install "pixeltable[serve]==0.7.7"

# Then in Python:
import pixeltable as pxt
t = pxt.get_table("pixelbot_v3.chat_history")
print(t.count(), "rows")
print(t.select(t.role, t.content).limit(5).collect())`,language:"bash",copiedText:o,onCopy:a}),e.jsxs("p",{className:"text-[11px] text-muted-foreground/50",children:["Pixeltable stores everything at ",e.jsx("code",{className:"bg-accent px-1 py-0.5 rounded text-[10px] font-mono",children:"~/.pixeltable/"}),". Any script on the same machine can read/write the same tables."]})]})]}),e.jsxs("div",{className:"rounded-xl border border-border/60 bg-card/40 overflow-hidden",children:[e.jsxs("div",{className:"px-5 py-4 border-b border-border/40 flex items-center gap-3",children:[e.jsx("div",{className:"h-8 w-8 rounded-lg bg-blue-500/15 flex items-center justify-center",children:e.jsx(J,{className:"h-4 w-4 text-blue-400"})}),e.jsxs("div",{children:[e.jsx("h3",{className:"text-[13px] font-semibold text-foreground",children:"REST API"}),e.jsx("p",{className:"text-[11px] text-muted-foreground/60",children:"Access everything via HTTP from any language or tool"})]}),e.jsxs("a",{href:"http://localhost:8000/docs",target:"_blank",rel:"noopener noreferrer",className:"ml-auto text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1",children:["OpenAPI Docs ",e.jsx(A,{className:"h-2.5 w-2.5"})]})]}),e.jsx("div",{className:"p-5 space-y-3",children:e.jsx(O,{code:`# Query the agent
curl -X POST http://localhost:8000/api/query \\
  -H "Content-Type: application/json" \\
  -d '{"query": "Summarize my documents"}'

# Export data
curl -o history.json http://localhost:8000/api/export/json/pixelbot_v3.chat_history
curl -o data.csv http://localhost:8000/api/export/csv/pixelbot_v3.prompt_experiments`,language:"bash",copiedText:o,onCopy:a})})]}),e.jsx("div",{className:"flex flex-wrap gap-3",children:[{label:"Pixeltable Docs",url:"https://docs.pixeltable.com/",icon:Le},{label:"GitHub",url:"https://github.com/pixeltable/pixeltable",icon:X},{label:"MCP Server",url:"https://github.com/pixeltable/mcp-server-pixeltable-developer",icon:D},{label:"LLMs.txt",url:"https://docs.pixeltable.com/llms.txt",icon:ae}].map(({label:s,url:i,icon:n})=>e.jsxs("a",{href:i,target:"_blank",rel:"noopener noreferrer",className:"flex items-center gap-2 rounded-lg border border-border/60 px-3.5 py-2 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-accent/30 transition-colors",children:[e.jsx(n,{className:"h-3.5 w-3.5"}),s,e.jsx(A,{className:"h-2.5 w-2.5 opacity-40"})]},i))})]})})]})]})})}function dt({copyToClipboard:t}){const{addToast:o}=Y(),[l,a]=c.useState([]),[s,i]=c.useState(null),[n,x]=c.useState("json"),[f,g]=c.useState(1e3),[d,m]=c.useState(!1),[h,_]=c.useState(null),w=c.useCallback(async r=>{try{const p=await fetch(`${$}/export/preview/${r}?limit=10`);if(!p.ok)throw new Error("Preview failed");const y=await p.json();_({columns:y.columns??[],rows:y.rows??[],count:y.count??0})}catch{_(null)}},[]);Te(()=>{fetch(`${$}/export/tables`).then(r=>r.json()).then(r=>{const p=r.tables||[];a(p),p.length>0&&(i(p[0].path),w(p[0].path))}).catch(()=>{})});const P=c.useCallback(r=>{i(r),w(r)},[w]),u=c.useCallback(async()=>{if(s){m(!0);try{const r=`${$}/export/${n}/${s}?limit=${f}`,p=await fetch(r);if(!p.ok)throw new Error("Export failed");const y=await p.blob(),I=document.createElement("a");I.href=URL.createObjectURL(y),I.download=`${s.replace(".","_")}.${n}`,I.click(),URL.revokeObjectURL(I.href),o(`Exported ${s} as ${n.toUpperCase()}`,"success")}catch{o("Export failed","error")}finally{m(!1)}}},[s,n,f,o]),b=l.find(r=>r.path===s),N=s?`curl -o export.${n} http://localhost:8000/api/export/${n}/${s}?limit=${f}`:"";return e.jsxs("div",{className:"space-y-6",children:[e.jsx("p",{className:"text-[12px] text-muted-foreground/60",children:"Export any Pixeltable table as JSON, CSV, or Parquet. All data types are automatically serialized."}),e.jsxs("div",{className:"grid grid-cols-[1fr_auto] gap-6",children:[e.jsxs("div",{className:"space-y-4",children:[e.jsxs("div",{className:"space-y-1.5",children:[e.jsx("label",{className:"text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50",children:"Table"}),e.jsx("select",{className:"w-full h-9 rounded-lg border border-input bg-transparent px-3 text-[12px] font-mono",value:s??"",onChange:r=>P(r.target.value),children:l.map(r=>e.jsx("option",{value:r.path,children:r.path},r.path))})]}),e.jsxs("div",{className:"space-y-1.5",children:[e.jsx("label",{className:"text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50",children:"Format"}),e.jsx("div",{className:"flex gap-2",children:[{id:"json",label:"JSON",icon:ae},{id:"csv",label:"CSV",icon:qe},{id:"parquet",label:"Parquet",icon:Ne}].map(({id:r,label:p,icon:y})=>e.jsxs("button",{className:C("flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-[11px] font-medium transition-all",n===r?"border-emerald-500/40 bg-emerald-500/10 text-emerald-400":"border-border/60 text-muted-foreground hover:bg-accent/30"),onClick:()=>x(r),children:[e.jsx(y,{className:"h-3.5 w-3.5"}),p]},r))})]}),e.jsxs("div",{className:"space-y-1.5",children:[e.jsx("label",{className:"text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50",children:"Row Limit"}),e.jsx(Pe,{type:"number",value:f,onChange:r=>g(Math.max(1,Math.min(5e4,parseInt(r.target.value)||1e3))),className:"h-8 text-[12px] w-32 font-mono",min:1,max:5e4})]}),e.jsxs("button",{className:C("flex items-center gap-2 rounded-lg px-5 py-2.5 text-[13px] font-semibold transition-all","bg-emerald-600 text-white hover:bg-emerald-500 active:bg-emerald-700","disabled:opacity-50 disabled:cursor-not-allowed"),onClick:u,disabled:!s||d,children:[d?e.jsx(Ce,{className:"h-3.5 w-3.5 animate-spin"}):e.jsx(te,{className:"h-3.5 w-3.5"}),"Download ",n.toUpperCase()]}),N&&e.jsxs("div",{className:"space-y-1",children:[e.jsx("span",{className:"text-[10px] text-muted-foreground/40",children:"curl equivalent:"}),e.jsxs("div",{className:"relative group",children:[e.jsx("pre",{className:"rounded-lg bg-card/60 border border-border/40 px-3 py-2 text-[10px] font-mono text-muted-foreground/70 overflow-x-auto",children:N}),e.jsx("button",{className:"absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 text-muted-foreground/40 hover:text-foreground transition-all",onClick:()=>t(N,"curl command"),children:e.jsx(z,{className:"h-3 w-3"})})]})]})]}),e.jsx("div",{className:"w-[340px] shrink-0",children:b&&e.jsxs("div",{className:"rounded-xl border border-border/40 bg-card/30 overflow-hidden",children:[e.jsxs("div",{className:"px-4 py-2.5 border-b border-border/30 flex items-center gap-2",children:[e.jsx(Fe,{className:"h-3.5 w-3.5 text-muted-foreground/50"}),e.jsx("span",{className:"text-[11px] font-mono font-medium text-foreground truncate",children:b.path}),e.jsxs(E,{variant:"secondary",className:"text-[9px] ml-auto shrink-0",children:[b.row_count," rows"]})]}),e.jsx("div",{className:"px-4 py-2.5 border-b border-border/30",children:e.jsxs("div",{className:"flex flex-wrap gap-1",children:[b.columns.slice(0,12).map(r=>e.jsx(E,{variant:"outline",className:"text-[9px] px-1.5 py-0 font-mono",children:r},r)),b.columns.length>12&&e.jsxs(E,{variant:"secondary",className:"text-[9px] px-1.5 py-0",children:["+",b.columns.length-12]})]})}),h&&h.rows.length>0&&e.jsxs("div",{className:"px-4 py-2.5 max-h-[260px] overflow-y-auto",children:[e.jsx("span",{className:"text-[9px] text-muted-foreground/40 uppercase tracking-wider font-semibold",children:"Preview (5 rows)"}),e.jsx("div",{className:"mt-1.5 space-y-1.5",children:h.rows.map((r,p)=>e.jsxs("div",{className:"text-[9px] font-mono text-muted-foreground/60 bg-accent/20 rounded px-2 py-1 truncate",children:[JSON.stringify(r).slice(0,120),"..."]},p))})]})]})})]})]})}const pt={GET:"bg-emerald-500/15 text-emerald-400",POST:"bg-blue-500/15 text-blue-400",PUT:"bg-amber-500/15 text-amber-400",DELETE:"bg-red-500/15 text-red-400"};function mt({group:t,copiedText:o,onCopy:l}){const[a,s]=c.useState(null);return e.jsxs("div",{className:"rounded-xl border border-border/60 bg-card/40 overflow-hidden",children:[e.jsx("div",{className:"px-4 py-3 border-b border-border/40",children:e.jsx("h3",{className:"text-[12px] font-semibold text-foreground",children:t.label})}),e.jsx("div",{className:"divide-y divide-border/30",children:t.endpoints.map((i,n)=>e.jsxs("div",{children:[e.jsxs("button",{className:"w-full px-4 py-2.5 flex items-center gap-3 hover:bg-accent/20 transition-colors text-left",onClick:()=>s(a===n?null:n),children:[e.jsx(E,{className:C("text-[9px] px-2 py-0 font-mono font-bold shrink-0",pt[i.method]),children:i.method}),e.jsx("span",{className:"text-[11px] font-mono text-foreground/80 flex-1 truncate",children:i.path}),e.jsx("span",{className:"text-[10px] text-muted-foreground/50 hidden sm:block",children:i.description}),e.jsx(Ae,{className:C("h-3 w-3 text-muted-foreground/30 shrink-0 transition-transform",a===n&&"rotate-180")})]}),a===n&&e.jsx("div",{className:"px-4 pb-3",children:e.jsxs("div",{className:"relative group",children:[e.jsx("pre",{className:"rounded-lg bg-background/50 border border-border/30 px-3 py-2.5 text-[10px] font-mono text-muted-foreground/70 overflow-x-auto whitespace-pre-wrap",children:i.curl}),e.jsx("button",{className:"absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity",onClick:x=>{x.stopPropagation(),l(i.curl,"curl command")},children:o===i.curl?e.jsx(oe,{className:"h-3 w-3 text-emerald-400"}):e.jsx(z,{className:"h-3 w-3 text-muted-foreground/40 hover:text-foreground"})})]})})]},`${i.method}-${i.path}`))})]})}function ut({snippet:t,copiedText:o,onCopy:l}){return e.jsxs("div",{className:"rounded-xl border border-border/60 bg-card/40 overflow-hidden",children:[e.jsxs("div",{className:"px-4 py-3 border-b border-border/40 flex items-center gap-2",children:[e.jsx(U,{className:"h-3.5 w-3.5 text-amber-400/60"}),e.jsxs("div",{className:"flex-1 min-w-0",children:[e.jsx("span",{className:"text-[12px] font-semibold text-foreground",children:t.label}),e.jsx("span",{className:"text-[10px] text-muted-foreground/50 ml-2",children:t.description})]}),e.jsx(E,{variant:"secondary",className:"text-[9px] font-mono",children:t.language})]}),e.jsx(O,{code:t.code,language:t.language,copiedText:o,onCopy:l})]})}function O({code:t,copiedText:o,onCopy:l}){return e.jsxs("div",{className:"relative group",children:[e.jsx("pre",{className:"px-4 py-3 text-[11px] font-mono text-muted-foreground/80 overflow-x-auto leading-relaxed whitespace-pre-wrap",children:t}),e.jsx("button",{className:"absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-accent/50",onClick:()=>l(t,"code"),children:o===t?e.jsx(oe,{className:"h-3 w-3 text-emerald-400"}):e.jsx(z,{className:"h-3 w-3 text-muted-foreground/40"})})]})}export{kt as DeveloperPage};
