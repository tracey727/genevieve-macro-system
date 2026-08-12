'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';

type Matter = {
  matter_id: string;
  entity_id: string;
  entity_name?: string;
  title: string;
  description?: string | null;
  category: string;
  status: string;
  accountable_owner_id: string;
  escalation_deadline: string;
  funding_stream?: string | null;
  total_cost?: string | number;
  evidence_count?: number;
  verified_evidence_count?: number;
  updated_at?: string;
};

type Entity = {
  entity_id: string;
  name: string;
  state_jurisdiction: string;
  legacy_ancestry_ids?: string | null;
  is_active: boolean;
};

type MatterDetail = {
  matter: Matter;
  costs: Array<Record<string, unknown>>;
  evidence: Array<Record<string, unknown>>;
  audit: Array<Record<string, unknown>>;
};

type DashboardData = {
  summary: Record<string, number>;
  costs: { total_cost: string | number; cost_entries: number };
  evidence: { total_evidence: number; verified_evidence: number };
  recent: Matter[];
};

type View = 'dashboard' | 'matters' | 'new' | 'audit' | 'tools';

const currency = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' });
const dateTime = new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium', timeStyle: 'short' });

function statusClass(status: string) {
  if (status === 'CLOSED') return 'status status-closed';
  if (status === 'REOPENED_FOR_HUMAN_REVIEW') return 'status status-reopened';
  if (status === 'ELEVATED') return 'status status-elevated';
  return 'status status-open';
}

export default function DashboardApp() {
  const [view, setView] = useState<View>('dashboard');
  const [accessKey, setAccessKey] = useState('');
  const [operator, setOperator] = useState('GENEVIEVE_ADMIN');
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [matters, setMatters] = useState<Matter[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [audit, setAudit] = useState<Array<Record<string, unknown>>>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<MatterDetail | null>(null);
  const [authRequired, setAuthRequired] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setAccessKey(sessionStorage.getItem('genevieve_access_key') || '');
    setOperator(sessionStorage.getItem('genevieve_operator') || 'GENEVIEVE_ADMIN');
  }, []);

  const request = useCallback(async (url: string, options: RequestInit = {}) => {
    const requestHeaders = new Headers(options.headers);
    if (!requestHeaders.has('Content-Type')) requestHeaders.set('Content-Type', 'application/json');
    if (accessKey) requestHeaders.set('x-genevieve-key', accessKey);
    const response = await fetch(url, { ...options, headers: requestHeaders, cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
      setAuthRequired(true);
      throw new Error('Access key required.');
    }
    if (!response.ok) throw new Error(data.error || data.message || 'Request failed.');
    setAuthRequired(false);
    return data;
  }, [accessKey]);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const [d, m, e] = await Promise.all([request('/api/dashboard'), request('/api/matters'), request('/api/entities')]);
      setDashboard(d);
      setMatters(m.matters || []);
      setEntities(e.entities || []);
      if (selectedId) {
        const x = await request(`/api/matters/${encodeURIComponent(selectedId)}`);
        setDetail(x);
      }
      setMessage('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load data.');
    } finally {
      setLoading(false);
    }
  }, [request, selectedId]);

  useEffect(() => { refresh(); }, [refresh]);

  async function loadAudit() {
    try {
      setLoading(true);
      const data = await request('/api/audit');
      setAudit(data.audit || []);
      setView('audit');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load audit log.');
    } finally {
      setLoading(false);
    }
  }

  async function openMatter(id: string) {
    try {
      setLoading(true);
      setSelectedId(id);
      const data = await request(`/api/matters/${encodeURIComponent(id)}`);
      setDetail(data);
      setView('matters');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to open matter.');
    } finally {
      setLoading(false);
    }
  }

  function saveAccess(e: FormEvent) {
    e.preventDefault();
    sessionStorage.setItem('genevieve_access_key', accessKey);
    sessionStorage.setItem('genevieve_operator', operator);
    setAuthRequired(false);
    setTimeout(refresh, 0);
  }

  async function createMatter(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      setLoading(true);
      const data = await request('/api/matters', {
        method: 'POST',
        body: JSON.stringify({
          title: fd.get('title'),
          entity_id: fd.get('entity_id'),
          description: fd.get('description'),
          category: fd.get('category'),
          owner: fd.get('owner'),
          funding_stream: fd.get('funding_stream'),
          escalation_deadline: new Date(String(fd.get('deadline'))).toISOString(),
          operator
        })
      });
      setMessage(`Created ${data.matter.matter_id}.`);
      e.currentTarget.reset();
      await refresh();
      await openMatter(data.matter.matter_id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to create matter.');
    } finally {
      setLoading(false);
    }
  }

  async function addCost(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedId) return;
    const fd = new FormData(e.currentTarget);
    try {
      await request(`/api/matters/${encodeURIComponent(selectedId)}/costs`, {
        method: 'POST',
        body: JSON.stringify({
          expense_type: fd.get('expense_type'),
          supplier: fd.get('supplier'),
          hourly_rate: fd.get('hourly_rate'),
          hours: fd.get('hours'),
          direct_cost: fd.get('direct_cost'),
          is_clawback_eligible: fd.get('is_clawback_eligible') === 'on',
          operator
        })
      });
      e.currentTarget.reset();
      setMessage('Cost recorded and audit event written.');
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to record cost.');
    }
  }

  async function addEvidence(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedId) return;
    const fd = new FormData(e.currentTarget);
    try {
      await request(`/api/matters/${encodeURIComponent(selectedId)}/evidence`, {
        method: 'POST',
        body: JSON.stringify({
          document_type: fd.get('document_type'),
          file_checksum: fd.get('file_checksum'),
          source_author: fd.get('source_author'),
          verified: fd.get('verified') === 'on',
          operator
        })
      });
      e.currentTarget.reset();
      setMessage('Evidence metadata recorded.');
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to record evidence.');
    }
  }

  async function verifyEvidence(evidenceId: string) {
    if (!selectedId) return;
    try {
      const data = await request(`/api/matters/${encodeURIComponent(selectedId)}/evidence/${encodeURIComponent(evidenceId)}/verify`, {
        method: 'POST', body: JSON.stringify({ operator })
      });
      setMessage(data.message);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to verify evidence.');
    }
  }

  async function closeMatter() {
    if (!selectedId) return;
    try {
      const data = await request(`/api/matters/${encodeURIComponent(selectedId)}/close`, {
        method: 'POST', body: JSON.stringify({ operator })
      });
      setMessage(data.message);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Closure blocked.');
    }
  }

  async function reopenMatter() {
    if (!selectedId) return;
    const reason = window.prompt('Reason for recurrence/anomaly reopening:', 'Recurring operational pattern detected');
    if (reason === null) return;
    try {
      const data = await request(`/api/matters/${encodeURIComponent(selectedId)}/reopen`, {
        method: 'POST', body: JSON.stringify({ operator, reason })
      });
      setMessage(data.message);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to reopen matter.');
    }
  }

  if (authRequired) {
    return (
      <main className="login-shell">
        <section className="login-card">
          <div className="brand-kicker">GENEVIEVE</div>
          <h1>Protected Command Workspace</h1>
          <p>Enter the same <code>APP_ADMIN_KEY</code> you configured in Vercel. It is stored only in this browser session.</p>
          <form onSubmit={saveAccess} className="stack-form">
            <label>Operator ID<input value={operator} onChange={e => setOperator(e.target.value)} required /></label>
            <label>Access key<input type="password" value={accessKey} onChange={e => setAccessKey(e.target.value)} required autoFocus /></label>
            <button className="primary" type="submit">Open workspace</button>
          </form>
          <p className="small-note">If no APP_ADMIN_KEY is configured, the app runs in setup/demo mode. Do not use setup mode for real organisational information.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-kicker">GENEVIEVE</div>
          <div className="brand-title">Pattern, Waste & Prevention Command</div>
          <div className="brand-sub">Human-governed operational intelligence</div>
        </div>
        <nav>
          <NavButton active={view === 'dashboard'} onClick={() => setView('dashboard')}>Command overview</NavButton>
          <NavButton active={view === 'matters'} onClick={() => setView('matters')}>Operational matters</NavButton>
          <NavButton active={view === 'new'} onClick={() => setView('new')}>Create matter</NavButton>
          <NavButton active={view === 'tools'} onClick={() => setView('tools')}>Prevention tools</NavButton>
          <NavButton active={view === 'audit'} onClick={loadAudit}>Audit timeline</NavButton>
        </nav>
        <div className="sidebar-bottom">
          <label>Operator ID<input value={operator} onChange={e => { setOperator(e.target.value); sessionStorage.setItem('genevieve_operator', e.target.value); }} /></label>
          <button className="ghost" onClick={refresh}>Refresh data</button>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <div className="eyebrow">Unified Macro-System · Australian Public & Private Health Foundation</div>
            <h1>{viewTitle(view)}</h1>
          </div>
          <div className="human-gate">HUMAN DECISION GATE ACTIVE</div>
        </header>

        {message && <div className="notice">{message}</div>}
        {loading && <div className="loading-line">Updating workspace…</div>}

        {view === 'dashboard' && <Dashboard dashboard={dashboard} onOpen={openMatter} />}
        {view === 'new' && <NewMatterForm onSubmit={createMatter} entities={entities} />}
        {view === 'matters' && (
          <MattersView matters={matters} selectedId={selectedId} detail={detail} onOpen={openMatter}
            onAddCost={addCost} onAddEvidence={addEvidence} onVerifyEvidence={verifyEvidence} onClose={closeMatter} onReopen={reopenMatter} />
        )}
        {view === 'audit' && <AuditView rows={audit} />}
        {view === 'tools' && <ToolsView request={request} matters={matters} entities={entities} operator={operator} onChanged={refresh} />}
      </section>
    </main>
  );
}

function NavButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button className={active ? 'nav-button active' : 'nav-button'} onClick={onClick}>{children}</button>;
}

function viewTitle(view: View) {
  return ({ dashboard: 'Command overview', matters: 'Operational matters', new: 'Create operational matter', audit: 'Append-only audit timeline', tools: 'Prevention & analysis tools' })[view];
}

function Dashboard({ dashboard, onOpen }: { dashboard: DashboardData | null; onOpen: (id: string) => void }) {
  if (!dashboard) return <Empty text="Connect the database and run database/schema.sql to activate the command centre." />;
  const s = dashboard.summary || {};
  return <>
    <div className="metric-grid">
      <Metric label="Active matters" value={(s.open_matters || 0) + (s.reopened_matters || 0)} detail={`${s.total_matters || 0} total`} />
      <Metric label="Overdue escalation" value={s.overdue_matters || 0} detail="Open matters past deadline" alert={(s.overdue_matters || 0) > 0} />
      <Metric label="Recorded expenditure" value={currency.format(Number(dashboard.costs?.total_cost || 0))} detail={`${dashboard.costs?.cost_entries || 0} ledger entries`} />
      <Metric label="Verified evidence" value={`${dashboard.evidence?.verified_evidence || 0}/${dashboard.evidence?.total_evidence || 0}`} detail="Human verification status" />
    </div>
    <section className="panel">
      <div className="panel-heading"><div><span className="eyebrow">LIVE WORK</span><h2>Recent matters</h2></div></div>
      <MatterTable matters={dashboard.recent || []} onOpen={onOpen} />
    </section>
    <div className="two-col">
      <section className="panel emphasis">
        <span className="eyebrow">CONTROL PRINCIPLE</span>
        <h2>AI may identify patterns. Humans decide.</h2>
        <p>Advisory outputs cannot close a matter, approve expenditure, determine employment outcomes or replace authorised clinical/procurement review.</p>
      </section>
      <section className="panel">
        <span className="eyebrow">CLOSURE RULE</span>
        <h2>No verified evidence, no closure.</h2>
        <p>The database closure function refuses to close a matter unless at least one evidence record exists and every attached evidence record is marked as human-verified.</p>
      </section>
    </div>
  </>;
}

function Metric({ label, value, detail, alert }: { label: string; value: string | number; detail: string; alert?: boolean }) {
  return <div className={alert ? 'metric-card alert-card' : 'metric-card'}><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>;
}

function NewMatterForm({ onSubmit, entities }: { onSubmit: (e: FormEvent<HTMLFormElement>) => void; entities: Entity[] }) {
  const d = new Date(Date.now() + 7 * 86400000);
  const offset = d.getTimezoneOffset() * 60000;
  const defaultDeadline = new Date(d.getTime() - offset).toISOString().slice(0, 16);
  return <section className="panel form-panel">
    <span className="eyebrow">SINGLE MATTER REPOSITORY</span>
    <h2>Open a new operational matter</h2>
    <form onSubmit={onSubmit} className="form-grid">
      <label className="wide">Matter title<input name="title" placeholder="e.g. Repeated billing rework" required /></label>
      <label>Entity<select name="entity_id" defaultValue={entities[0]?.entity_id || 'GENEVIEVE-DEMO'} required>{entities.map(e => <option key={e.entity_id} value={e.entity_id}>{e.name} — {e.state_jurisdiction}</option>)}</select></label>
      <label>Category<input name="category" placeholder="Clinical Admin Leakage" required /></label>
      <label>Accountable owner<input name="owner" placeholder="Practice_Manager_Admin" required /></label>
      <label>Funding stream<input name="funding_stream" placeholder="Medicare_MBS / NDIS / Internal" /></label>
      <label>Escalation deadline<input name="deadline" type="datetime-local" defaultValue={defaultDeadline} required /></label>
      <label className="wide">Description<textarea name="description" rows={5} placeholder="Describe the operational issue without unnecessary personal or clinical information." /></label>
      <div className="wide action-row"><button type="submit" className="primary">Create matter</button></div>
    </form>
  </section>;
}

function MatterTable({ matters, onOpen }: { matters: Matter[]; onOpen: (id: string) => void }) {
  if (!matters.length) return <Empty text="No matters recorded yet." />;
  return <div className="table-wrap"><table><thead><tr><th>Matter</th><th>Category</th><th>Status</th><th>Owner</th><th>Cost</th><th></th></tr></thead><tbody>
    {matters.map(m => <tr key={m.matter_id}>
      <td><strong>{m.title}</strong><small>{m.matter_id}</small></td>
      <td>{m.category}</td><td><span className={statusClass(m.status)}>{m.status.replaceAll('_', ' ')}</span></td>
      <td>{m.accountable_owner_id}</td><td>{currency.format(Number(m.total_cost || 0))}</td>
      <td><button className="small-button" onClick={() => onOpen(m.matter_id)}>Open</button></td>
    </tr>)}
  </tbody></table></div>;
}

function MattersView(props: {
  matters: Matter[]; selectedId: string | null; detail: MatterDetail | null; onOpen: (id: string) => void;
  onAddCost: (e: FormEvent<HTMLFormElement>) => void; onAddEvidence: (e: FormEvent<HTMLFormElement>) => void;
  onVerifyEvidence: (evidenceId: string) => void; onClose: () => void; onReopen: () => void;
}) {
  return <>
    <section className="panel"><div className="panel-heading"><div><span className="eyebrow">ALL MATTERS</span><h2>Work queue</h2></div></div><MatterTable matters={props.matters} onOpen={props.onOpen} /></section>
    {props.selectedId && props.detail && <MatterDetailView {...props} detail={props.detail} />}
  </>;
}

function MatterDetailView({ detail, onAddCost, onAddEvidence, onVerifyEvidence, onClose, onReopen }: {
  detail: MatterDetail; onAddCost: (e: FormEvent<HTMLFormElement>) => void; onAddEvidence: (e: FormEvent<HTMLFormElement>) => void; onVerifyEvidence: (evidenceId: string) => void; onClose: () => void; onReopen: () => void;
}) {
  const m = detail.matter;
  return <section className="panel detail-panel">
    <div className="detail-header"><div><span className="eyebrow">{m.matter_id}</span><h2>{m.title}</h2><p>{m.description || 'No description supplied.'}</p></div><span className={statusClass(m.status)}>{m.status.replaceAll('_', ' ')}</span></div>
    <div className="detail-meta">
      <div><span>Entity</span><strong>{m.entity_name || m.entity_id}</strong></div><div><span>Owner</span><strong>{m.accountable_owner_id}</strong></div>
      <div><span>Deadline</span><strong>{dateTime.format(new Date(m.escalation_deadline))}</strong></div><div><span>Total recorded cost</span><strong>{currency.format(Number(m.total_cost || 0))}</strong></div>
    </div>
    <div className="gate-strip"><div><strong>Human closure gate</strong><span>Requires ≥1 evidence record and 100% human verification.</span></div><div className="action-row"><button className="primary" onClick={onClose}>Attempt verified closure</button><button className="danger-outline" onClick={onReopen}>Trigger recurrence review</button></div></div>

    <div className="two-col align-start">
      <section className="subpanel"><h3>Record cost</h3><form onSubmit={onAddCost} className="stack-form">
        <label>Expense type<input name="expense_type" required placeholder="Rework_Admin" /></label>
        <label>Supplier / contractor<input name="supplier" /></label>
        <div className="mini-grid"><label>Hourly rate<input name="hourly_rate" type="number" min="0" step="0.01" /></label><label>Hours<input name="hours" type="number" min="0" step="0.01" /></label></div>
        <label>Direct cost (AUD)<input name="direct_cost" type="number" min="0" step="0.01" required /></label>
        <label className="check"><input name="is_clawback_eligible" type="checkbox" /> Potential clawback/recovery eligibility</label>
        <button className="secondary" type="submit">Add cost entry</button>
      </form></section>
      <section className="subpanel"><h3>Record evidence metadata</h3><form onSubmit={onAddEvidence} className="stack-form">
        <label>Document type<input name="document_type" required placeholder="Approved review evidence" /></label>
        <label>File checksum<input name="file_checksum" required minLength={32} placeholder="SHA-256 or other strong checksum" /></label>
        <label>Source author / system<input name="source_author" required /></label>
        <label className="check"><input name="verified" type="checkbox" /> I am an authorised human and have verified this evidence</label>
        <button className="secondary" type="submit">Add evidence record</button>
      </form><p className="small-note">This foundation stores evidence metadata/checksums, not the clinical or PRODA file itself.</p></section>
    </div>

    <div className="two-col align-start">
      <section className="subpanel"><h3>Cost ledger</h3>{detail.costs.length ? <div className="compact-list">{detail.costs.map((c, i) => <div key={String(c.entry_id || i)}><span>{String(c.expense_type)}</span><strong>{currency.format(Number(c.direct_cost || 0))}</strong><small>{String(c.supplier_contractor_name || 'No supplier')} · {formatDate(c.recorded_at)}</small></div>)}</div> : <Empty text="No costs recorded." />}</section>
      <section className="subpanel"><h3>Evidence workspace</h3>{detail.evidence.length ? <div className="compact-list">{detail.evidence.map((e, i) => <div key={String(e.evidence_id || i)}><span>{String(e.document_type)}</span><strong>{Boolean(e.is_compliance_verified) ? 'Verified' : 'Not verified'}</strong><small>{String(e.evidence_id)} · {String(e.source_author)}</small>{!Boolean(e.is_compliance_verified) && <button className="verify-button" onClick={() => onVerifyEvidence(String(e.evidence_id))}>Verify as authorised human</button>}</div>)}</div> : <Empty text="No evidence recorded." />}</section>
    </div>
  </section>;
}

function AuditView({ rows }: { rows: Array<Record<string, unknown>> }) {
  return <section className="panel"><span className="eyebrow">DATABASE-ENFORCED APPEND ONLY</span><h2>Audit timeline</h2>
    {!rows.length ? <Empty text="No audit events recorded." /> : <div className="timeline">{rows.map((r, i) => <div className="timeline-item" key={String(r.audit_id || i)}><div className="timeline-dot"/><div><strong>{String(r.action_performed)}</strong><span>{String(r.matter_id || 'SYSTEM')} · {String(r.operator_id)}</span><small>{formatDate(r.occurred_at)}</small></div></div>)}</div>}
  </section>;
}

function ToolsView({ request, matters, entities, operator, onChanged }: { request: (url: string, options?: RequestInit) => Promise<any>; matters: Matter[]; entities: Entity[]; operator: string; onChanged: () => Promise<void> }) {
  const [dupResult, setDupResult] = useState('');
  const [advisory, setAdvisory] = useState('');
  const [inaction, setInaction] = useState<Record<string, number> | null>(null);
  const [matterId, setMatterId] = useState(matters[0]?.matter_id || '');
  const [entityResult, setEntityResult] = useState('');

  async function checkDuplication(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const fd = new FormData(e.currentTarget);
    try { const d = await request('/api/duplication', { method: 'POST', body: JSON.stringify({ system_name: fd.get('system_name'), operator }) }); setDupResult(d.message); }
    catch (error) { setDupResult(error instanceof Error ? error.message : 'Check failed.'); }
  }
  async function getAdvisory(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const fd = new FormData(e.currentTarget); const category = String(fd.get('category') || '');
    if (!matterId) return setAdvisory('Choose a matter first.');
    try { const d = await request(`/api/matters/${encodeURIComponent(matterId)}/advisory${category ? `?category=${encodeURIComponent(category)}` : ''}`); setAdvisory(d.statement); }
    catch (error) { setAdvisory(error instanceof Error ? error.message : 'Advisory failed.'); }
  }
  async function calculateInaction(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const fd = new FormData(e.currentTarget);
    if (!matterId) return;
    try { const d = await request(`/api/matters/${encodeURIComponent(matterId)}/inaction`, { method: 'POST', body: JSON.stringify({ daily_recurrence_rate: fd.get('daily_rate'), delay_days: Number(fd.get('delay_days')) }) }); setInaction(d); }
    catch { setInaction(null); }
  }
  async function createEntity(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const fd = new FormData(e.currentTarget);
    try {
      const d = await request('/api/entities', { method: 'POST', body: JSON.stringify({ name: fd.get('name'), state_jurisdiction: fd.get('state'), legacy_ancestry_ids: fd.get('ancestry'), operator }) });
      setEntityResult(`Created ${d.entity.name} (${d.entity.entity_id}).`);
      e.currentTarget.reset();
      await onChanged();
    } catch (error) { setEntityResult(error instanceof Error ? error.message : 'Entity creation failed.'); }
  }
  return <div className="tool-grid">
    <section className="panel"><span className="eyebrow">PROCUREMENT SIGNAL</span><h2>Duplication cross-check</h2><p>Checks for an exact active match in the shared asset registry. A match is a review trigger, never an automatic procurement decision.</p><form onSubmit={checkDuplication} className="stack-form"><label>System / asset code<input name="system_name" placeholder="sms_gateway_v2_enterprise" required /></label><button className="secondary">Check registry</button></form>{dupResult && <div className="result-box">{dupResult}</div>}</section>
    <section className="panel"><span className="eyebrow">ADVISORY ONLY</span><h2>GENEVIEVE Business AI Analyst</h2><MatterSelect matters={matters} value={matterId} onChange={setMatterId} /><form onSubmit={getAdvisory} className="stack-form"><label>Optional expense category<input name="category" placeholder="Leave blank for all costs" /></label><button className="secondary">Generate advisory statement</button></form>{advisory && <div className="result-box advisory">{advisory}</div>}</section>
    <section className="panel"><span className="eyebrow">FINANCIAL EXPOSURE</span><h2>Cost of inaction</h2><MatterSelect matters={matters} value={matterId} onChange={setMatterId} /><form onSubmit={calculateInaction} className="stack-form"><label>Daily recurrence rate (AUD)<input name="daily_rate" type="number" min="0" step="0.01" required /></label><label>Delay days<input name="delay_days" type="number" min="0" max="3650" step="1" required /></label><button className="secondary">Calculate exposure</button></form>{inaction && <div className="result-box"><strong>{currency.format(inaction.total_risk_exposure || 0)}</strong><span>Historical: {currency.format(inaction.historical_sunk_waste || 0)} · Projected delay: {currency.format(inaction.projected_inaction_penalty_cost || 0)}</span></div>}</section>
    <section className="panel"><span className="eyebrow">STRUCTURE</span><h2>Organisational entities</h2><p>{entities.length} registered entity{entities.length === 1 ? '' : 'ies'}. Add a clinic, business unit, department or authorised operating entity here.</p><form onSubmit={createEntity} className="stack-form"><label>Entity name<input name="name" required placeholder="Hope Island Clinic" /></label><label>State / jurisdiction<input name="state" defaultValue="QLD" required maxLength={4} /></label><label>Optional legacy ancestry IDs<input name="ancestry" placeholder="Comma-separated legacy references" /></label><button className="secondary">Create entity</button></form>{entityResult && <div className="result-box">{entityResult}</div>}</section>
  </div>;
}

function MatterSelect({ matters, value, onChange }: { matters: Matter[]; value: string; onChange: (v: string) => void }) {
  return <label>Matter<select value={value} onChange={e => onChange(e.target.value)}><option value="">Select a matter</option>{matters.map(m => <option key={m.matter_id} value={m.matter_id}>{m.matter_id} — {m.title}</option>)}</select></label>;
}

function Empty({ text }: { text: string }) { return <div className="empty">{text}</div>; }
function formatDate(value: unknown) { try { return dateTime.format(new Date(String(value))); } catch { return String(value || ''); } }
