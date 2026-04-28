/* FairFlow AI - Enhanced App Logic */
const API = 'http://localhost:8000';

// ── Toast ────────────────────────────────────
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2800);
}

// ── Topbar scroll effect ─────────────────────
window.addEventListener('scroll', () => {
  document.getElementById('topbar').classList.toggle('scrolled', window.scrollY > 8);
});

// ── Page Navigation ──────────────────────────
function showPage(pageId) {
  document.querySelectorAll('.page-view').forEach(el => {
    if (el.id && el.id.startsWith('page-')) el.classList.remove('active');
  });
  const target = document.getElementById('page-' + pageId);
  if (target) target.classList.add('active');
  document.querySelectorAll('.topbar-nav a').forEach(a => {
    a.classList.toggle('active', a.dataset.page === pageId);
  });
  if (pageId === 'supply') initMap();
  if (pageId === 'dashboard') drawDashboardCharts();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.querySelectorAll('.topbar-nav a').forEach(a => {
  a.addEventListener('click', e => { e.preventDefault(); showPage(a.dataset.page); });
});
document.getElementById('logo-home').addEventListener('click', e => { e.preventDefault(); showPage('home'); });

// ── Fairness Tabs ────────────────────────────
document.querySelectorAll('#fairness-tabs .tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('#fairness-tabs .tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    ['upload', 'scan', 'mitigate', 'whatif'].forEach(id => {
      const el = document.getElementById('ftab-' + id);
      if (el) el.style.display = (id === tab.dataset.tab) ? 'block' : 'none';
    });
  });
});

// ── Sample Data ──────────────────────────────
const COLS = ['id','age','gender','ethnicity','education','experience_yrs','zip_code','skills_score','interview_score','referral','decision'];
const ROWS = [
  [1,34,'Female','Black',"Master's",8,'30301',82,88,'No','Rejected'],
  [2,29,'Male','White',"Bachelor's",5,'10001',79,85,'Yes','Approved'],
  [3,41,'Female','Hispanic',"PhD",12,'60614',91,90,'No','Rejected'],
  [4,26,'Male','White',"Bachelor's",3,'94102',74,78,'Yes','Approved'],
  [5,38,'Female','Asian',"Master's",10,'30301',88,92,'No','Approved'],
  [6,31,'Male','Black',"Bachelor's",6,'77001',76,80,'No','Rejected'],
  [7,45,'Male','White',"MBA",15,'10001',93,95,'Yes','Approved'],
  [8,28,'Female','White',"Bachelor's",4,'94102',81,84,'No','Rejected'],
];

async function loadSampleData() {
  document.getElementById('upload-zone').style.display = 'none';
  document.getElementById('btn-load-sample').style.display = 'none';

  // Try backend first
  try {
    const res = await fetch(API + '/api/load-sample');
    if (res.ok) {
      const data = await res.json();
      renderPreviewTable(data.columns || COLS, data.rows || ROWS);
      document.getElementById('preview-title').textContent = 'Data Preview - sample_hiring_data.csv';
      document.getElementById('preview-stats').textContent = `${data.total_records.toLocaleString()} records • ${data.total_columns} columns`;
      toast('Dataset loaded from backend');
      if (data.analysis) {
        document.getElementById('gemini-detect-box').innerHTML = `<p><strong>Gemini Analysis:</strong> ${data.analysis}</p>`;
      }
      document.getElementById('data-preview').style.display = 'block';
      return;
    }
  } catch(e) { /* fallback to local */ }

  renderPreviewTable(COLS, ROWS);
  document.getElementById('data-preview').style.display = 'block';
}

async function handleFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  document.getElementById('upload-zone').style.display = 'none';
  document.getElementById('btn-load-sample').style.display = 'none';
  document.getElementById('data-preview').style.display = 'none';
  
  const formData = new FormData();
  formData.append('file', file);
  
  try {
    const res = await fetch(API + '/api/upload', {
      method: 'POST',
      body: formData
    });
    
    if (res.ok) {
      const data = await res.json();
      if (!data.columns || !data.rows) {
        throw new Error('Upload response missing columns or rows');
      }
      renderPreviewTable(data.columns, data.rows);
      document.getElementById('preview-title').textContent = `Data Preview - ${file.name}`;
      document.getElementById('preview-stats').textContent = `${data.total_records.toLocaleString()} records • ${data.total_columns} columns`;
      toast('Dataset uploaded successfully');
      if (data.analysis) {
        document.getElementById('gemini-detect-box').innerHTML = `<p><strong>Gemini Analysis:</strong> ${data.analysis}</p>`;
      }
      document.getElementById('data-preview').style.display = 'block';
    } else {
      toast('Error uploading dataset');
      document.getElementById('upload-zone').style.display = 'block';
      document.getElementById('btn-load-sample').style.display = 'inline-flex';
      document.getElementById('data-preview').style.display = 'none';
    }
  } catch (e) {
    toast('Backend unreachable. Check connection.');
    document.getElementById('upload-zone').style.display = 'block';
    document.getElementById('btn-load-sample').style.display = 'inline-flex';
    document.getElementById('data-preview').style.display = 'none';
  }
}

// Add drag and drop support
const dropZone = document.getElementById('upload-zone');
if (dropZone) {
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });
  dropZone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
  });
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length) {
      document.getElementById('file-upload').files = e.dataTransfer.files;
      handleFileUpload({ target: { files: e.dataTransfer.files } });
    }
  });
}

function renderPreviewTable(cols, rows) {
  const thead = document.querySelector('#preview-table thead');
  const tbody = document.querySelector('#preview-table tbody');
  thead.innerHTML = '<tr>' + cols.map(c => '<th>' + c + '</th>').join('') + '</tr>';
  tbody.innerHTML = rows.map(row =>
    '<tr>' + row.map((cell, i) => {
      let cls = '';
      const col = cols[i];
      if (col === 'gender' || col === 'ethnicity') cls = ' style="background:#fef7e0;font-weight:600"';
      if (col === 'zip_code') cls = ' style="background:#fce8e6;font-weight:600"';
      if (col === 'decision') cls = cell === 'Rejected' ? ' style="color:#c5221f;font-weight:600"' : ' style="color:#137333;font-weight:600"';
      return '<td' + cls + '>' + cell + '</td>';
    }).join('') + '</tr>'
  ).join('');
}

// ── Bias Scan ────────────────────────────────
const METRICS = [
  { name: 'Demographic Parity', value: 0.31, severity: 'danger' },
  { name: 'Equalized Odds', value: 0.28, severity: 'danger' },
  { name: 'Disparate Impact', value: 0.62, severity: 'danger' },
  { name: 'Predictive Parity', value: 0.71, severity: 'warning' },
  { name: 'Calibration', value: 0.78, severity: 'warning' },
  { name: 'Intersectional (G×R)', value: 0.24, severity: 'danger' },
  { name: 'Individual Fairness', value: 0.65, severity: 'warning' },
  { name: 'Counterfactual', value: 0.42, severity: 'danger' },
];

async function runBiasScan() {
  switchTab('scan');
  const loader = document.getElementById('scan-loader');
  const results = document.getElementById('scan-results');
  loader.style.display = 'flex';
  results.style.display = 'none';

  let metrics = METRICS;
  let score = 42;

  try {
    const res = await fetch(API + '/api/run-audit', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ dataset: 'hiring_sample' }) });
    if (res.ok) {
      const data = await res.json();
      if (data.metrics) metrics = data.metrics;
      if (data.score) score = data.score;
    }
  } catch(e) { /* use defaults */ }

  // Simulate processing delay for UX
  await delay(1500);
  loader.style.display = 'none';
  results.style.display = 'block';

  // Animate score ring
  const scoreEl = document.getElementById('overall-score');
  const ring = document.getElementById('score-ring-progress');
  animateNumber(scoreEl, 0, score, 1200);
  const offset = 440 - (440 * score / 100);
  setTimeout(() => { ring.style.strokeDashoffset = offset; }, 100);

  // Populate metrics with stagger
  const list = document.getElementById('metrics-list');
  list.innerHTML = metrics.map((m, i) => {
    const pct = Math.round(m.value * 100);
    return `<div class="metric-item fade-up stagger-${i+1}">
      <div class="metric-name">${m.name}</div>
      <div class="metric-bar-track"><div class="metric-bar-fill ${m.severity}" style="width:0%;" data-width="${pct}%"></div></div>
      <div class="metric-value">${m.value.toFixed(2)}</div>
    </div>`;
  }).join('');

  // Animate bars
  setTimeout(() => {
    list.querySelectorAll('.metric-bar-fill').forEach(bar => {
      bar.style.width = bar.dataset.width;
    });
  }, 200);
}

function switchTab(tabId) {
  document.querySelectorAll('#fairness-tabs .tab').forEach(t => t.classList.remove('active'));
  document.getElementById('tab-' + tabId).classList.add('active');
  ['upload', 'scan', 'mitigate', 'whatif'].forEach(id => {
    const el = document.getElementById('ftab-' + id);
    if (el) el.style.display = (id === tabId) ? 'block' : 'none';
  });
}

// ── Mitigation ───────────────────────────────
function showMitigate() { switchTab('mitigate'); }

async function selectMitigation(el, strategy) {
  document.querySelectorAll('#mitigation-options .route-option').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
  const data = {
    reweight: { acc:'87.1%', f1:'0.85', dp:'0.92', eo:'0.89', di:'0.94' },
    threshold: { acc:'85.7%', f1:'0.83', dp:'0.95', eo:'0.91', di:'0.96' },
    adversarial: { acc:'84.0%', f1:'0.81', dp:'0.97', eo:'0.94', di:'0.98' },
  };
  let d = data[strategy];

  try {
    const res = await fetch(API + '/api/mitigate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ strategy, sensitive_col: 'gender' })
    });
    if (res.ok) {
      const result = await res.json();
      if (result.after) {
        d = {
          acc: result.after.accuracy != null ? formatPercent(result.after.accuracy, 1) : d.acc,
          f1: result.after.f1 != null ? result.after.f1.toFixed(2) : d.f1,
          dp: result.after.demographic_parity != null ? result.after.demographic_parity.toFixed(2) : d.dp,
          eo: result.after.equalized_odds != null ? result.after.equalized_odds.toFixed(2) : d.eo,
          di: result.after.disparate_impact != null ? result.after.disparate_impact.toFixed(2) : d.di,
        };
      }
    }
  } catch (e) { /* fallback to static */ }

  document.getElementById('after-col').innerHTML = `<h4 style="color:#137333">After Mitigation</h4>
    <div class="compare-row"><span>Accuracy</span><strong>${d.acc}</strong></div>
    <div class="compare-row"><span>F1 Score</span><strong>${d.f1}</strong></div>
    <div class="compare-row"><span>Demographic Parity</span><strong style="color:#137333">${d.dp}</strong></div>
    <div class="compare-row"><span>Equalized Odds</span><strong style="color:#137333">${d.eo}</strong></div>
    <div class="compare-row"><span>Disparate Impact</span><strong style="color:#137333">${d.di}</strong></div>`;
}

// ── What-If ──────────────────────────────────
async function updateWhatIf() {
  const gender = document.getElementById('whatif-gender').value;
  const result = document.getElementById('whatif-result');
  const decision = document.getElementById('whatif-decision');
  const confidence = document.getElementById('whatif-confidence');
  const explanation = document.getElementById('whatif-explanation');
  const payload = {
    age: 34,
    education: "Master's",
    experience: 8,
    gender: gender === 'male' ? 'Male' : 'Female'
  };

  try {
    const res = await fetch(API + '/api/what-if', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      const data = await res.json();
      const decisionText = data.original?.decision || 'REJECTED';
      const decisionUpper = decisionText.toUpperCase();
      const isApproved = decisionUpper === 'APPROVED';
      result.style.background = isApproved ? '#e6f4ea' : '#fce8e6';
      decision.textContent = decisionUpper;
      decision.style.color = isApproved ? '#137333' : '#c5221f';
      confidence.textContent = `${data.original?.confidence ?? 70}%`;
      if (data.gemini_explanation) {
        explanation.innerHTML = data.gemini_explanation;
      } else {
        const alt = data.counterfactual || {};
        explanation.innerHTML = `If this applicant's gender were changed to <strong>${alt.gender || 'Male'}</strong>, the model would predict <strong>${(alt.decision || 'APPROVED').toUpperCase()}</strong> with ${alt.confidence ?? 80}% confidence.`;
      }
      return;
    }
  } catch (e) { /* fallback to static */ }

  if (gender === 'male') {
    result.style.background = '#e6f4ea';
    decision.textContent = 'APPROVED'; decision.style.color = '#137333';
    confidence.textContent = '81%';
    explanation.innerHTML = 'When gender is set to <strong>Male</strong>, the model predicts <strong>APPROVED</strong> with 81% confidence. This confirms a direct gender bias - identical qualifications yield different outcomes based on gender alone.';
  } else {
    result.style.background = '#fce8e6';
    decision.textContent = 'REJECTED'; decision.style.color = '#c5221f';
    confidence.textContent = '73%';
    explanation.innerHTML = 'If this applicant\'s gender were changed to Male with all other attributes held constant, the model would predict <strong>APPROVED</strong> with 81% confidence. This indicates a direct gender bias in the model\'s decision boundary.';
  }
}

// ── Supply Chain Map ─────────────────────────
let mapInstance = null;
const SHIPMENTS = [
  { id:'SC-4821', from:'Shanghai', to:'Rotterdam', status:'disrupted', risk:87, fromCoord:[31.23,121.47], toCoord:[51.92,4.48] },
  { id:'SC-4822', from:'Shenzhen', to:'Los Angeles', status:'at-risk', risk:72, fromCoord:[22.54,114.06], toCoord:[33.74,-118.26] },
  { id:'SC-4823', from:'Mumbai', to:'Hamburg', status:'at-risk', risk:65, fromCoord:[19.08,72.88], toCoord:[53.55,9.99] },
  { id:'SC-4824', from:'Tokyo', to:'Seattle', status:'on-time', risk:18, fromCoord:[35.68,139.69], toCoord:[47.61,-122.33] },
  { id:'SC-4825', from:'Singapore', to:'Dubai', status:'on-time', risk:12, fromCoord:[1.35,103.82], toCoord:[25.20,55.27] },
  { id:'SC-4826', from:'Busan', to:'Long Beach', status:'on-time', risk:22, fromCoord:[35.18,129.08], toCoord:[33.77,-118.19] },
  { id:'SC-4827', from:'Chennai', to:'Felixstowe', status:'at-risk', risk:58, fromCoord:[13.08,80.27], toCoord:[51.96,1.35] },
  { id:'SC-4828', from:'Ho Chi Minh', to:'Antwerp', status:'on-time', risk:15, fromCoord:[10.82,106.63], toCoord:[51.22,4.40] },
  { id:'SC-4829', from:'Yokohama', to:'Vancouver', status:'on-time', risk:8, fromCoord:[35.44,139.64], toCoord:[49.28,-123.12] },
  { id:'SC-4830', from:'Ningbo', to:'Piraeus', status:'disrupted', risk:81, fromCoord:[29.87,121.55], toCoord:[37.94,23.65] },
  { id:'SC-4831', from:'Taipei', to:'Santos', status:'at-risk', risk:61, fromCoord:[25.03,121.57], toCoord:[-23.96,-46.33] },
  { id:'SC-4832', from:'Jakarta', to:'Jeddah', status:'on-time', risk:20, fromCoord:[-6.21,106.85], toCoord:[21.49,39.19] },
];

function initMap() {
  if (mapInstance) return;
  setTimeout(() => {
    mapInstance = L.map('supply-map', { scrollWheelZoom: true }).setView([20, 60], 2);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '© OpenStreetMap © CARTO', maxZoom: 18,
    }).addTo(mapInstance);
    const colors = { 'on-time':'#34A853', 'at-risk':'#FBBC04', disrupted:'#EA4335' };
    SHIPMENTS.forEach(s => {
      const c = colors[s.status];
      L.circleMarker(s.fromCoord, { radius:5, fillColor:c, color:'#fff', weight:1, fillOpacity:.9 }).addTo(mapInstance).bindTooltip(s.from);
      L.circleMarker(s.toCoord, { radius:5, fillColor:c, color:'#fff', weight:1, fillOpacity:.9 }).addTo(mapInstance).bindTooltip(s.to);
      L.polyline([s.fromCoord, s.toCoord], { color:c, weight:2, opacity:.6, dashArray: s.status==='disrupted' ? '8 6' : null }).addTo(mapInstance);
    });
  }, 200);
  populateShipmentList();
}

function populateShipmentList() {
  const list = document.getElementById('shipment-list');
  list.innerHTML = SHIPMENTS.sort((a,b) => b.risk - a.risk).map(s => `
    <div class="shipment-item" onclick="selectShipment('${s.id}')">
      <div class="shipment-dot ${s.status}"></div>
      <div class="shipment-info"><div class="shipment-id">${s.id}</div><div class="shipment-route">${s.from} → ${s.to}</div></div>
      <div class="shipment-risk" style="color:${s.risk>60?'#EA4335':s.risk>30?'#FBBC04':'#34A853'}">${s.risk}</div>
    </div>`).join('');
}

function selectShipment(id) {
  document.querySelectorAll('.shipment-item').forEach(el => el.classList.remove('selected'));
  document.querySelectorAll('.shipment-item').forEach(el => { if (el.querySelector('.shipment-id').textContent === id) el.classList.add('selected'); });
  const s = SHIPMENTS.find(s => s.id === id);
  const detail = document.getElementById('shipment-detail');
  detail.style.display = 'block';
  const texts = {
    disrupted: `Severe disruption detected on the <strong>${s.from} → ${s.to}</strong> corridor. Risk Score: <strong>${s.risk}/100</strong>. Weather advisory and port congestion are contributing factors. Immediate rerouting recommended.`,
    'at-risk': `Elevated risk on the <strong>${s.from} → ${s.to}</strong> route. Risk Score: <strong>${s.risk}/100</strong>. Moderate port delays expected within 72 hours. Consider preemptive rerouting.`,
    'on-time': `Shipment <strong>${s.id}</strong> on the <strong>${s.from} → ${s.to}</strong> route is proceeding normally. Risk Score: <strong>${s.risk}/100</strong>. No action needed.`,
  };
  document.getElementById('shipment-gemini-text').innerHTML = texts[s.status];
}

function selectRoute(el, index) {
  document.querySelectorAll('#route-options .route-option').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
}

// ── Dashboard Charts ─────────────────────────
function drawDashboardCharts() {
  drawLineChart('fairness-trend-chart', [42,45,48,52,55,58,61,63,65,68,70,72,73,74,75,76,77,78], '#4285F4');
  drawLineChart('sc-trend-chart', [71,72,74,73,76,78,80,82,84,83,85,87,88,89,90,90,91,91], '#34A853');
  populateAlerts();
}

function drawLineChart(canvasId, data, color) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width = canvas.parentElement.clientWidth;
  const h = canvas.height = 200;
  const pad = { top:20, right:20, bottom:30, left:40 };
  const plotW = w-pad.left-pad.right, plotH = h-pad.top-pad.bottom;
  const min = Math.min(...data)-5, max = Math.max(...data)+5;
  ctx.clearRect(0,0,w,h);

  // Grid
  ctx.strokeStyle = '#e8eaed'; ctx.lineWidth = 1;
  for (let i=0;i<=4;i++) {
    const y = pad.top + (plotH/4)*i;
    ctx.beginPath(); ctx.moveTo(pad.left,y); ctx.lineTo(w-pad.right,y); ctx.stroke();
    ctx.fillStyle = '#5f6368'; ctx.font = '11px Inter'; ctx.textAlign = 'right';
    ctx.fillText(Math.round(max-(max-min)*(i/4)), pad.left-8, y+4);
  }

  // Line
  ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.lineJoin = 'round';
  data.forEach((val,i) => {
    const x = pad.left+(plotW/(data.length-1))*i;
    const y = pad.top+plotH-((val-min)/(max-min))*plotH;
    if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
  });
  ctx.stroke();

  // Fill
  const lastX = pad.left+plotW;
  const lastY = pad.top+plotH-((data[data.length-1]-min)/(max-min))*plotH;
  ctx.lineTo(lastX,pad.top+plotH); ctx.lineTo(pad.left,pad.top+plotH); ctx.closePath();
  const grad = ctx.createLinearGradient(0,pad.top,0,pad.top+plotH);
  grad.addColorStop(0, color+'25'); grad.addColorStop(1, color+'05');
  ctx.fillStyle = grad; ctx.fill();

  // Dot
  ctx.beginPath(); ctx.arc(lastX,lastY,4,0,Math.PI*2); ctx.fillStyle=color; ctx.fill();
  ctx.strokeStyle='#fff'; ctx.lineWidth=2; ctx.stroke();
}

function populateAlerts() {
  const alerts = [
    { time:'2 min ago', domain:'Supply Chain', alert:'Typhoon warning - SC-4821 route compromised', severity:'red', status:'Action needed' },
    { time:'15 min ago', domain:'Fairness', alert:'New audit completed - Lending Model v2.3', severity:'yellow', status:'Review' },
    { time:'1 hr ago', domain:'Supply Chain', alert:'SC-4830 delayed at Suez - reroute suggested', severity:'red', status:'Action needed' },
    { time:'3 hrs ago', domain:'Fairness', alert:'Hiring model bias score improved to 78/100', severity:'green', status:'Resolved' },
    { time:'5 hrs ago', domain:'Supply Chain', alert:'Port of Rotterdam congestion decreasing', severity:'green', status:'Monitoring' },
  ];
  document.querySelector('#alerts-table tbody').innerHTML = alerts.map(a => `<tr>
    <td>${a.time}</td><td>${a.domain}</td><td>${a.alert}</td>
    <td><span class="chip chip-${a.severity}">${a.severity==='red'?'High':a.severity==='yellow'?'Medium':'Low'}</span></td>
    <td>${a.status}</td></tr>`).join('');
}

// ── Utilities ────────────────────────────────
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

function formatPercent(value, digits) {
  const pct = (value ?? 0) * 100;
  return pct.toFixed(digits) + '%';
}

function animateNumber(el, from, to, duration) {
  const start = performance.now();
  function update(now) {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(from + (to - from) * eased);
    if (progress < 1) requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
}
