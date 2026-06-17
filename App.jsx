import { useState, useEffect } from "react";

/* =========================================================
   Kimchi Oppaya — Sistem Permintaan Barang ke Oppaya Gudang
   Versi tersambung SUPABASE (data permanen + multi-device)
   ========================================================= */

/* ====== 1) ISI KREDENSIAL SUPABASE DI SINI ======
   Ambil dari: Supabase Dashboard → Project Settings → API
   (anon key AMAN ditaruh di front-end, dilindungi oleh RLS)
   Kalau dibiarkan placeholder, aplikasi akan menampilkan
   layar setup untuk paste manual.                          */
const SUPABASE_URL = "https://YOUR-PROJECT.supabase.co";
const SUPABASE_ANON_KEY = "YOUR-ANON-KEY";
/* ================================================= */

const C = { maroon: "#8B1A1A", maroonDark: "#6E1414", gold: "#C8A84B", cream: "#FAF7F2" };
const STATUS_COLOR = { Menunggu: "#F59E0B", Diproses: "#3B82F6", Selesai: "#10B981", Ditolak: "#EF4444" };
const STATUS_LIST = ["Menunggu", "Diproses", "Selesai", "Ditolak"];

const BRANCHES = [
  { code: "GLC", name: "Green Lake City (Pusat)" },
  { code: "C2", name: "Cabang 2" },
  { code: "C3", name: "Cabang 3" },
  { code: "C4", name: "Cabang 4" },
  { code: "C5", name: "Cabang 5" },
  { code: "C6", name: "Cabang 6" },
];

const PRODUCTS = [
  { name: "Kimchi Sawi 1kg", unit: "kg" },
  { name: "Kimchi Sawi 500gr", unit: "pcs" },
  { name: "Kimchi Lobak 1kg", unit: "kg" },
  { name: "Kimchi Lobak 500gr", unit: "pcs" },
  { name: "Kimchi Timun 500gr", unit: "pcs" },
  { name: "Kimchi Putih 500gr", unit: "pcs" },
  { name: "Kimchi Instant 250gr", unit: "pcs" },
  { name: "Kimchi Goreng Basah", unit: "kg" },
  { name: "Kimchi Goreng Kering", unit: "kg" },
  { name: "Kimchi Goreng Premium", unit: "kg" },
  { name: "Bulgogi Siap Masak", unit: "kg" },
  { name: "Galbi Siap Masak", unit: "kg" },
  { name: "Sauce Gochujang", unit: "botol" },
  { name: "Sauce Bulgogi", unit: "botol" },
  { name: "Moggumung Sauce Pedas", unit: "botol" },
  { name: "Garam", unit: "kg" },
  { name: "Gula", unit: "kg" },
  { name: "Bawang Putih", unit: "kg" },
  { name: "Packaging Box S", unit: "pcs" },
  { name: "Packaging Box M", unit: "pcs" },
  { name: "Packaging Box L", unit: "pcs" },
  { name: "Stiker Label", unit: "lembar" },
];

const SQL_SETUP = `-- Jalankan di Supabase: SQL Editor → New query → Run
create table if not exists permintaan (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  req_number text not null,
  req_date date not null,
  branch_code text not null,
  branch_name text not null,
  pemohon text not null,
  items jsonb not null default '[]',
  global_note text default '',
  status text not null default 'Menunggu',
  reject_reason text default ''
);

-- Aktifkan RLS lalu izinkan akses anon (tools internal)
alter table permintaan enable row level security;

create policy "anon read"   on permintaan for select using (true);
create policy "anon insert" on permintaan for insert with check (true);
create policy "anon update" on permintaan for update using (true) with check (true);`;

const UNITS = ["kg", "gram", "pcs", "pack", "botol", "lembar", "dus", "ikat", "liter", "ml", "box"];

const unitOf = (n) => PRODUCTS.find((p) => p.name === n)?.unit || "";
const pad3 = (n) => String(n).padStart(3, "0");
const fmtDate = (d) => {
  const x = new Date(d);
  return `${String(x.getDate()).padStart(2, "0")}/${String(x.getMonth() + 1).padStart(2, "0")}/${x.getFullYear()}`;
};
const ymd = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}${String(x.getMonth() + 1).padStart(2, "0")}${String(x.getDate()).padStart(2, "0")}`;
};
const isoDate = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
};

/* ---------- Supabase REST helper ---------- */
async function sb(cfg, path, options = {}) {
  const res = await fetch(`${cfg.url}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: cfg.key,
      Authorization: `Bearer ${cfg.key}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const txt = await res.text();
  return txt ? JSON.parse(txt) : null;
}
const friendly = (e) => {
  const m = String(e?.message || e);
  if (/relation|does not exist|404|PGRST205/i.test(m))
    return "Tabel 'permintaan' belum ada. Jalankan SQL setup di Supabase dulu.";
  if (/JWT|apikey|401|Invalid|No API key/i.test(m))
    return "API key salah / RLS belum diatur. Cek anon key & policy.";
  if (/Failed to fetch|NetworkError/i.test(m))
    return "Tidak bisa konek. Cek URL project & koneksi internet.";
  return m;
};
const rowToReq = (r) => ({
  id: r.id,
  reqNumber: r.req_number,
  dateISO: r.req_date,
  branchCode: r.branch_code,
  branchName: r.branch_name,
  pemohon: r.pemohon,
  items: r.items || [],
  globalNote: r.global_note || "",
  status: r.status,
  rejectReason: r.reject_reason || "",
});

/* ---------- Komponen kecil ---------- */
function Badge({ status }) {
  return <span className="badge" style={{ background: STATUS_COLOR[status] }}>{status}</span>;
}

/* ===================== LAYAR SETUP ===================== */
function SetupScreen({ onConnect }) {
  const [url, setUrl] = useState("");
  const [key, setKey] = useState("");
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(SQL_SETUP).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: 22 }}>
      <div className="card" style={{ padding: 24 }}>
        <h2 style={{ margin: "0 0 4px", color: C.maroon }}>Hubungkan ke Supabase</h2>
        <p style={{ marginTop: 0, color: "#6b6358", fontSize: 14 }}>
          Sekali setup. Setelah tersambung, semua cabang & gudang berbagi data yang sama secara real-time.
        </p>

        <ol style={{ fontSize: 14, lineHeight: 1.7, paddingLeft: 18 }}>
          <li>Buat project gratis di <b>supabase.com</b>.</li>
          <li>Buka <b>SQL Editor</b>, tempel SQL di bawah, klik <b>Run</b>.</li>
          <li>Buka <b>Project Settings → API</b>, salin <b>Project URL</b> & <b>anon public key</b> ke kolom di bawah.</li>
        </ol>

        <div style={{ position: "relative", margin: "10px 0 18px" }}>
          <button className="btn btn-gold" style={{ position: "absolute", top: 8, right: 8, padding: "5px 12px", fontSize: 12 }} onClick={copy}>
            {copied ? "Tersalin ✓" : "Salin SQL"}
          </button>
          <pre style={{ background: "#2b2620", color: "#f0e9da", borderRadius: 10, padding: 14, fontSize: 12, overflowX: "auto", margin: 0, lineHeight: 1.5 }}>
{SQL_SETUP}
          </pre>
        </div>

        <div style={{ display: "grid", gap: 12 }}>
          <div>
            <label className="lbl">Project URL</label>
            <input className="field" placeholder="https://xxxxx.supabase.co" value={url} onChange={(e) => setUrl(e.target.value.trim())} />
          </div>
          <div>
            <label className="lbl">anon public key</label>
            <input className="field" placeholder="eyJhbGciOi..." value={key} onChange={(e) => setKey(e.target.value.trim())} />
          </div>
        </div>

        <button
          className="btn btn-primary"
          style={{ marginTop: 16, width: "100%" }}
          disabled={!url || !key}
          onClick={() => onConnect({ url: url.replace(/\/$/, ""), key })}
        >
          Hubungkan
        </button>
        <p style={{ fontSize: 12, color: "#a9a298", marginTop: 12 }}>
          Tip: supaya tidak perlu paste tiap buka, isi <code>SUPABASE_URL</code> & <code>SUPABASE_ANON_KEY</code> di baris atas file ini.
        </p>
      </div>
    </div>
  );
}

/* ===================== FORM STAFF CABANG ===================== */
function StaffForm({ requests, onSubmit, goToAdmin }) {
  const today = new Date();
  const [branchCode, setBranchCode] = useState("");
  const [pemohon, setPemohon] = useState("");
  const [items, setItems] = useState([{ id: Date.now(), product: "", unit: "", qty: "", note: "" }]);
  const [globalNote, setGlobalNote] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(null);
  const [busy, setBusy] = useState(false);

  const seq = requests.filter((r) => r.branchCode === branchCode && ymd(r.dateISO) === ymd(today)).length + 1;
  const reqPreview = branchCode ? `REQ-${branchCode}-${ymd(today)}-${pad3(seq)}` : "REQ-•••-••••••••-•••";

  const addRow = () => setItems((p) => [...p, { id: Date.now() + Math.random(), product: "", unit: "", qty: "", note: "" }]);
  const removeRow = (id) => setItems((p) => (p.length === 1 ? p : p.filter((i) => i.id !== id)));
  const updateRow = (id, k, v) => setItems((p) => p.map((i) => (i.id === id ? { ...i, [k]: v } : i)));
  const onProduct = (id, val) => setItems((p) => p.map((i) => (i.id === id ? { ...i, product: val, unit: unitOf(val) || i.unit } : i)));

  const submit = async () => {
    setSuccess(null);
    if (!branchCode) return setError("Cabang wajib dipilih.");
    if (!pemohon.trim()) return setError("Nama pemohon wajib diisi.");
    const valid = items.filter((i) => i.product.trim() && Number(i.qty) > 0);
    if (valid.length === 0) return setError("Minimal 1 item dengan jumlah lebih dari 0.");
    const bad = items.find((i) => i.product.trim() && !(Number(i.qty) > 0));
    if (bad) return setError(`Jumlah untuk "${bad.product}" harus lebih dari 0.`);

    setError("");
    setBusy(true);
    const res = await onSubmit({
      branchCode,
      branchName: BRANCHES.find((b) => b.code === branchCode).name,
      pemohon: pemohon.trim(),
      globalNote: globalNote.trim(),
      items: valid.map((it) => ({
        product: it.product.trim(),
        unit: (it.unit || unitOf(it.product) || "").trim(),
        qty: Number(it.qty),
        note: it.note.trim(),
        approvedQty: Number(it.qty),
        adminNote: "",
      })),
    });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setSuccess(res.reqNumber);
    setBranchCode(""); setPemohon(""); setItems([{ id: Date.now(), product: "", unit: "", qty: "", note: "" }]); setGlobalNote("");
  };

  return (
    <div className="card" style={{ overflow: "hidden" }}>
      <div style={{ background: C.maroon, color: "#fff", padding: "16px 22px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 17 }}>Form Permintaan Barang</div>
          <div style={{ fontSize: 13, opacity: 0.85 }}>Staff Cabang → Oppaya Gudang</div>
        </div>
        <div style={{ background: "rgba(255,255,255,.12)", border: `1px solid ${C.gold}`, borderRadius: 10, padding: "8px 14px", textAlign: "right" }}>
          <div style={{ fontSize: 11, opacity: 0.85, letterSpacing: 0.5 }}>NO. PERMINTAAN</div>
          <div style={{ fontWeight: 700, color: C.gold, fontSize: 14 }}>{reqPreview}</div>
        </div>
      </div>

      <div style={{ padding: 22 }}>
        {success && (
          <div style={{ background: "#e7f7ef", border: "1px solid #10B981", color: "#0f6e4d", borderRadius: 10, padding: "12px 14px", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <span>Permintaan <b>{success}</b> tersimpan & terkirim ke Oppaya Gudang.</span>
            <button className="btn btn-success" onClick={goToAdmin}>Lihat di Permintaan Masuk</button>
          </div>
        )}

        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14, marginBottom: 18 }}>
          <div>
            <label className="lbl">Tanggal Permintaan</label>
            <input className="field" value={fmtDate(today)} readOnly />
          </div>
          <div>
            <label className="lbl">Cabang <span style={{ color: C.maroon }}>*</span></label>
            <select className="field" value={branchCode} onChange={(e) => setBranchCode(e.target.value)}>
              <option value="">— Pilih Cabang —</option>
              {BRANCHES.map((b) => <option key={b.code} value={b.code}>{b.name}</option>)}
            </select>
          </div>
          <div>
            <label className="lbl">Nama Pemohon <span style={{ color: C.maroon }}>*</span></label>
            <input className="field" placeholder="mis. Rizki" value={pemohon} onChange={(e) => setPemohon(e.target.value)} />
          </div>
        </div>

        <datalist id="produk-list">
          {PRODUCTS.map((p) => <option key={p.name} value={p.name} />)}
        </datalist>
        <datalist id="satuan-list">
          {UNITS.map((u) => <option key={u} value={u} />)}
        </datalist>

        <div className="overflow-x-auto" style={{ borderRadius: 10 }}>
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 50 }}>No</th>
                <th style={{ minWidth: 220 }}>Nama Produk</th>
                <th style={{ width: 90 }}>Satuan</th>
                <th style={{ width: 130 }}>Jumlah Diminta</th>
                <th style={{ minWidth: 180 }}>Catatan</th>
                <th style={{ width: 56 }}></th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, idx) => (
                <tr key={it.id}>
                  <td><span className="numpill">{idx + 1}</span></td>
                  <td>
                    <input className="field field-sm" list="produk-list" placeholder="ketik / pilih produk" value={it.product} onChange={(e) => onProduct(it.id, e.target.value)} />
                  </td>
                  <td>
                    <input className="field field-sm" list="satuan-list" placeholder="satuan" value={it.unit} onChange={(e) => updateRow(it.id, "unit", e.target.value)} />
                  </td>
                  <td><input className="field field-sm" type="number" min="0" placeholder="0" value={it.qty} onChange={(e) => updateRow(it.id, "qty", e.target.value)} /></td>
                  <td><input className="field field-sm" placeholder="opsional" value={it.note} onChange={(e) => updateRow(it.id, "note", e.target.value)} /></td>
                  <td style={{ textAlign: "center" }}>
                    <button className="xbtn" title="Hapus baris" onClick={() => removeRow(it.id)}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button className="btn btn-outline" style={{ marginTop: 14 }} onClick={addRow}>+ Tambah Item</button>

        <div style={{ marginTop: 18 }}>
          <label className="lbl">Catatan Keseluruhan Permintaan</label>
          <textarea className="field" rows={3} placeholder='mis. "untuk event weekend" atau "stok menipis"' value={globalNote} onChange={(e) => setGlobalNote(e.target.value)} />
        </div>

        {error && <div style={{ marginTop: 14, background: "#fdecec", border: "1px solid #EF4444", color: "#b91c1c", borderRadius: 10, padding: "10px 14px", fontSize: 14 }}>{error}</div>}

        <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end" }}>
          <button className="btn btn-primary" onClick={submit} disabled={busy}>{busy ? "Menyimpan…" : "Kirim Permintaan"}</button>
        </div>
      </div>
    </div>
  );
}

/* ===================== DETAIL MODAL ===================== */
function DetailModal({ request, onClose, onSave }) {
  const [items, setItems] = useState(request.items.map((i) => ({ ...i })));
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState(request.rejectReason || "");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const setItem = (i, k, v) => setItems((p) => p.map((it, idx) => (idx === i ? { ...it, [k]: v } : it)));

  const commit = async (status) => {
    if (status === "Ditolak" && !rejectReason.trim()) return setErr("Alasan penolakan wajib diisi.");
    setBusy(true);
    const ok = await onSave({
      ...request,
      items: items.map((i) => ({ ...i, approvedQty: Number(i.approvedQty) || 0, adminNote: (i.adminNote || "").trim() })),
      status,
      rejectReason: status === "Ditolak" ? rejectReason.trim() : "",
    });
    setBusy(false);
    if (ok) onClose();
    else setErr("Gagal menyimpan ke server. Coba lagi.");
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ background: C.maroon, color: "#fff", padding: "16px 22px", borderTopLeftRadius: 16, borderTopRightRadius: 16, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <div>
            <div style={{ fontWeight: 700, color: C.gold, fontSize: 15 }}>{request.reqNumber}</div>
            <div style={{ fontSize: 13, opacity: 0.9 }}>{request.branchName} · {request.pemohon} · {fmtDate(request.dateISO)}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Badge status={request.status} />
            <button onClick={onClose} style={{ background: "transparent", border: "none", color: "#fff", fontSize: 22, cursor: "pointer", lineHeight: 1 }}>✕</button>
          </div>
        </div>

        <div style={{ padding: 22 }}>
          {request.globalNote && (
            <div style={{ background: "#fff", border: `1px solid ${C.gold}`, borderRadius: 10, padding: "10px 14px", marginBottom: 16, fontSize: 14 }}>
              <b style={{ color: C.maroon }}>Catatan permintaan: </b>{request.globalNote}
            </div>
          )}

          <div className="overflow-x-auto" style={{ borderRadius: 10 }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ width: 46 }}>No</th>
                  <th style={{ minWidth: 180 }}>Produk</th>
                  <th style={{ width: 70 }}>Satuan</th>
                  <th style={{ width: 90 }}>Diminta</th>
                  <th style={{ width: 120 }}>Disetujui</th>
                  <th style={{ minWidth: 160 }}>Keterangan Admin</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, idx) => (
                  <tr key={idx}>
                    <td><span className="numpill">{idx + 1}</span></td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{it.product}</div>
                      {it.note && <div style={{ fontSize: 12, color: "#8a8175" }}>“{it.note}”</div>}
                    </td>
                    <td>{it.unit}</td>
                    <td style={{ fontWeight: 700 }}>{it.qty}</td>
                    <td><input className="field field-sm" type="number" min="0" value={it.approvedQty} onChange={(e) => setItem(idx, "approvedQty", e.target.value)} /></td>
                    <td><input className="field field-sm" placeholder="opsional" value={it.adminNote} onChange={(e) => setItem(idx, "adminNote", e.target.value)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {request.status === "Ditolak" && request.rejectReason && !rejecting && (
            <div style={{ marginTop: 14, background: "#fdecec", border: "1px solid #EF4444", color: "#b91c1c", borderRadius: 10, padding: "10px 14px", fontSize: 14 }}>
              <b>Alasan penolakan: </b>{request.rejectReason}
            </div>
          )}

          {rejecting && (
            <div style={{ marginTop: 16 }}>
              <label className="lbl">Alasan Penolakan <span style={{ color: C.maroon }}>*</span></label>
              <textarea className="field" rows={2} placeholder="mis. stok kosong / melebihi kuota cabang" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
            </div>
          )}

          {err && <div style={{ marginTop: 12, color: "#b91c1c", fontSize: 14, fontWeight: 600 }}>{err}</div>}

          <div style={{ marginTop: 20, display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {!rejecting ? (
              <>
                <button className="btn btn-info" disabled={busy} onClick={() => commit("Diproses")}>Tandai Diproses</button>
                <button className="btn btn-success" disabled={busy} onClick={() => commit("Selesai")}>Tandai Selesai</button>
                <button className="btn btn-danger" disabled={busy} onClick={() => { setErr(""); setRejecting(true); }}>Tolak</button>
              </>
            ) : (
              <>
                <button className="btn btn-outline" disabled={busy} onClick={() => { setRejecting(false); setErr(""); }}>Batal</button>
                <button className="btn btn-danger" disabled={busy} onClick={() => commit("Ditolak")}>{busy ? "Menyimpan…" : "Konfirmasi Tolak"}</button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ===================== PANEL ADMIN ===================== */
function AdminPanel({ requests, onUpdate, onRefresh, loadError, loading }) {
  const [fStatus, setFStatus] = useState("Semua");
  const [fBranch, setFBranch] = useState("Semua");
  const [openId, setOpenId] = useState(null);

  const filtered = requests.filter(
    (r) => (fStatus === "Semua" || r.status === fStatus) && (fBranch === "Semua" || r.branchCode === fBranch)
  );
  const open = requests.find((r) => r.id === openId);

  return (
    <div>
      {loadError && (
        <div style={{ background: "#fdecec", border: "1px solid #EF4444", color: "#b91c1c", borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: 14 }}>{loadError}</div>
      )}
      <div className="card" style={{ padding: 16, marginBottom: 16, display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div style={{ flex: "1 1 200px" }}>
          <label className="lbl">Filter Status</label>
          <select className="field" value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
            <option value="Semua">Semua Status</option>
            {STATUS_LIST.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div style={{ flex: "1 1 200px" }}>
          <label className="lbl">Filter Cabang</label>
          <select className="field" value={fBranch} onChange={(e) => setFBranch(e.target.value)}>
            <option value="Semua">Semua Cabang</option>
            {BRANCHES.map((b) => <option key={b.code} value={b.code}>{b.name}</option>)}
          </select>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, paddingBottom: 4 }}>
          <span style={{ fontSize: 13, color: "#6b6358" }}>Menampilkan <b>{filtered.length}</b></span>
          <button className="btn btn-outline" style={{ padding: "8px 14px" }} onClick={onRefresh}>{loading ? "Memuat…" : "Refresh"}</button>
        </div>
      </div>

      <div className="card" style={{ overflow: "hidden" }}>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ minWidth: 190 }}>No. Permintaan</th>
                <th style={{ width: 110 }}>Tanggal</th>
                <th style={{ minWidth: 150 }}>Cabang</th>
                <th style={{ minWidth: 120 }}>Pemohon</th>
                <th style={{ width: 90, textAlign: "center" }}>Item</th>
                <th style={{ width: 120 }}>Status</th>
                <th style={{ width: 100 }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: "center", padding: 40, color: "#8a8175" }}>{loading ? "Memuat data…" : "Belum ada permintaan yang cocok."}</td></tr>
              ) : (
                filtered.map((r) => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 700, color: C.maroon }}>{r.reqNumber}</td>
                    <td>{fmtDate(r.dateISO)}</td>
                    <td>{r.branchName}</td>
                    <td>{r.pemohon}</td>
                    <td style={{ textAlign: "center", fontWeight: 700 }}>{r.items.length}</td>
                    <td><Badge status={r.status} /></td>
                    <td><button className="btn btn-gold" style={{ padding: "7px 14px", fontSize: 13 }} onClick={() => setOpenId(r.id)}>Detail</button></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {open && <DetailModal request={open} onClose={() => setOpenId(null)} onSave={onUpdate} />}
    </div>
  );
}

/* ===================== APP ROOT ===================== */
export default function App() {
  const placeholder = SUPABASE_URL.includes("YOUR-PROJECT") || SUPABASE_ANON_KEY.includes("YOUR-ANON");
  const [cfg, setCfg] = useState(placeholder ? null : { url: SUPABASE_URL.replace(/\/$/, ""), key: SUPABASE_ANON_KEY });
  const [tab, setTab] = useState("form");
  const [requests, setRequests] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(false);

  const ready = !!cfg;

  const loadRequests = async (c = cfg) => {
    if (!c) return;
    setLoading(true);
    try {
      const rows = await sb(c, "permintaan?select=*&order=created_at.desc");
      setRequests((rows || []).map(rowToReq));
      setLoadError("");
    } catch (e) { setLoadError(friendly(e)); }
    setLoading(false);
  };

  useEffect(() => {
    if (!cfg) return;
    loadRequests(cfg);
    const id = setInterval(() => loadRequests(cfg), 5000);
    return () => clearInterval(id);
    // eslint-disable-next-line
  }, [cfg]);

  const handleSubmit = async (form) => {
    try {
      const today = new Date();
      const existing = await sb(cfg, `permintaan?select=req_number&branch_code=eq.${encodeURIComponent(form.branchCode)}&req_date=eq.${isoDate(today)}`);
      const reqNumber = `REQ-${form.branchCode}-${ymd(today)}-${pad3((existing?.length || 0) + 1)}`;
      await sb(cfg, "permintaan", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          req_number: reqNumber, req_date: isoDate(today), branch_code: form.branchCode,
          branch_name: form.branchName, pemohon: form.pemohon, items: form.items,
          global_note: form.globalNote, status: "Menunggu", reject_reason: "",
        }),
      });
      await loadRequests();
      return { ok: true, reqNumber };
    } catch (e) { return { ok: false, error: "Gagal menyimpan: " + friendly(e) }; }
  };

  const handleUpdate = async (updated) => {
    setRequests((p) => p.map((r) => (r.id === updated.id ? updated : r))); // optimistic
    try {
      await sb(cfg, `permintaan?id=eq.${updated.id}`, {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ items: updated.items, status: updated.status, reject_reason: updated.rejectReason }),
      });
      await loadRequests();
      return true;
    } catch (e) { setLoadError(friendly(e)); await loadRequests(); return false; }
  };

  const styleBlock = (
    <style>{`
      * { box-sizing: border-box; }
      .oppaya-root { font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; background:${C.cream}; color:#2b2b2b; min-height:100vh; }
      .lbl { display:block; font-size:12.5px; font-weight:600; color:#6b6358; margin-bottom:6px; }
      .field { width:100%; padding:9px 11px; border:1.5px solid #e3ddd2; border-radius:8px; background:#fff; font-size:14px; font-family:inherit; color:#2b2b2b; outline:none; }
      .field-sm { padding:7px 9px; font-size:13.5px; }
      .field:focus { border-color:${C.gold}; box-shadow:0 0 0 3px rgba(200,168,75,.20); }
      .field::placeholder { color:#a9a298; }
      .card { background:#fff; border:1px solid #ece5d8; border-radius:14px; box-shadow:0 1px 3px rgba(0,0,0,.05); }
      .badge { display:inline-block; padding:4px 11px; border-radius:999px; font-size:12px; font-weight:700; color:#fff; white-space:nowrap; }
      .numpill { display:inline-flex; align-items:center; justify-content:center; width:26px; height:26px; border-radius:7px; background:${C.gold}; color:#fff; font-weight:700; font-size:12px; }
      .btn { border:none; border-radius:8px; font-weight:600; cursor:pointer; font-size:14px; padding:10px 18px; font-family:inherit; transition:background .15s ease, color .15s ease; }
      .btn:disabled { opacity:.55; cursor:not-allowed; }
      .btn-primary { background:${C.maroon}; color:#fff; } .btn-primary:hover:not(:disabled){ background:${C.maroonDark}; }
      .btn-gold { background:${C.gold}; color:#3a2e0a; } .btn-gold:hover:not(:disabled){ background:#b8983e; }
      .btn-outline { background:transparent; color:${C.maroon}; border:1.5px solid ${C.maroon}; } .btn-outline:hover:not(:disabled){ background:${C.maroon}; color:#fff; }
      .btn-danger { background:#EF4444; color:#fff; } .btn-danger:hover:not(:disabled){ background:#dc2626; }
      .btn-success { background:#10B981; color:#fff; } .btn-success:hover:not(:disabled){ background:#0d9c6e; }
      .btn-info { background:#3B82F6; color:#fff; } .btn-info:hover:not(:disabled){ background:#2563eb; }
      .xbtn { background:transparent; border:none; cursor:pointer; color:#EF4444; font-weight:700; font-size:15px; width:30px; height:30px; border-radius:7px; } .xbtn:hover { background:#fde8e8; }
      .tbl { width:100%; border-collapse:collapse; font-size:14px; }
      .tbl th { text-align:left; padding:11px 12px; background:${C.maroon}; color:#fff; font-weight:600; font-size:12.5px; letter-spacing:.3px; white-space:nowrap; }
      .tbl td { padding:9px 12px; border-bottom:1px solid #efe9df; vertical-align:middle; }
      .tbl tbody tr:nth-child(even){ background:#f6f0e6; } .tbl tbody tr:hover { background:#efe6d3; }
      .tab { padding:14px 22px; border:none; background:transparent; font-weight:600; cursor:pointer; font-size:14.5px; color:#fff; opacity:.7; border-bottom:3px solid transparent; font-family:inherit; }
      .tab.active { opacity:1; border-bottom-color:${C.gold}; }
      .tabcount { display:inline-flex; align-items:center; justify-content:center; min-width:20px; height:20px; padding:0 6px; margin-left:7px; border-radius:999px; background:${C.gold}; color:#3a2e0a; font-size:11px; font-weight:800; }
      .overflow-x-auto { overflow-x:auto; } .grid { display:grid; }
      .overlay { position:fixed; inset:0; background:rgba(40,20,20,.55); display:flex; align-items:flex-start; justify-content:center; padding:24px; z-index:50; overflow:auto; }
      .modal { background:${C.cream}; border-radius:16px; width:100%; max-width:860px; box-shadow:0 20px 50px rgba(0,0,0,.3); }
      code { background:#efe9df; padding:1px 5px; border-radius:4px; font-size:12px; }
    `}</style>
  );

  if (!ready) {
    return (
      <div className="oppaya-root">
        {styleBlock}
        <div style={{ background: C.maroon, padding: "18px 22px" }}>
          <div style={{ maxWidth: 760, margin: "0 auto", color: "#fff", fontWeight: 800, fontSize: 19 }}>Kimchi Oppaya</div>
        </div>
        <SetupScreen onConnect={(c) => setCfg(c)} />
      </div>
    );
  }

  const total = requests.length;

  return (
    <div className="oppaya-root">
      {styleBlock}
      <div style={{ background: C.maroon }}>
        <div style={{ maxWidth: 1080, margin: "0 auto", padding: "16px 22px 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between", flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 42, height: 42, borderRadius: 10, background: C.gold, color: C.maroon, fontWeight: 800, fontSize: 20, display: "flex", alignItems: "center", justifyContent: "center" }}>오</div>
              <div>
                <div style={{ color: "#fff", fontWeight: 800, fontSize: 19, letterSpacing: 0.3 }}>Kimchi Oppaya</div>
                <div style={{ color: C.gold, fontSize: 12.5, fontWeight: 600 }}>Sistem Permintaan Barang · Oppaya Gudang</div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#fff", fontSize: 12, opacity: 0.9 }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: loadError ? "#EF4444" : "#10B981", display: "inline-block" }} />
              {loadError ? "Gangguan koneksi" : "Tersambung"}
            </div>
          </div>
          <div style={{ display: "flex", marginTop: 12 }}>
            <button className={"tab" + (tab === "form" ? " active" : "")} onClick={() => setTab("form")}>Form Permintaan</button>
            <button className={"tab" + (tab === "admin" ? " active" : "")} onClick={() => setTab("admin")}>
              Permintaan Masuk{total > 0 && <span className="tabcount">{total}</span>}
            </button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1080, margin: "0 auto", padding: 22 }}>
        {tab === "form" ? (
          <StaffForm requests={requests} onSubmit={handleSubmit} goToAdmin={() => setTab("admin")} />
        ) : (
          <AdminPanel requests={requests} onUpdate={handleUpdate} onRefresh={() => loadRequests()} loadError={loadError} loading={loading} />
        )}
        <div style={{ textAlign: "center", fontSize: 12, color: "#a9a298", marginTop: 26, paddingBottom: 10 }}>
          Kimchi Oppaya · Tools Internal · data tersimpan permanen di Supabase · auto-refresh tiap 5 detik
        </div>
      </div>
    </div>
  );
}
