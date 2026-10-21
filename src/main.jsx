import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

const AGE_RANGES = ['0-4', '5-12', '13-17', '18-64', '65+'];

function App() {
  const [code, setCode] = useState(() => localStorage.getItem('shelterCode'));
  const [shelter, setShelter] = useState(null);
  const [notice, setNotice] = useState(null);
  const [screen, setScreen] = useState(code ? 'volunteer' : 'search');

  // A remembered code is checked again, in case it was changed.
  useEffect(() => {
    if (!code || shelter) return;
    fetch('/api/shelter', { headers: { 'X-Shelter-Code': code } })
      .then(async (res) => {
        if (res.ok) setShelter((await res.json()).name);
        else if (res.status === 401) rejected();
      })
      .catch(() => setShelter("couldn't connect"));
  }, [code]);

  function remember(newCode, name) {
    localStorage.setItem('shelterCode', newCode);
    setCode(newCode);
    setShelter(name);
    setNotice(null);
  }

  function forget() {
    localStorage.removeItem('shelterCode');
    setCode(null);
    setShelter(null);
  }

  function rejected() {
    forget();
    setNotice('That Shelter Code no longer works. Enter it again.');
  }

  return (
    <main>
      <h1>Family Reunification</h1>
      <nav>
        <button type="button" aria-pressed={screen === 'search'} onClick={() => setScreen('search')}>Find someone</button>
        <button type="button" aria-pressed={screen === 'check'} onClick={() => setScreen('check')}>Check request</button>
        <button type="button" aria-pressed={screen === 'volunteer'} onClick={() => setScreen('volunteer')}>Volunteer</button>
      </nav>
      {screen === 'search' ? (
        <SearchForm />
      ) : screen === 'check' ? (
        <CheckRequestForm />
      ) : !code ? (
        <>
          {notice && <p role="alert">{notice}</p>}
          <ShelterCodeForm onSet={remember} />
        </>
      ) : (
        <>
          <p>
            Shelter: {shelter ?? '…'}{' '}
            <button type="button" onClick={forget}>Switch shelter</button>
          </p>
          <RegisterForm code={code} onRejected={rejected} />
          <PendingRequests code={code} onRejected={rejected} />
        </>
      )}
    </main>
  );
}

function ShelterCodeForm({ onSet }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    const entered = value.trim().toUpperCase();
    try {
      const res = await fetch('/api/shelter', { headers: { 'X-Shelter-Code': entered } });
      if (res.ok) return onSet(entered, (await res.json()).name);
      setError(res.status === 401 ? "That Shelter Code didn't work. Check it and try again." : 'Something went wrong. Try again.');
    } catch {
      setError("Couldn't connect. Try again.");
    }
  }

  return (
    <form onSubmit={submit}>
      <label>
        Shelter Code <input value={value} onChange={(e) => setValue(e.target.value)} required />
      </label>
      <button>Continue</button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}

const VISIBILITIES = [['findable', 'Findable'], ['not_findable', 'Not findable']];
const EMPTY_REGISTRANT = { known_as: '', age_range: null, description: '', visibility: null };

function ButtonGroup({ legend, options, value, onChange }) {
  return (
    <fieldset>
      <legend>{legend}</legend>
      {options.map(([option, label]) => (
        <button key={option} type="button" aria-pressed={value === option} onClick={() => onChange(option)}>
          {label}
        </button>
      ))}
    </fieldset>
  );
}

function RegisterForm({ code, onRejected }) {
  const [registrant, setRegistrant] = useState(EMPTY_REGISTRANT);
  const [status, setStatus] = useState(null);
  const setField = (field, value) => setRegistrant((r) => ({ ...r, [field]: value }));

  async function submit(e) {
    e.preventDefault();
    setStatus(null);
    try {
      const res = await fetch('/api/registrants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Shelter-Code': code },
        body: JSON.stringify(registrant),
      });
      if (res.status === 401) return onRejected();
      if (res.status === 400) return setStatus({ ok: false, text: (await res.json()).error });
      if (!res.ok) throw new Error();
      setStatus({ ok: true, text: `Saved. ${registrant.known_as.trim()} is registered.` });
      setRegistrant(EMPTY_REGISTRANT);
    } catch {
      // Keep everything typed so the Volunteer can just try again.
      setStatus({ ok: false, text: "Couldn't save. Nothing was lost. Try again." });
    }
  }

  return (
    <form onSubmit={submit}>
      <h2>Register someone</h2>
      <label>
        Name they go by{' '}
        <input value={registrant.known_as} onChange={(e) => setField('known_as', e.target.value)} required />
      </label>

      <ButtonGroup
        legend="Age (optional)"
        options={AGE_RANGES.map((range) => [range, range])}
        value={registrant.age_range}
        onChange={(range) => setField('age_range', registrant.age_range === range ? null : range)}
      />

      <label>
        Description (optional){' '}
        <textarea value={registrant.description} onChange={(e) => setField('description', e.target.value)} />
      </label>

      <ButtonGroup
        legend="Can people searching find them?"
        options={VISIBILITIES}
        value={registrant.visibility}
        onChange={(visibility) => setField('visibility', visibility)}
      />

      <button disabled={!registrant.visibility || !registrant.known_as.trim()}>Save</button>
      {status && <p role={status.ok ? 'status' : 'alert'}>{status.text}</p>}
    </form>
  );
}

function PendingRequests({ code, onRejected }) {
  const [requests, setRequests] = useState(null);
  const [error, setError] = useState(null);

  async function load() {
    setError(null);
    try {
      const res = await fetch('/api/pending-requests', { headers: { 'X-Shelter-Code': code } });
      if (res.status === 401) return onRejected();
      if (!res.ok) throw new Error();
      setRequests(await res.json());
    } catch {
      setError("Couldn't load requests. Try again.");
    }
  }

  useEffect(() => {
    load();
  }, [code]);

  return (
    <section>
      <h2>Pending requests</h2>
      <button type="button" onClick={load}>Refresh</button>
      {error && <p role="alert">{error}</p>}
      {requests?.length === 0 && <p role="status">No pending requests.</p>}
      {requests?.length > 0 && (
        <ul>
          {requests.map((r) => (
            <PendingRequest key={r.id} request={r} code={code} onRejected={onRejected} onAnswered={load} />
          ))}
        </ul>
      )}
    </section>
  );
}

function PendingRequest({ request: r, code, onRejected, onAnswered }) {
  const [replying, setReplying] = useState(false);
  const [reply, setReply] = useState({ reply_message: '', reply_contact: '' });
  const [error, setError] = useState(null);
  const setField = (field) => (e) => setReply((f) => ({ ...f, [field]: e.target.value }));

  async function send(body) {
    setError(null);
    try {
      const res = await fetch(`/api/pending-requests/${r.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Shelter-Code': code },
        body: JSON.stringify(body),
      });
      if (res.status === 401) return onRejected();
      if (res.status === 400) return setError((await res.json()).error);
      // 404: already answered elsewhere, or no longer answerable, so the reload drops it.
      if (!res.ok && res.status !== 404) throw new Error();
      onAnswered();
    } catch {
      setError("Couldn't save the answer. Try again.");
    }
  }

  return (
    <li>
      <p>
        <strong>{r.known_as}</strong>
        {r.age_range && ` (${r.age_range})`}
        {r.description && ` · ${r.description}`}
      </p>
      <p>
        From {r.seeker_name}
        {r.relationship && ` (${r.relationship})`}
        {r.seeker_contact && ` · ${r.seeker_contact}`}
      </p>
      {r.message && <blockquote>{r.message}</blockquote>}
      {r.attempts > 0 && <p>Tried {r.attempts} {r.attempts === 1 ? 'time' : 'times'}</p>}
      {replying ? (
        <form onSubmit={(e) => { e.preventDefault(); send({ answer: 'yes', ...reply }); }}>
          <label>
            Their message <textarea value={reply.reply_message} onChange={setField('reply_message')} required />
          </label>
          <label>
            Contact or meeting place (optional) <input value={reply.reply_contact} onChange={setField('reply_contact')} />
          </label>
          <button disabled={!reply.reply_message.trim()}>Send reply</button>
          <button type="button" onClick={() => setReplying(false)}>Cancel</button>
        </form>
      ) : (
        <p>
          <button type="button" onClick={() => setReplying(true)}>Yes</button>{' '}
          <button type="button" onClick={() => send({ answer: 'no' })}>No / don't know them</button>{' '}
          <button type="button" onClick={() => send({ answer: 'not_found' })}>Couldn't find them</button>
        </p>
      )}
      {error && <p role="alert">{error}</p>}
    </li>
  );
}

const SEARCH_CAP = 20;

function SearchForm() {
  const [name, setName] = useState('');
  const [ageRange, setAgeRange] = useState(null);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setError(null);
    const params = new URLSearchParams({ name: name.trim() });
    if (ageRange) params.set('age_range', ageRange);
    try {
      const res = await fetch(`/api/search?${params}`);
      if (res.status === 400 || res.status === 429) return setError((await res.json()).error);
      if (!res.ok) throw new Error();
      setResults(await res.json());
    } catch {
      setError("Couldn't search. Try again.");
    }
  }

  return (
    <>
      <form onSubmit={submit}>
        <h2>Search for someone</h2>
        <label>
          Name or nickname <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>

        <ButtonGroup
          legend="Age (optional)"
          options={AGE_RANGES.map((range) => [range, range])}
          value={ageRange}
          onChange={(range) => setAgeRange(ageRange === range ? null : range)}
        />

        <button disabled={!name.trim()}>Search</button>
        {error && <p role="alert">{error}</p>}
      </form>

      {results?.length === 0 && (
        // Same words whether nobody matched or only hidden Registrants did (ADR 0001).
        <p role="status">
          No matches found. They may not be registered yet, or may be using a different name. Try a nickname, check
          spelling, or search again later.
        </p>
      )}
      {results?.length >= SEARCH_CAP && (
        <p role="status">Showing the {SEARCH_CAP} closest matches. Add an age range or more of the name to narrow it down.</p>
      )}
      {results?.length > 0 && (
        <ul>
          {results.map((r) => (
            <li key={r.id}>
              <strong>{r.known_as}</strong>
              {r.age_range && ` (${r.age_range})`}
              {r.description && <p>{r.description}</p>}
              <ContactRequest registrantId={r.id} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

const EMPTY_REQUEST = { seeker_name: '', relationship: '', message: '', seeker_contact: '' };

function ContactRequest({ registrantId }) {
  const [open, setOpen] = useState(false);
  const [fields, setFields] = useState(EMPTY_REQUEST);
  const [requestCode, setRequestCode] = useState(null);
  const [error, setError] = useState(null);
  const setField = (field) => (e) => setFields((f) => ({ ...f, [field]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setError(null);
    try {
      const res = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registrant_id: registrantId, ...fields }),
      });
      if (res.status === 400 || res.status === 429) return setError((await res.json()).error);
      if (!res.ok) throw new Error();
      setRequestCode((await res.json()).request_code);
    } catch {
      setError("Couldn't send. Try again.");
    }
  }

  if (requestCode) {
    return (
      <div role="status">
        <p>Request sent. Your Request Code is:</p>
        <p className="request-code" data-testid="request-code">{requestCode}</p>
        <p>Write this code down. Use Check request on any device to see if they replied.</p>
      </div>
    );
  }
  if (!open) return <button type="button" onClick={() => setOpen(true)}>Send a request</button>;
  return (
    <form onSubmit={submit}>
      <label>
        Your name <input value={fields.seeker_name} onChange={setField('seeker_name')} required />
      </label>
      <label>
        How you know them (optional) <input value={fields.relationship} onChange={setField('relationship')} />
      </label>
      <label>
        Short message (optional) <textarea value={fields.message} onChange={setField('message')} />
      </label>
      <label>
        How to reach you (optional) <input value={fields.seeker_contact} onChange={setField('seeker_contact')} />
      </label>
      <button disabled={!fields.seeker_name.trim()}>Send request</button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}

function CheckRequestForm() {
  const [requestCode, setRequestCode] = useState('');
  const [result, setResult] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setResult(null);
    try {
      const res = await fetch(`/api/requests/${encodeURIComponent(requestCode.trim())}`);
      if (res.status === 404 || res.status === 429) return setResult({ ok: false, text: (await res.json()).error });
      if (!res.ok) throw new Error();
      setResult({ ok: true, ...(await res.json()) });
    } catch {
      setResult({ ok: false, text: "Couldn't check. Try again." });
    }
  }

  return (
    <form onSubmit={submit}>
      <h2>Check a request</h2>
      <label>
        Request Code <input value={requestCode} onChange={(e) => setRequestCode(e.target.value)} required />
      </label>
      <button disabled={!requestCode.trim()}>Check</button>
      {result?.ok === false && <p role="alert">{result.text}</p>}
      {result?.status === 'yes' && (
        <div role="status">
          <p>They replied:</p>
          <blockquote>{result.reply_message}</blockquote>
          {result.reply_contact && <p>{result.reply_contact}</p>}
        </div>
      )}
      {result?.status === 'passed_on' && (
        // Same words for every answer except a yes (ADR 0001).
        <div role="status">
          <p>Your request has been passed on.</p>
          <p>Some requests are never answered. Keep searching, and check back here later.</p>
        </div>
      )}
    </form>
  );
}

createRoot(document.getElementById('root')).render(<App />);
