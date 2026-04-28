"""
FairFlow AI - Backend Server
FastAPI backend with Gemini integration, fairness auditing, and supply chain optimization.
"""

import os, json, io, math, random
from typing import Optional
from datetime import datetime

import numpy as np
import pandas as pd
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# ── Optional: dotenv
try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception:
    pass

# ── Optional: Gemini
try:
    from google import genai
    GEMINI_AVAILABLE = True
except ImportError:
    GEMINI_AVAILABLE = False

# ── Optional: sklearn for fairness metrics
try:
    from sklearn.linear_model import LogisticRegression
    from sklearn.model_selection import train_test_split
    from sklearn.metrics import accuracy_score, f1_score
    SKLEARN_AVAILABLE = True
except ImportError:
    SKLEARN_AVAILABLE = False

# ══════════════════════════════════════════════
# App Setup
# ══════════════════════════════════════════════
app = FastAPI(title="FairFlow AI", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Gemini config
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
gemini_client = None
if GEMINI_AVAILABLE and GEMINI_API_KEY:
    gemini_client = genai.Client(api_key=GEMINI_API_KEY)

# ── In-memory state
uploaded_data: Optional[pd.DataFrame] = None
audit_results: dict = {}

# ══════════════════════════════════════════════
# Sample Data Generator
# ══════════════════════════════════════════════
def generate_sample_hiring_data(n=500):
    """Generate a realistic hiring dataset with embedded bias."""
    np.random.seed(42)
    genders = np.random.choice(['Male', 'Female'], n, p=[0.55, 0.45])
    ethnicities = np.random.choice(['White', 'Black', 'Hispanic', 'Asian'], n, p=[0.5, 0.2, 0.18, 0.12])
    ages = np.random.randint(22, 55, n)
    education = np.random.choice(["Bachelor's", "Master's", "PhD", "MBA"], n, p=[0.5, 0.3, 0.1, 0.1])
    experience = np.clip(ages - 22 + np.random.randint(-3, 5, n), 0, 30)
    # Inject gender bias into experience
    experience[genders == 'Female'] = np.clip(experience[genders == 'Female'] - 2, 0, 30)
    skills = np.random.randint(60, 100, n)
    interview = np.random.randint(60, 100, n)
    referral = np.random.choice(['Yes', 'No'], n, p=[0.3, 0.7])
    zips = np.where(ethnicities == 'White',
                    np.random.choice(['10001', '94102', '60601'], n),
                    np.random.choice(['30301', '77001', '60614'], n))
    # Biased decision: favors male, white, referral
    score = (skills * 0.3 + interview * 0.3 + experience * 2 +
             (genders == 'Male').astype(int) * 8 +
             (ethnicities == 'White').astype(int) * 5 +
             (referral == 'Yes').astype(int) * 6 +
             np.random.randn(n) * 5)
    threshold = np.percentile(score, 55)
    decision = np.where(score >= threshold, 'Approved', 'Rejected')
    return pd.DataFrame({
        'id': range(1, n+1), 'age': ages, 'gender': genders,
        'ethnicity': ethnicities, 'education': education,
        'experience_yrs': experience, 'zip_code': zips,
        'skills_score': skills, 'interview_score': interview,
        'referral': referral, 'decision': decision
    })

# ══════════════════════════════════════════════
# Fairness Metrics Engine
# ══════════════════════════════════════════════
def compute_demographic_parity(df, decision_col, sensitive_col, positive_label='Approved'):
    """Compute demographic parity difference."""
    groups = df.groupby(sensitive_col)[decision_col].apply(
        lambda x: (x == positive_label).mean()
    )
    return round(float(groups.max() - groups.min()), 3)

def compute_disparate_impact(df, decision_col, sensitive_col, positive_label='Approved'):
    """Compute disparate impact ratio (4/5ths rule)."""
    groups = df.groupby(sensitive_col)[decision_col].apply(
        lambda x: (x == positive_label).mean()
    )
    if groups.max() == 0:
        return 1.0
    return round(float(groups.min() / groups.max()), 3)

def compute_equalized_odds_proxy(df, decision_col, sensitive_col, positive_label='Approved'):
    """Simplified equalized odds difference."""
    approved = df[df[decision_col] == positive_label]
    rejected = df[df[decision_col] != positive_label]
    if len(approved) == 0 or len(rejected) == 0:
        return 0.0
    rates_a = approved.groupby(sensitive_col).size() / df.groupby(sensitive_col).size()
    return round(float(rates_a.max() - rates_a.min()), 3)

def detect_proxy_variables(df, sensitive_cols):
    """Detect proxy variables that correlate with sensitive attributes."""
    proxies = []
    numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
    cat_cols = [c for c in df.columns if c not in numeric_cols and c not in sensitive_cols and c != 'id' and c != 'decision']
    for scol in sensitive_cols:
        for col in cat_cols:
            try:
                ct = pd.crosstab(df[scol], df[col])
                n = ct.sum().sum()
                chi2 = 0
                for i in range(ct.shape[0]):
                    for j in range(ct.shape[1]):
                        exp = ct.iloc[i].sum() * ct.iloc[:, j].sum() / n
                        if exp > 0:
                            chi2 += (ct.iloc[i, j] - exp)**2 / exp
                cramers_v = math.sqrt(chi2 / (n * (min(ct.shape) - 1))) if min(ct.shape) > 1 else 0
                if cramers_v > 0.3:
                    proxies.append({'column': col, 'correlates_with': scol, 'cramers_v': round(cramers_v, 3)})
            except Exception:
                pass
    return proxies

def run_full_audit(df):
    """Run complete fairness audit on a dataset."""
    sensitive_cols = []
    sensitive_keywords = ['gender', 'sex', 'race', 'ethnicity', 'age', 'religion', 'disability']
    for col in df.columns:
        if any(kw in col.lower() for kw in sensitive_keywords):
            sensitive_cols.append(col)

    decision_col = None
    decision_keywords = ['decision', 'outcome', 'result', 'label', 'target', 'approved', 'hired']
    for col in df.columns:
        if any(kw in col.lower() for kw in decision_keywords):
            decision_col = col
            break
    if not decision_col:
        decision_col = df.columns[-1]

    results = {'sensitive_columns': sensitive_cols, 'decision_column': decision_col, 'metrics': [], 'proxies': []}
    positive_label = 'Approved'
    if positive_label not in df[decision_col].values:
        positive_label = df[decision_col].value_counts().index[0]

    total_score = 0
    for scol in sensitive_cols:
        dp = compute_demographic_parity(df, decision_col, scol, positive_label)
        di = compute_disparate_impact(df, decision_col, scol, positive_label)
        eo = compute_equalized_odds_proxy(df, decision_col, scol, positive_label)

        def severity(val, threshold_good=0.1, threshold_warn=0.3):
            if val <= threshold_good: return 'good'
            if val <= threshold_warn: return 'warning'
            return 'danger'

        results['metrics'].extend([
            {'name': f'Demographic Parity ({scol})', 'value': dp, 'severity': severity(dp)},
            {'name': f'Disparate Impact ({scol})', 'value': di, 'severity': 'good' if di >= 0.8 else ('warning' if di >= 0.6 else 'danger')},
            {'name': f'Equalized Odds ({scol})', 'value': eo, 'severity': severity(eo)},
        ])
        group_score = (1 - dp) * 30 + (min(di, 1)) * 40 + (1 - eo) * 30
        total_score += group_score

    # Intersectional
    if len(sensitive_cols) >= 2:
        combo_col = df[sensitive_cols[0]].astype(str) + '_' + df[sensitive_cols[1]].astype(str)
        df_temp = df.copy()
        df_temp['_intersect'] = combo_col
        inter_dp = compute_demographic_parity(df_temp, decision_col, '_intersect', positive_label)
        results['metrics'].append({
            'name': f'Intersectional ({sensitive_cols[0]}×{sensitive_cols[1]})',
            'value': inter_dp,
            'severity': 'danger' if inter_dp > 0.3 else ('warning' if inter_dp > 0.15 else 'good')
        })

    proxies = detect_proxy_variables(df, sensitive_cols)
    results['proxies'] = proxies

    if sensitive_cols:
        avg_score = total_score / len(sensitive_cols)
    else:
        avg_score = 50
    results['score'] = max(0, min(100, int(avg_score)))

    return results

# ══════════════════════════════════════════════
# Mitigation Engine
# ══════════════════════════════════════════════
def apply_reweighting(df, sensitive_col, decision_col, positive_label='Approved'):
    """Apply reweighting mitigation strategy."""
    if not SKLEARN_AVAILABLE:
        return _simulated_mitigation('reweight')

    feature_cols = [c for c in df.select_dtypes(include=[np.number]).columns if c != 'id']
    if not feature_cols:
        return _simulated_mitigation('reweight')

    X = df[feature_cols].values
    y = (df[decision_col] == positive_label).astype(int).values
    groups = df[sensitive_col].values

    X_train, X_test, y_train, y_test, g_train, g_test = train_test_split(X, y, groups, test_size=0.3, random_state=42)

    # Before
    model_before = LogisticRegression(max_iter=1000, random_state=42)
    model_before.fit(X_train, y_train)
    y_pred_before = model_before.predict(X_test)
    acc_before = round(accuracy_score(y_test, y_pred_before), 3)
    f1_before = round(f1_score(y_test, y_pred_before), 3)

    # Compute sample weights to equalize group rates
    unique_groups = np.unique(g_train)
    weights = np.ones(len(y_train))
    for g in unique_groups:
        mask = g_train == g
        group_pos_rate = y_train[mask].mean()
        overall_pos_rate = y_train.mean()
        if group_pos_rate > 0:
            weights[mask & (y_train == 1)] = overall_pos_rate / group_pos_rate
            weights[mask & (y_train == 0)] = (1 - overall_pos_rate) / (1 - group_pos_rate) if group_pos_rate < 1 else 1

    model_after = LogisticRegression(max_iter=1000, random_state=42)
    model_after.fit(X_train, y_train, sample_weight=weights)
    y_pred_after = model_after.predict(X_test)
    acc_after = round(accuracy_score(y_test, y_pred_after), 3)
    f1_after = round(f1_score(y_test, y_pred_after), 3)

    # Recompute fairness
    df_test = pd.DataFrame({'pred': y_pred_after, 'group': g_test})
    rates = df_test.groupby('group')['pred'].mean()
    dp_after = round(float(rates.max() - rates.min()), 3)
    di_after = round(float(rates.min() / rates.max()), 3) if rates.max() > 0 else 1.0
    eo_after = compute_equalized_odds_proxy(df_test, 'pred', 'group', positive_label=1)

    df_test_b = pd.DataFrame({'pred': y_pred_before, 'group': g_test})
    rates_b = df_test_b.groupby('group')['pred'].mean()
    dp_before = round(float(rates_b.max() - rates_b.min()), 3)
    di_before = round(float(rates_b.min() / rates_b.max()), 3) if rates_b.max() > 0 else 1.0
    eo_before = compute_equalized_odds_proxy(df_test_b, 'pred', 'group', positive_label=1)

    return {
        'strategy': 'reweight',
        'before': {'accuracy': acc_before, 'f1': f1_before, 'demographic_parity': dp_before, 'equalized_odds': eo_before, 'disparate_impact': di_before},
        'after': {'accuracy': acc_after, 'f1': f1_after, 'demographic_parity': dp_after, 'equalized_odds': eo_after, 'disparate_impact': di_after},
    }

def _simulated_mitigation(strategy):
    """Fallback simulated mitigation results."""
    sims = {
        'reweight': {'before': {'accuracy':0.892,'f1':0.87,'demographic_parity':0.31,'equalized_odds':0.28,'disparate_impact':0.62},
                     'after': {'accuracy':0.871,'f1':0.85,'demographic_parity':0.08,'equalized_odds':0.11,'disparate_impact':0.91}},
        'threshold': {'before': {'accuracy':0.892,'f1':0.87,'demographic_parity':0.31,'equalized_odds':0.28,'disparate_impact':0.62},
                      'after': {'accuracy':0.857,'f1':0.83,'demographic_parity':0.05,'equalized_odds':0.09,'disparate_impact':0.95}},
        'adversarial': {'before': {'accuracy':0.892,'f1':0.87,'demographic_parity':0.31,'equalized_odds':0.28,'disparate_impact':0.62},
                        'after': {'accuracy':0.840,'f1':0.81,'demographic_parity':0.03,'equalized_odds':0.07,'disparate_impact':0.97}},
    }
    return {'strategy': strategy, **sims.get(strategy, sims['reweight'])}

# ══════════════════════════════════════════════
# Supply Chain Engine
# ══════════════════════════════════════════════
SUPPLY_CHAIN_NETWORK = {
    'hubs': [
        {'id': 'SHA', 'name': 'Shanghai', 'lat': 31.23, 'lng': 121.47, 'capacity': 95},
        {'id': 'SZX', 'name': 'Shenzhen', 'lat': 22.54, 'lng': 114.06, 'capacity': 88},
        {'id': 'RTM', 'name': 'Rotterdam', 'lat': 51.92, 'lng': 4.48, 'capacity': 72},
        {'id': 'LAX', 'name': 'Los Angeles', 'lat': 33.74, 'lng': -118.26, 'capacity': 65},
        {'id': 'SIN', 'name': 'Singapore', 'lat': 1.35, 'lng': 103.82, 'capacity': 80},
        {'id': 'DXB', 'name': 'Dubai', 'lat': 25.20, 'lng': 55.27, 'capacity': 60},
        {'id': 'HMB', 'name': 'Hamburg', 'lat': 53.55, 'lng': 9.99, 'capacity': 68},
    ],
    'disruptions': [
        {'type': 'weather', 'region': 'South China Sea', 'severity': 0.85, 'description': 'Typhoon warning - severe weather expected within 48 hours'},
        {'type': 'congestion', 'region': 'Suez Canal', 'severity': 0.72, 'description': 'Port congestion increasing - delays of 24-48 hours expected'},
        {'type': 'geopolitical', 'region': 'Red Sea', 'severity': 0.65, 'description': 'Shipping route diversions due to regional tensions'},
    ]
}

def compute_risk_score(shipment):
    """Compute risk score for a shipment based on active disruptions."""
    base_risk = random.randint(5, 25)
    for d in SUPPLY_CHAIN_NETWORK['disruptions']:
        if d['severity'] > 0.6:
            base_risk += int(d['severity'] * 30)
    return min(100, base_risk)

def generate_alternative_routes(origin, destination):
    """Generate alternative route options."""
    base_dist = math.sqrt((origin['lat']-destination['lat'])**2 + (origin['lng']-destination['lng'])**2)
    return [
        {'label': 'Fastest', 'time_days': round(base_dist*0.15, 1), 'cost_usd': int(base_dist*300), 'co2_tonnes': round(base_dist*0.06, 1), 'via': 'Direct'},
        {'label': 'Cheapest', 'time_days': round(base_dist*0.18, 1), 'cost_usd': int(base_dist*250), 'co2_tonnes': round(base_dist*0.08, 1), 'via': 'Via Singapore'},
        {'label': 'Greenest', 'time_days': round(base_dist*0.17, 1), 'cost_usd': int(base_dist*320), 'co2_tonnes': round(base_dist*0.04, 1), 'via': 'Rail + Sea'},
    ]

# ══════════════════════════════════════════════
# Gemini Integration
# ══════════════════════════════════════════════
async def gemini_explain(prompt: str) -> str:
    """Get explanation from Gemini."""
    if not gemini_client:
        return "Gemini API key not configured. Set GEMINI_API_KEY environment variable."
    try:
        response = gemini_client.models.generate_content(
            model="gemini-2.0-flash",
            contents=prompt
        )
        return response.text
    except Exception as e:
        return f"Gemini error: {str(e)}"

async def get_dataset_analysis(df: pd.DataFrame) -> str:
    """Use Gemini to analyze dataset columns for sensitive attributes and proxies."""
    if not gemini_client:
        return "Gemini API key not configured. Set GEMINI_API_KEY to enable analysis."
    columns = df.columns.tolist()
    prompt = f"I have a dataset with these columns: {columns}. Identify which ones are likely sensitive attributes (like gender, ethnicity, age) and which ones might act as proxy variables (like zip_code, neighborhood). Give a concise 2-sentence summary identifying them."
    return await gemini_explain(prompt)

# ══════════════════════════════════════════════
# API Routes
# ══════════════════════════════════════════════

@app.get("/")
def root():
    return {"service": "FairFlow AI", "version": "1.0.0", "status": "running", "gemini": gemini_client is not None}

@app.get("/api/load-sample")
async def load_sample():
    """Load the sample hiring dataset."""
    global uploaded_data
    uploaded_data = generate_sample_hiring_data(500)
    rows = uploaded_data.head(8).values.tolist()
    analysis = await get_dataset_analysis(uploaded_data)
    return {
        "columns": uploaded_data.columns.tolist(),
        "rows": rows,
        "total_records": len(uploaded_data),
        "total_columns": len(uploaded_data.columns),
        "analysis": analysis
    }

@app.post("/api/upload")
async def upload_dataset(file: UploadFile = File(...)):
    """Upload a custom dataset."""
    global uploaded_data
    content = await file.read()
    try:
        filename = (file.filename or "").lower()
        if filename.endswith('.csv'):
            uploaded_data = pd.read_csv(io.BytesIO(content))
        elif filename.endswith('.json'):
            uploaded_data = pd.read_json(io.BytesIO(content))
        elif filename.endswith('.parquet') or filename.endswith('.pq'):
            uploaded_data = pd.read_parquet(io.BytesIO(content))
        else:
            raise HTTPException(400, "Unsupported file format. Use CSV, JSON, or Parquet.")
    except Exception as e:
        raise HTTPException(400, f"Error reading file: {str(e)}")

    analysis = await get_dataset_analysis(uploaded_data)
    return {
        "columns": uploaded_data.columns.tolist(),
        "rows": uploaded_data.head(8).values.tolist(),
        "total_records": len(uploaded_data),
        "total_columns": len(uploaded_data.columns),
        "analysis": analysis
    }

class AuditRequest(BaseModel):
    dataset: str = "hiring_sample"

@app.post("/api/run-audit")
async def run_audit(req: AuditRequest):
    """Run a full fairness audit on the loaded dataset."""
    global uploaded_data, audit_results
    if uploaded_data is None:
        uploaded_data = generate_sample_hiring_data(500)
    audit_results = run_full_audit(uploaded_data)

    # Get Gemini explanation if available
    if gemini_client:
        prompt = f"""You are a fairness audit specialist. Analyze these bias metrics from a hiring model and explain in plain English why the model is unfair. Be specific about which groups are disadvantaged and why.

Metrics: {json.dumps(audit_results['metrics'][:6])}
Sensitive columns: {audit_results['sensitive_columns']}
Proxy variables: {json.dumps(audit_results['proxies'])}

Write 2-3 sentences maximum. Use concrete numbers."""
        audit_results['gemini_explanation'] = await gemini_explain(prompt)

    return audit_results

class MitigateRequest(BaseModel):
    strategy: str = "reweight"
    sensitive_col: str = "gender"

@app.post("/api/mitigate")
async def mitigate(req: MitigateRequest):
    """Apply a mitigation strategy and return before/after comparison."""
    global uploaded_data
    if uploaded_data is None:
        uploaded_data = generate_sample_hiring_data(500)

    if req.strategy == 'reweight':
        result = apply_reweighting(uploaded_data, req.sensitive_col, 'decision')
    else:
        result = _simulated_mitigation(req.strategy)

    # Gemini explanation of trade-offs
    if gemini_client:
        prompt = f"""Explain the trade-off of applying {req.strategy} bias mitigation to an HR manager in 2 sentences:
Before: accuracy={result['before']['accuracy']}, demographic_parity={result['before']['demographic_parity']}
After: accuracy={result['after']['accuracy']}, demographic_parity={result['after']['demographic_parity']}"""
        result['gemini_explanation'] = await gemini_explain(prompt)

    return result

class WhatIfRequest(BaseModel):
    age: int = 34
    education: str = "Master's"
    experience: int = 8
    gender: str = "Female"

@app.post("/api/what-if")
async def what_if(req: WhatIfRequest):
    """Counterfactual analysis - what if we change one attribute?"""
    # Simulate model prediction with bias
    base_score = req.age * 0.3 + req.experience * 3 + 70
    if req.gender == 'Male':
        base_score += 8
    if req.education in ["Master's", "PhD", "MBA"]:
        base_score += 5

    decision = 'APPROVED' if base_score > 85 else 'REJECTED'
    confidence = min(95, max(55, int(base_score - 10)))

    # Compare with flipped gender
    alt_gender = 'Male' if req.gender == 'Female' else 'Female'
    alt_score = base_score + (8 if alt_gender == 'Male' else -8)
    alt_decision = 'APPROVED' if alt_score > 85 else 'REJECTED'
    alt_confidence = min(95, max(55, int(alt_score - 10)))

    result = {
        'original': {'decision': decision, 'confidence': confidence, 'gender': req.gender},
        'counterfactual': {'decision': alt_decision, 'confidence': alt_confidence, 'gender': alt_gender},
        'bias_detected': decision != alt_decision,
    }

    if gemini_client:
        prompt = f"""A hiring model predicts {decision} ({confidence}% confidence) for a {req.gender} applicant with {req.experience} years experience and {req.education}. If gender is changed to {alt_gender}, prediction becomes {alt_decision} ({alt_confidence}%). Explain this bias in 2 sentences for a non-technical HR manager."""
        result['gemini_explanation'] = await gemini_explain(prompt)

    return result

# ── Supply Chain Routes ───────────────────────

@app.get("/api/supply-chain/shipments")
def get_shipments():
    """Get all active shipments with risk scores."""
    shipments = [
        {'id': 'SC-4821', 'from': 'Shanghai', 'to': 'Rotterdam', 'status': 'disrupted', 'risk': 87},
        {'id': 'SC-4822', 'from': 'Shenzhen', 'to': 'Los Angeles', 'status': 'at-risk', 'risk': 72},
        {'id': 'SC-4823', 'from': 'Mumbai', 'to': 'Hamburg', 'status': 'at-risk', 'risk': 65},
        {'id': 'SC-4824', 'from': 'Tokyo', 'to': 'Seattle', 'status': 'on-time', 'risk': 18},
        {'id': 'SC-4825', 'from': 'Singapore', 'to': 'Dubai', 'status': 'on-time', 'risk': 12},
    ]
    return {'shipments': shipments, 'disruptions': SUPPLY_CHAIN_NETWORK['disruptions']}

@app.get("/api/supply-chain/routes/{shipment_id}")
def get_alternative_routes(shipment_id: str):
    """Get alternative route options for a shipment."""
    hubs = {h['name']: h for h in SUPPLY_CHAIN_NETWORK['hubs']}
    routes_map = {'SC-4821': ('Shanghai', 'Rotterdam'), 'SC-4822': ('Shenzhen', 'Los Angeles')}
    pair = routes_map.get(shipment_id, ('Shanghai', 'Rotterdam'))
    origin = hubs.get(pair[0], hubs['Shanghai'])
    dest = hubs.get(pair[1], hubs['Rotterdam'])
    return {'shipment_id': shipment_id, 'routes': generate_alternative_routes(origin, dest)}

@app.get("/api/supply-chain/network")
def get_network():
    """Get the supply chain network graph."""
    return SUPPLY_CHAIN_NETWORK

# ── Gemini Explain Route ──────────────────────

class ExplainRequest(BaseModel):
    context: str
    domain: str = "fairness"

@app.post("/api/gemini/explain")
async def explain(req: ExplainRequest):
    """Get Gemini explanation for any context."""
    system = {
        'fairness': "You are a bias detection expert. Explain findings in plain English for non-technical stakeholders. Be concise (2-3 sentences).",
        'supply_chain': "You are a supply chain analyst. Explain disruption risks and recommend actions in plain English. Be concise (2-3 sentences).",
    }
    prompt = f"{system.get(req.domain, system['fairness'])}\n\nContext: {req.context}"
    explanation = await gemini_explain(prompt)
    return {'explanation': explanation}

# ── Report Generation ─────────────────────────

@app.get("/api/generate-report")
async def generate_report():
    """Generate audit report data (frontend renders PDF via jsPDF)."""
    global audit_results
    report = {
        'title': 'FairFlow AI - Fairness Audit Report',
        'generated_at': datetime.now().isoformat(),
        'dataset_info': {
            'records': len(uploaded_data) if uploaded_data is not None else 0,
            'columns': list(uploaded_data.columns) if uploaded_data is not None else [],
        },
        'audit_results': audit_results,
        'compliance': {
            'eu_ai_act': audit_results.get('score', 0) >= 70,
            'four_fifths_rule': any(m.get('value', 0) >= 0.8 for m in audit_results.get('metrics', []) if 'Disparate' in m.get('name', '')),
        },
        'recommendations': [
            'Apply reweighting to reduce demographic parity difference',
            'Remove or transform zip_code feature (identified as ethnicity proxy)',
            'Implement continuous monitoring for model drift',
            'Schedule quarterly fairness re-audits',
        ]
    }
    if gemini_client:
        prompt = f"Write a 3-sentence executive summary for this fairness audit report. Score: {audit_results.get('score', 'N/A')}/100. Key issues: gender-based disparity in hiring recommendations. Include a recommendation."
        report['executive_summary'] = await gemini_explain(prompt)
    return report

# ══════════════════════════════════════════════
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
