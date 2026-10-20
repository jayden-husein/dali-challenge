import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

const AGE_RANGES = ['0-4', '5-12', '13-17', '18-64', '65+'];

function App() {
  const [code, setCode] = useState(() => localStorage.getItem('shelterCode'));
  const [shelter, setShelter] = useState(null);
  const [notice, setNotice] = useState(null);

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
      {!code ? (
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

createRoot(document.getElementById('root')).render(<App />);
