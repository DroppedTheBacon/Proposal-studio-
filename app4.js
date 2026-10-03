async function apiPublishProposal(p){
  const res=await fetch('/api/proposals/'+encodeURIComponent(p.token),{
    method:'PUT',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({payload:p,enabled:p.linkEnabled!==false,expiry:p.expiry||null,pin:p.pin||''})
  });
  if(!res.ok) throw new Error('publish_failed');
  return res.json();
}

async function publishCurrent(){
  const p=saveDraftFromForm();
  p.expiry=$('expiry').value||'';
  p.pin=$('pin').value.trim();
  p.linkEnabled=$('linkEnabled').value==='true';
  const version=(p.versions?.length||0)+1;
  const data=JSON.parse(JSON.stringify(p.draft));
  p.published={...data,version,publishedAt:nowISO()};
  p.versions=p.versions||[];
  p.versions.unshift({version,publishedAt:nowISO(),user:settings().consultant,note:$('versionNote').value.trim()||`Version ${version}`,data});
  p.draft=null;
  p.status='Published';
  addEvent(p,'published',`Version ${version} published`);
  persist();
  renderRows();
  const btn=$('publishNow');
  const old=btn.textContent;
  btn.disabled=true;
  btn.textContent='Publishing…';
  try{
    await apiPublishProposal(p);
    toast('Proposal published');
    showPanel('dashboard');
  }catch(e){
    p.status='Draft';
    p.draft=data;
    p.published=p.versions[1]?.data?{...p.versions[1].data,version:p.versions[1].version,publishedAt:p.versions[1].publishedAt}:null;
    persist();
    renderRows();
    toast('Publish failed — please try again');
    console.error(e);
  }finally{
    btn.disabled=false;
    btn.textContent=old;
  }
}

async function fetchRemoteProposal(token){
  const res=await fetch('/api/proposals/'+encodeURIComponent(token),{cache:'no-store'});
  if(!res.ok){
    const err=await res.json().catch(()=>({error:'unavailable'}));
    const e=new Error(err.error||'unavailable');
    e.code=err.error||'unavailable';
    throw e;
  }
  return res.json();
}

async function renderCustomerFromHash(){
  const m=location.hash.match(/proposal=([a-f0-9]+)/i);
  if(!m)return;
  const token=m[1];
  document.querySelectorAll('.dashboard-ui').forEach(x=>x.classList.add('hidden'));
  document.querySelectorAll('.customer-only').forEach(x=>x.classList.add('active'));
  $('customerProposal').innerHTML='<div class="panel"><h2>Loading proposal…</h2><p>Please wait a moment.</p></div>';

  let p=db.proposals.find(x=>x.token===token);
  if(!p||!p.published){
    try{
      const remote=await fetchRemoteProposal(token);
      p=remote.proposal;
    }catch(e){
      const copy=e.code==='expired'?'This proposal has expired. Please contact your salesperson for an updated proposal.':e.code==='disabled'?'This proposal link has been disabled. Please contact your salesperson.':'This proposal could not be found.';
      $('customerProposal').innerHTML=`<div class="panel"><h2>Proposal unavailable</h2><p>${esc(copy)}</p></div>`;
      return;
    }
  }

  if(!p.linkEnabled){
    $('customerProposal').innerHTML='<div class="panel"><h2>Proposal unavailable</h2><p>This proposal link has been disabled. Please contact your salesperson.</p></div>';
    return;
  }
  if(p.expiry&&new Date(p.expiry+'T23:59:59')<new Date()){
    $('customerProposal').innerHTML='<div class="panel"><h2>Proposal expired</h2><p>Please contact your salesperson for an updated proposal.</p></div>';
    return;
  }

  $('customerProposal').innerHTML=proposalHTML(p.published,{draft:false});
  const local=db.proposals.find(x=>x.token===token);
  if(local){
    local.viewCount=(local.viewCount||0)+1;
    local.firstViewed=local.firstViewed||nowISO();
    local.lastViewed=nowISO();
    if(local.status==='Published')local.status='Viewed';
    addEvent(local,'viewed','Customer viewed proposal');
  }
  fetch('/api/proposals/'+encodeURIComponent(token)+'/events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'viewed',text:'Customer viewed proposal'})}).catch(()=>{});

  const pricing=$('pricingSection');
  if(pricing){
    const io=new IntersectionObserver(entries=>{
      if(entries.some(e=>e.isIntersecting)){
        fetch('/api/proposals/'+encodeURIComponent(token)+'/events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'pricing',text:'Customer viewed pricing'})}).catch(()=>{});
        io.disconnect();
      }
    },{threshold:.35});
    io.observe(pricing);
  }

  $('stickyHappy').onclick=()=>{
    if(local){local.customerResponse='Happy';local.status='Accepted';addEvent(local,'accepted','Customer indicated they are happy with the proposal')}
    fetch('/api/proposals/'+encodeURIComponent(token)+'/events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'accepted',text:'Customer indicated they are happy with the proposal',response:'Happy'})}).catch(()=>{});
    toast('Response recorded');
  };
  $('stickyChange').onclick=()=>customerChangeRemote(p,token,local);
}

function customerChangeRemote(p,token,local){
  $('modalLayer').className='modal-layer';
  $('modalLayer').innerHTML=`<div class="modal"><h3>Request a change</h3><div class="field"><label>What would you like to change?</label><select id="changeType"><option>Different vehicle</option><option>Different colour</option><option>Add accessory</option><option>Remove accessory</option><option>Trade details</option><option>Pricing / finance</option><option>Other</option></select></div><div class="field"><label>Message</label><textarea id="changeMsg"></textarea></div><div class="actions"><button class="btn ghost" id="cancelChange">Cancel</button><button class="btn primary" id="submitChange">Send request</button></div></div>`;
  $('cancelChange').onclick=()=>{$('modalLayer').className='hidden'};
  $('submitChange').onclick=()=>{
    const type=$('changeType').value;
    const message=$('changeMsg').value;
    if(local){
      local.requests=local.requests||[];
      local.requests.push({type,message,at:nowISO(),status:'Open',version:p.published.version});
      local.customerResponse='Change requested';
      local.status='Customer Responded';
      addEvent(local,'request','Customer submitted a change request');
    }
    fetch('/api/proposals/'+encodeURIComponent(token)+'/events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'request',text:`Customer requested change: ${type}${message?` — ${message}`:''}`,response:'Change requested'})}).catch(()=>{});
    $('modalLayer').className='hidden';
    toast('Request sent');
  };
}

$('publishNow').onclick=publishCurrent;
