// UI rendering fixes: ensure preview/customer proposal uses the stylesheet's actual class names
// and explicitly toggle customer-view mode so public proposal pages are visible.

const _showPanelBase = showPanel;
showPanel = function(name){
  document.body.classList.remove('customer-view');
  document.querySelectorAll('.customer-only').forEach(x=>x.classList.remove('active'));
  return _showPanelBase(name);
};

function proposalHTML(d,opt={}){
  const acc=parseAccessories(d.accessories);
  const feats=parseFeatures(d.features||defaultFeatures(d.vehicle));
  const trade=num(d.tradeValue)>0||num(d.tradePayout)>0;
  const finalAmount=trade?num(d.changeover):num(d.driveaway);
  const initials=(settings().consultant||'PS').split(/\s+/).map(x=>x[0]).join('').slice(0,2).toUpperCase();
  const detailRows=[
    ['Base vehicle',d.salePrice],['Add-ons / options',d.accessoriesPrice],['Dealer delivery',d.dealerDelivery],
    ['Registration',d.registration],['Plate fee',d.plateFee],['Admin fee',d.adminFee],['CTP',d.ctp],
    ['Stamp duty',d.stampDuty],['Luxury Car Tax',d.lct],['Insurance',d.insurance]
  ].filter(x=>num(x[1])!==0);

  return `<article class="proposal">
    <section class="hero">
      <div class="hero-content">
        <div class="eyebrow">${opt.draft?'DRAFT PREVIEW':'YOUR VEHICLE PROPOSAL'}</div>
        <h1>${esc(d.vehicle||'Vehicle Proposal')}</h1>
        <p>Prepared for ${esc(d.customerName||'Customer')}</p>
      </div>
      <div class="vehicle-visual">${d.vehicleImage?`<img src="${d.vehicleImage}" alt="${esc(d.vehicle||'Vehicle')}">`:'Vehicle image'}</div>
    </section>

    <section class="proposal-section">
      <h2>Your vehicle</h2>
      <div class="specs">
        <div class="spec"><div class="v">${esc(d.make||'—')}</div><div class="l">Make</div></div>
        <div class="spec"><div class="v">${esc(d.colour||'—')}</div><div class="l">Colour</div></div>
        <div class="spec"><div class="v">${esc(d.bodyType||'—')}</div><div class="l">Body</div></div>
        <div class="spec"><div class="v">${esc(d.stockNo||'—')}</div><div class="l">Stock</div></div>
      </div>
    </section>

    ${acc.length?`<section class="proposal-section"><h2>Selected add-ons</h2><div class="cards">${acc.map(a=>`<div class="card"><h3>${esc(a.name)}</h3><p>${a.price?money(a.price):'Included'}</p></div>`).join('')}</div></section>`:''}

    <section class="proposal-section">
      <h2>Highlights</h2>
      <div class="cards">${feats.map(f=>`<div class="card"><h3>${esc(f.title)}</h3><p>${esc(f.desc)}</p></div>`).join('')}</div>
    </section>

    ${d.personalMessage?`<section class="proposal-section"><h2>A note from ${esc(settings().consultant)}</h2><p style="line-height:1.7;color:#657487">${esc(d.personalMessage).replace(/\n/g,'<br>')}</p></section>`:''}

    <section class="proposal-section" id="pricingSection">
      <h2>Your proposal</h2>
      <div class="pricing-summary">
        <div class="summary-card">
          <div class="summary-row"><span>Vehicle & options</span><strong>${money(num(d.salePriceIncAccOpt)||num(d.salePrice))}</strong></div>
          ${num(d.discount)?`<div class="summary-row"><span>Discount</span><strong>-${money(num(d.discount))}</strong></div>`:''}
          ${trade?`<div class="summary-row"><span>Trade-in value</span><strong>-${money(num(d.tradeValue))}</strong></div><div class="summary-row"><span>Finance payout</span><strong>${money(num(d.tradePayout))}</strong></div>`:''}
          <button class="details-toggle" type="button" onclick="this.nextElementSibling.classList.toggle('hidden')">View full price breakdown</button>
          <div class="price-list hidden">${detailRows.map(x=>`<div class="price-row"><span>${x[0]}</span><strong>${money(num(x[1]))}</strong></div>`).join('')}</div>
        </div>
        <div class="price-hero"><div class="label">${trade?'Changeover':'Driveaway price'}</div><div class="amount">${money(finalAmount)}</div></div>
      </div>
    </section>

    <section class="proposal-section cta-zone">
      <h2>${opt.draft?'Draft preview':'Ready when you are'}</h2>
      <p>${opt.draft?'This is how the customer-facing proposal will appear after publishing.':'Use the options below if you are happy with the proposal or would like something changed.'}</p>
      <div class="consultant"><div class="avatar">${esc(initials)}</div><div><strong>${esc(settings().consultant)}</strong><div>${esc(settings().title)} · ${esc(settings().dealership)}</div></div></div>
      <p class="disclaimer">${esc(settings().disclaimer)}</p>
    </section>
  </article>`;
}

const _remoteCustomerRenderer = renderCustomerFromHash;
renderCustomerFromHash = async function(){
  if(!location.hash.startsWith('#proposal=')) return;
  document.body.classList.add('customer-view');
  document.querySelectorAll('.customer-only').forEach(x=>x.classList.add('active'));
  try{
    await _remoteCustomerRenderer();
  }catch(err){
    console.error('Proposal rendering error',err);
    const el=$('customerProposal');
    if(el) el.innerHTML='<div class="panel"><h2>Proposal unavailable</h2><p>There was a problem displaying this proposal. Please refresh the page or contact your salesperson.</p></div>';
  }
};

// Rebind navigation after wrapping showPanel/renderCustomerFromHash.
$('navDash').onclick=()=>{showPanel('dashboard');renderRows()};
$('navCreate').onclick=()=>{document.body.classList.remove('customer-view');createFlow()};
$('navParser').onclick=()=>showPanel('parserTest');
$('navSettings').onclick=()=>{loadSettings();showPanel('settings')};
$('createTop').onclick=()=>{document.body.classList.remove('customer-view');createFlow()};
$('backDash').onclick=()=>showPanel('dashboard');

// Make draft preview fail visibly rather than leaving a blank/dark canvas.
const _setStepBase=setStep;
setStep=function(n){
  document.body.classList.remove('customer-view');
  _setStepBase(n);
  if(n===3){
    const target=$('proposalPreview');
    if(target && !target.innerHTML.trim()) target.innerHTML='<div class="panel"><h3>Preview unavailable</h3><p>Please return to Review and check the proposal fields.</p></div>';
    if(target) target.scrollIntoView({block:'start'});
  }
};

// If opened directly as a customer URL, render after all overrides are installed.
if(location.hash.startsWith('#proposal=')) renderCustomerFromHash();
