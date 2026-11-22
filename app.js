import { createBackend } from "./data.js";
import { APP_NAME, ADMIN_EMAILS } from "./config.js";
const ADMIN_LIST = ADMIN_EMAILS.map(e => e.toLowerCase().trim());

const $ = s => document.querySelector(s);
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const S = { trips: [], offers: [], seats: [], asks: [], roles: [] };
let members = [], usersUnsub = null, view = "list", mfilter = "all";
const AREAS = ["Charlottetown", "Stratford", "Cornwall", "Summerside", "Montague", "Kensington", "Other PEI"];
const KIND = { event: "YDS event", temple: "Temple visit" };
const FOR = { ladies: "Female only", gents: "Male only", any: "Anyone" };
const GEN = { female: "Female", male: "Male" };
let api = null, user = null, profile = null, filter = "all", openId = null, form = null, unsubs = [];
const loaded = new Set();
const d0 = new Date();
const today = `${d0.getFullYear()}-${String(d0.getMonth() + 1).padStart(2, "0")}-${String(d0.getDate()).padStart(2, "0")}`;
const note = t => { $("#status").textContent = t; };

/* ---------- helpers ---------- */
const fmtDate = ds => { const d = new Date((ds || today) + "T12:00"); return { dow: d.toLocaleDateString("en-CA", { weekday: "short" }), day: d.getDate(), mon: d.toLocaleDateString("en-CA", { month: "short" }), long: d.toLocaleDateString("en-CA", { weekday: "long", month: "long", day: "numeric" }) }; };
const fmtTime = t => { if (!t) return ""; const d = new Date("2000-01-01T" + t); return isNaN(d) ? esc(t) : d.toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit" }); };
const wa = p => { let d = String(p || "").replace(/\D/g, ""); if (d.length === 10) d = "1" + d; return d.length >= 11 ? `https://wa.me/${d}` : ""; };
const contact = (name, phone) => phone ? `<div class="contact"><span class="phone">${esc(phone)}</span>${wa(phone) ? `<a href="${wa(phone)}" target="_blank" rel="noopener">WhatsApp ${esc(name || "")}</a>` : ""}</div>` : "";
const del = (c, id, label) => `<button type="button" class="link" data-del="${c}|${esc(id)}">${label}</button>`;
const place = (addr, gm) => esc(addr || "") + (gm ? ` <span class="gm">· Ghar mandir: ${esc(gm)}</span>` : "");

const isAdmin = () => !!user && user.admin;
const isLeader = () => !!user && (user.admin || S.roles.some(r => r.id === user.email));
const isMine = x => !!user && x.by === user.uid;
const canManage = x => isLeader() || isMine(x);
const seatRows = oid => S.seats.filter(s => s.offerId === oid);
const assigned = oid => S.asks.filter(a => a.offerId && a.offerId === oid);
const people = a => (+a.ladies || 0) + (+a.gents || 0) || (+a.people || 1);
const taken = oid => seatRows(oid).length + assigned(oid).reduce((n, a) => n + people(a), 0);
const freeOf = o => Math.max(0, (+o.seats || 0) - taken(o.id));
const fits = (o, g) => !o.seatsFor || o.seatsFor === "any" || (o.seatsFor === "ladies" && g === "female") || (o.seatsFor === "gents" && g === "male");
const askFits = (o, a) => !o.seatsFor || o.seatsFor === "any" || (o.seatsFor === "ladies" && !(+a.gents)) || (o.seatsFor === "gents" && !(+a.ladies));
const peopleLabel = a => { const l = +a.ladies || 0, g = +a.gents || 0; return [l ? `${l} female` : "", g ? `${g} male` : ""].filter(Boolean).join(" · ") || `${people(a)} person`; };
const G_ICON = `<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>`;

/* ---------- header ---------- */
const renderWho = () => {
  $("#who").hidden = !user;
  if (!user) return;
  const role = isAdmin() ? "Admin" : isLeader() ? "Ride leader" : "";
  $("#whoName").innerHTML = esc((profile && profile.name) || user.name || user.email) + (role ? ` <span class="badge">${role}</span>` : "");
};

/* ---------- signed out ---------- */
const renderSignIn = () => {
  $("#view").innerHTML = `<section class="signin"><h2>Need a ride, or have a spare seat?</h2>
  <p>Sign in to see rides to upcoming YDS events and temple visits, offer a seat in your car, or ask for a ride.</p>
  <button class="gbtn" id="signIn">${G_ICON}Sign in with Google</button></section>`;
};

/* ---------- list ---------- */
const slip = t => {
  const o = S.offers.filter(x => x.tripId === t.id);
  const free = o.reduce((n, x) => n + freeOf(x), 0);
  const need = S.asks.filter(a => a.tripId === t.id && !a.helper).reduce((n, a) => n + people(a), 0);
  const d = fmtDate(t.date);
  return `<button class="slip" data-open="${esc(t.id)}"><span class="stub"><small>${d.dow}</small><b>${d.day}</b><small>${d.mon}</small></span>
  <span class="sbody"><span class="tag ${t.kind === "temple" ? "temple" : ""}">${KIND[t.kind] || "Trip"}</span><strong>${esc(t.title)}</strong>
  <span class="meta">${fmtTime(t.time)}${t.place ? " · " + esc(t.place) : ""}</span>
  <span class="counts"><span>${o.length} driver${o.length === 1 ? "" : "s"} · ${free} seat${free === 1 ? "" : "s"} free</span>${need ? `<span class="need">${need} still need${need === 1 ? "s" : ""} a ride</span>` : ""}</span></span></button>`;
};
const renderTeam = () => {
  const ls = S.roles.slice().sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));
  return `<section class="team"><h3>Ride leaders</h3>
  <p class="meta">Ride leaders oversee seva and rides: they add trips, manage every ride and assign riders to drivers. They sign in with the Gmail you add here.</p>
  ${ls.length ? ls.map(r => `<div class="card row"><div><strong>${esc(r.name || r.id)}</strong><div class="meta">${esc(r.id)}</div></div>${del("roles", r.id, "Remove")}</div>`).join("") : `<div class="empty">No ride leaders added yet.</div>`}
  <div class="row end"><button type="button" class="btn ghost" data-form="leader">Add a ride leader</button></div></section>`;
};
const renderMembers = () => {
  const all = members.slice().sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  const cars = all.filter(u => u.hasCar === "yes"), seats = cars.reduce((n, u) => n + (+u.carSeats || 0), 0);
  const fem = all.filter(u => u.gender === "female").length, mal = all.filter(u => u.gender === "male").length;
  const list = all.filter(u => mfilter === "all" || (mfilter === "car" ? u.hasCar === "yes" : u.hasCar !== "yes"));
  const chips = [["all", `All (${all.length})`], ["car", `Have a car (${cars.length})`], ["nocar", `No car (${all.length - cars.length})`]].map(([k, l]) => `<button class="chip" data-mfilter="${k}" aria-pressed="${mfilter === k}">${l}</button>`).join("");
  const role = u => ADMIN_LIST.includes((u.email || "").toLowerCase()) ? "Admin" : S.roles.some(r => r.id === (u.email || "").toLowerCase()) ? "Ride leader" : "";
  $("#view").innerHTML = `<button class="link" id="back">← All trips</button><h2 class="ph">Members</h2>
  <div class="stats" style="margin-bottom:14px"><div><b>${all.length}</b><span>registered</span></div><div><b>${cars.length}</b><span>have a car · ${seats} seats</span></div><div><b>${fem}<small>/${mal}</small></b><span>female / male</span></div></div>
  <div class="chips">${chips}</div>
  ${list.length ? list.map(u => `<article class="card"><div class="row top"><div><strong>${esc(u.name)}</strong> <span class="g">${GEN[u.gender] || ""}</span>${role(u) ? ` <span class="badge">${role(u)}</span>` : ""}
    <div class="meta">${esc(u.area || "")}${u.address ? " · " + place(u.address, u.gharMandir) : ""}</div>
    <div class="meta">${u.hasCar === "yes" ? `Car: ${esc(u.car)} · usually ${+u.carSeats || 0} seat${+u.carSeats === 1 ? "" : "s"}` : "No car"}</div></div></div>
    ${contact(u.name, u.phone)}<div class="meta">${esc(u.email || "")}</div></article>`).join("") : `<div class="empty">No members here yet.</div>`}`;
};
const renderList = () => {
  const all = S.trips.filter(t => filter === "all" || t.kind === filter).sort((a, b) => ((a.date || "") + (a.time || "")).localeCompare((b.date || "") + (b.time || "")));
  const up = all.filter(t => (t.date || "") >= today), past = all.filter(t => (t.date || "") < today).reverse();
  const chips = [["all", "All trips"], ["event", "YDS events"], ["temple", "Temple visits"]].map(([k, l]) => `<button class="chip" data-filter="${k}" aria-pressed="${filter === k}">${l}</button>`).join("");
  $("#view").innerHTML = (isLeader() ? `<div class="addrow"><button class="btn ghost" data-members>Members${members.length ? ` (${members.length})` : ""}</button><button class="btn pri" data-form="trip">Add a trip</button></div>` : "") +
    `<div class="chips">${chips}</div>` +
    (up.length ? up.map(slip).join("") : `<div class="empty"><b>No upcoming trips yet</b>${isLeader() ? "Add the next YDS event or temple visit, and members can start offering rides." : "Ride leaders will post the next event or temple visit here."}</div>`) +
    (past.length ? `<details class="past"><summary>Past trips (${past.length})</summary>${past.map(slip).join("")}</details>` : "") +
    (isAdmin() ? renderTeam() : "");
};

/* ---------- trip detail ---------- */
const plan = (o, a) => {
  const total = o.reduce((n, x) => n + (+x.seats || 0), 0), tk = o.reduce((n, x) => n + taken(x.id), 0);
  const freeBy = k => o.filter(x => (x.seatsFor || "any") === k).reduce((n, x) => n + freeOf(x), 0);
  const open = a.filter(x => !x.helper), L = open.reduce((n, x) => n + (+x.ladies || 0), 0), G = open.reduce((n, x) => n + (+x.gents || 0), 0);
  return `<section class="plan"><h3>Ride plan</h3><div class="stats">
  <div><b>${o.length}</b><span>drivers</span></div><div><b>${tk}<small>/${total}</small></b><span>seats filled</span></div><div class="${L + G ? "warn" : ""}"><b>${L + G}</b><span>still waiting</span></div></div>
  <p><strong>Free seats:</strong> ${freeBy("ladies")} female only · ${freeBy("gents")} male only · ${freeBy("any")} anyone</p>
  <p><strong>Waiting for a ride:</strong> ${L} female · ${G} male</p></section>`;
};
const offerCard = o => {
  const r = seatRows(o.id), as = assigned(o.id), n = +o.seats || 0, tk = taken(o.id), left = freeOf(o), mySeat = user && r.find(s => s.by === user.uid);
  const dots = Array.from({ length: Math.max(n, tk) }, (_, i) => `<span class="dot${i < tk ? " on" : ""}"></span>`).join("");
  const driverSide = isLeader() || isMine(o);
  let act = "";
  if (mySeat) act = `<button type="button" class="btn ghost" data-del="seats|${esc(mySeat.id)}">Give up my seat</button>`;
  else if (isMine(o)) act = "";
  else if (left <= 0) act = `<span class="full">Car is full</span>`;
  else if (profile && !fits(o, profile.gender)) act = `<span class="full">${FOR[o.seatsFor]}</span>`;
  else act = `<button type="button" class="btn pri" data-seat="${esc(o.id)}">Take a seat</button>`;
  const list = [
    ...r.map(s => `<li><strong>${esc(s.contact)}</strong> <span class="g">${GEN[s.gender] || ""}</span>${s.pickup ? `<div class="meta">Pickup: ${place(s.pickup, s.gharMandir)}</div>` : ""}${s.phone ? `<span class="phone">${esc(s.phone)}</span> ` : ""}${driverSide && !isMine(s) ? del("seats", s.id, "Remove") : ""}</li>`),
    ...as.map(a => `<li><strong>${esc(a.contact)}</strong> <span class="g">${peopleLabel(a)}</span>${a.pickup ? `<div class="meta">Pickup: ${place(a.pickup, a.gharMandir)}</div>` : ""}${a.phone ? `<span class="phone">${esc(a.phone)}</span> ` : ""}${driverSide ? `<button type="button" class="link" data-unassign="${esc(a.id)}">Unassign</button>` : ""}</li>`)
  ];
  return `<article class="card"><div class="row top"><div><strong>${esc(o.contact)}</strong> <span class="pill ${o.seatsFor || "any"}">${FOR[o.seatsFor || "any"]}</span>
    <div class="meta">Leaves ${fmtTime(o.leave)}${o.car ? ` · ${esc(o.car)}` : ""}</div><div class="meta">From ${place(o.address || o.from, o.gharMandir)}</div></div>
    <div class="seatbox"><div class="dots" role="img" aria-label="${tk} of ${n} seats taken">${dots}</div><div class="meta">${left} of ${n} free</div></div></div>
  ${o.note ? `<p class="note">${esc(o.note)}</p>` : ""}${contact(o.contact, o.phone)}
  ${list.length ? `<ul class="riders">${list.join("")}</ul>` : ""}
  <div class="row end">${canManage(o) ? del("offers", o.id, "Cancel this ride") : ""}${act}</div></article>`;
};
const assignBox = a => {
  const opts = S.offers.filter(o => o.tripId === a.tripId && freeOf(o) >= people(a))
    .map(o => `<option value="${esc(o.id)}">${esc(o.contact)} · ${FOR[o.seatsFor || "any"]} · ${freeOf(o)} free${askFits(o, a) ? "" : " (doesn’t match)"}</option>`).join("");
  return opts ? `<div class="assign"><label class="sr" for="as-${esc(a.id)}">Assign to a driver</label><select id="as-${esc(a.id)}"><option value="">Assign to a driver…</option>${opts}</select><button type="button" class="btn ghost" data-assign="${esc(a.id)}">Assign</button></div>`
    : `<p class="meta">No car has ${people(a)} free seat${people(a) === 1 ? "" : "s"} yet.</p>`;
};
const askCard = a => {
  let act = "";
  if (a.helper) act = `<span class="ok">Ride sorted with ${esc(a.helperContact)}</span>`;
  else if (!isMine(a)) act = `<button type="button" class="btn pri" data-help="${esc(a.id)}">I can pick them up</button>`;
  const canUnassign = a.helper && (isLeader() || isMine(a) || a.helper === user.uid);
  return `<article class="card"><strong>${esc(a.contact)}</strong> <span class="g">${peopleLabel(a)}</span>
  <div class="meta">Pickup: ${place(a.pickup || a.from, a.gharMandir)}</div>
  ${a.note ? `<p class="note">${esc(a.note)}</p>` : ""}${contact(a.contact, a.phone)}
  ${a.helper && (isMine(a) || isLeader()) ? `<p class="note">Driver: ${esc(a.helperContact)}</p>${contact(a.helperContact, a.helperPhone)}` : ""}
  ${isLeader() && !a.helper ? assignBox(a) : ""}
  <div class="row end">${canUnassign ? `<button type="button" class="link" data-unassign="${esc(a.id)}">Unassign</button>` : ""}${canManage(a) ? del("asks", a.id, "Remove") : ""}${act}</div></article>`;
};
const renderTrip = t => {
  const d = fmtDate(t.date);
  const o = S.offers.filter(x => x.tripId === t.id).sort((a, b) => (a.leave || "").localeCompare(b.leave || ""));
  const a = S.asks.filter(x => x.tripId === t.id).sort((x, y) => (x.helper ? 1 : 0) - (y.helper ? 1 : 0));
  $("#view").innerHTML = `<button class="link" id="back">← All trips</button>
  <div class="hero"><span class="tag ${t.kind === "temple" ? "temple" : ""}">${KIND[t.kind] || "Trip"}</span><h2>${esc(t.title)}</h2>
  <p><strong>${d.long}${t.time ? " · " + fmtTime(t.time) : ""}</strong></p>${t.place ? `<p>${esc(t.place)}</p>` : ""}${t.note ? `<p class="meta">${esc(t.note)}</p>` : ""}
  ${(() => { const car = profile && profile.hasCar === "yes"; return `<div class="acts">${car ? '<button type="button" class="btn pri" data-form="offer">Offer a ride</button>' : ""}<button type="button" class="btn ${car ? "ghost" : "pri"}" data-form="ask">I need a ride</button></div>${car ? "" : '<p class="hint">Have a car now? Update <button type="button" class="link" data-myd>My details</button> to offer rides.</p>'}`; })()}
  ${isLeader() ? `<div class="row end"><button type="button" class="link" data-form="trip-edit">Edit trip</button>${del("trips", t.id, "Delete trip")}</div>` : ""}</div>
  ${isLeader() ? plan(o, a) : ""}
  <h3>Drivers</h3>${o.length ? o.map(offerCard).join("") : `<div class="empty"><b>No drivers yet</b>Have room in your car? Offer a ride and people can take a seat.</div>`}
  <h3>Looking for a ride</h3>${a.length ? a.map(askCard).join("") : `<div class="empty">Nobody has asked yet. If you need a ride, tap “I need a ride”.</div>`}`;
};
const render = () => {
  renderWho();
  if (!user) return renderSignIn();
  if (view === "members" && isLeader()) return renderMembers();
  const t = openId && S.trips.find(x => x.id === openId);
  if (openId && !t && loaded.has("trips")) openId = null;
  t ? renderTrip(t) : renderList();
};

/* ---------- forms ---------- */
const F = {
  txt: (n, l, o = {}) => `<label for="f-${n}">${l}${o.opt ? ' <span class="opt">(optional)</span>' : ""}</label><input id="f-${n}" name="${n}" type="${o.type || "text"}"${o.opt ? "" : " required"}${o.min ? ` min="${o.min}"` : ""}${o.ac ? ` autocomplete="${o.ac}"` : ""} placeholder="${esc(o.ph || "")}" value="${esc(o.val || "")}">`,
  sel: (n, l, opts, val) => `<label for="f-${n}">${l}</label><select id="f-${n}" name="${n}" required>${opts.map(([v, t]) => `<option value="${esc(v)}"${String(v) === String(val ?? "") ? " selected" : ""}>${esc(t)}</option>`).join("")}</select>`,
  area: (n, l, ph, val) => `<label for="f-${n}">${l} <span class="opt">(optional)</span></label><textarea id="f-${n}" name="${n}" placeholder="${esc(ph || "")}">${esc(val || "")}</textarea>`,
  range: (a, b) => Array.from({ length: b - a + 1 }, (_, i) => [a + i, a + i]),
  as: () => `<p class="asline">Posting as <strong>${esc(profile.name)}</strong> · ${esc(profile.phone)} · ${GEN[profile.gender] || ""} <button type="button" class="link" data-edit-profile>Edit</button></p>`,
  gm: val => F.txt("gharMandir", "Ghar mandir name", { opt: true, ph: "Only if leaving from a ghar mandir", val })
};
const FORMS = {
  profile: { h: () => profile && profile.agreed ? "My details" : "Register", b: () => profile && profile.agreed ? "Save" : "Register", body: () => { const p = profile || {}; return `
    ${p.agreed ? "" : `<p class="meta">Welcome to YDS Rides! Register once so drivers and ride leaders can arrange rides and seat male and female riders together.</p>`}
    <fieldset><legend>About you</legend>
    ${F.txt("name", "Full name", { ac: "name", val: p.name || user.name })}
    ${F.txt("phone", "Phone (for WhatsApp or a call)", { type: "tel", ac: "tel", ph: "902 555 0123", val: p.phone })}
    ${F.sel("gender", "Gender", [["", "Choose…"], ["female", "Female"], ["male", "Male"]], p.gender)}
    <p class="hint">Signed in as ${esc(user.email)}</p></fieldset>
    <fieldset><legend>Where you live</legend>
    ${F.txt("address", "Home address", { ac: "street-address", ph: "Street address (your usual pickup)", val: p.address })}
    ${F.sel("area", "Area", [["", "Choose…"], ...AREAS.map(a => [a, a])], p.area)}
    ${F.gm(p.gharMandir)}</fieldset>
    <fieldset><legend>Your car</legend>
    ${F.sel("hasCar", "Do you have a car you can drive to events?", [["", "Choose…"], ["yes", "Yes, I have a car"], ["no", "No, I don’t have a car"]], p.hasCar)}
    <div id="carBox"${p.hasCar === "yes" ? "" : " hidden"}>
    ${F.txt("car", "Car (colour, make and model)", { ph: "e.g. Grey Honda Civic", val: p.car })}
    ${F.sel("carSeats", "Seats you can usually offer", F.range(1, 7), p.carSeats || 3)}</div></fieldset>
    <label class="check"><input type="checkbox" name="agree" id="f-agree" required${p.agreed ? " checked" : ""}><span>I agree that my name, phone and pickup address can be shared with YDS members to arrange rides.</span></label>`; } },
  trip: { h: "Add a trip", b: "Save trip", body: id => { const t = S.trips.find(x => x.id === id) || {}; return `${F.sel("kind", "Type of trip", [["event", "YDS event"], ["temple", "Temple visit"]], t.kind)}
    ${F.txt("title", "Name", { ph: "e.g. Diwali gathering", val: t.title })}<div class="two"><div>${F.txt("date", "Date", { type: "date", min: t.id ? "" : today, val: t.date })}</div><div>${F.txt("time", "Start time", { type: "time", val: t.time })}</div></div>
    ${F.txt("place", "Where", { ph: "Venue name and address", val: t.place })}${F.area("note", "Anything else", "e.g. Bring a dish to share", t.note)}`; } },
  offer: { h: "Offer a ride", b: "Offer my ride", body: () => `${F.as()}
    ${F.txt("address", "Leaving from (address)", { ph: "Street address", val: profile.address })}${F.gm(profile.gharMandir)}
    ${F.txt("car", "Car", { ph: "e.g. Grey Honda Civic", val: profile.car })}
    <div class="two"><div>${F.txt("leave", "Time to leave", { type: "time" })}</div><div>${F.sel("seats", "Free seats", F.range(1, 7), profile.carSeats || 3)}</div></div>
    ${F.sel("seatsFor", "Who can ride with you?", [["ladies", "Female only"], ["gents", "Male only"], ["any", "Anyone (e.g. driving with family)"]], profile.gender === "female" ? "ladies" : "gents")}
    <p class="hint">Driving with your wife or family? Choose who you’re comfortable taking, so ride leaders can seat male and female riders together.</p>
    ${F.area("note", "Note for riders", "e.g. Can pick up along University Ave")}` },
  seat: { h: "Take a seat", b: "Book my seat", body: () => `${F.as()}${F.txt("pickup", "Pickup address", { ph: "Street address or landmark", val: profile.address })}${F.gm(profile.gharMandir)}` },
  ask: { h: "I need a ride", b: "Post my request", body: () => `${F.as()}${F.txt("pickup", "Pickup address", { ph: "Street address or landmark", val: profile.address })}${F.gm(profile.gharMandir)}
    <div class="two"><div>${F.sel("ladies", "Female riders", F.range(0, 6), profile.gender === "female" ? 1 : 0)}</div><div>${F.sel("gents", "Male riders", F.range(0, 6), profile.gender === "male" ? 1 : 0)}</div></div>
    <p class="hint">Count everyone who needs a seat, including you.</p>${F.area("note", "Note", "e.g. Coming with my parents")}` },
  help: { h: "Pick them up", b: "Yes, I’ll drive", body: id => {
    const a = S.asks.find(x => x.id === id) || {};
    const mineO = S.offers.filter(o => o.tripId === a.tripId && isMine(o) && freeOf(o) >= people(a));
    return `<p><strong>${esc(a.contact)}</strong> · ${peopleLabel(a)}<br><span class="meta">Pickup: ${place(a.pickup || a.from, a.gharMandir)}</span></p>
    ${mineO.length ? F.sel("offerId", "Which of your rides?", mineO.map(o => [o.id, `Leaving ${fmtTime(o.leave)} · ${freeOf(o)} free`]), mineO[0].id) : `<p class="hint">They’ll see your name and number so you can sort out the details. Tip: post your ride too, so the seat count stays right.</p>`}`; } },
  leader: { h: "Add a ride leader", b: "Add leader", body: () => `${F.txt("name", "Name")}${F.txt("email", "Their Gmail address", { type: "email", ph: "name@gmail.com" })}<p class="hint">They’ll get ride leader access the next time they open the app.</p>` }
};
const openForm = (kind, ctx, locked) => {
  if (kind !== "profile" && !(profile && profile.agreed)) return openForm("profile", null, true);
  form = { kind, ctx, locked }; const f = FORMS[kind];
  const h = typeof f.h === "function" ? f.h(ctx) : kind === "trip" && ctx ? "Edit trip" : f.h, bt = typeof f.b === "function" ? f.b() : f.b;
  $("#sheet").innerHTML = `<h2>${h}</h2>${f.body(ctx)}<p class="err" id="err"></p>
  <div class="acts"><button type="submit" class="btn pri">${bt}</button>${locked ? "" : '<button type="button" class="btn ghost" id="cancel">Cancel</button>'}</div>`;
  $("#ov").classList.add("open");
  const first = $("#sheet input,#sheet select"); if (first) first.focus();
};
const closeForm = () => { $("#ov").classList.remove("open"); form = null; render(); };
const fail = e => {
  console.error(e);
  const m = e && e.code === "permission-denied" ? "You don’t have permission to do that." : "That didn’t save. Check your connection and try again.";
  const el = $("#err"); if (el && form) el.textContent = m; else note(m);
};
$("#sheet").addEventListener("submit", async ev => {
  ev.preventDefault(); if (!form || !api || !user) return;
  const v = Object.fromEntries(new FormData($("#sheet"))), tx = k => String(v[k] || "").trim(), err = m => { $("#err").textContent = m; };
  for (const el of $("#sheet").querySelectorAll("[required]")) if (!el.closest("[hidden]") && el.type === "checkbox" && !el.checked) { err("Please tick the box to agree."); return; } else if (!el.closest("[hidden]") && el.type !== "checkbox" && !String(el.value).trim()) { err("Please fill in: " + el.previousElementSibling.textContent.replace(" (optional)", "")); el.focus(); return; }
  const { kind, ctx } = form;
  if (kind === "ask" && (+v.ladies || 0) + (+v.gents || 0) < 1) return err("Add at least one female or male rider.");
  if (kind === "leader" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(tx("email"))) return err("Please enter a valid email address.");
  const btn = $("#sheet [type=submit]"); btn.disabled = true;
  const base = { by: user.uid, at: Date.now() };
  const me = () => ({ contact: profile.name, phone: profile.phone, gender: profile.gender });
  try {
    if (kind === "profile") {
      const car = v.hasCar === "yes";
      const data = { name: tx("name"), phone: tx("phone"), gender: v.gender, address: tx("address"), area: v.area, gharMandir: tx("gharMandir"), hasCar: v.hasCar, car: car ? tx("car") : "", carSeats: car ? parseInt(v.carSeats, 10) : 0, agreed: true, email: user.email, at: profile && profile.at ? profile.at : Date.now(), updated: Date.now() };
      await api.set("users", user.uid, data); profile = { ...(profile || {}), ...data };
    }
    if (kind === "trip") {
      const data = { kind: v.kind, title: tx("title"), date: v.date, time: v.time, place: tx("place"), note: tx("note") };
      if (ctx) await api.update("trips", ctx, data); else await api.add("trips", { ...base, ...data });
    }
    if (kind === "offer") await api.add("offers", { ...base, ...me(), tripId: ctx, car: tx("car"), address: tx("address"), gharMandir: tx("gharMandir"), leave: v.leave, seats: parseInt(v.seats, 10), seatsFor: v.seatsFor, note: tx("note") });
    if (kind === "seat") {
      const o = S.offers.find(x => x.id === ctx);
      if (!o || freeOf(o) < 1) { btn.disabled = false; return err("Sorry, that car just filled up."); }
      if (!fits(o, profile.gender)) { btn.disabled = false; return err(`This car is ${FOR[o.seatsFor].toLowerCase()}.`); }
      await api.add("seats", { ...base, ...me(), offerId: o.id, tripId: o.tripId, pickup: tx("pickup"), gharMandir: tx("gharMandir") });
    }
    if (kind === "ask") await api.add("asks", { ...base, ...me(), tripId: ctx, pickup: tx("pickup"), gharMandir: tx("gharMandir"), ladies: +v.ladies || 0, gents: +v.gents || 0, people: (+v.ladies || 0) + (+v.gents || 0), note: tx("note"), helper: "", helperContact: "", helperPhone: "", offerId: "" });
    if (kind === "help") await api.update("asks", ctx, { helper: user.uid, helperContact: profile.name, helperPhone: profile.phone, offerId: v.offerId || "" });
    if (kind === "leader") await api.set("roles", tx("email").toLowerCase(), { role: "leader", name: tx("name"), addedBy: user.email, at: Date.now() });
    closeForm();
    if (kind === "trip") note(ctx ? "Trip updated." : "Trip added.");
    if (kind === "profile" && !unsubs.length) subscribe();
  } catch (e) { btn.disabled = false; fail(e); }
});
$("#sheet").addEventListener("click", e => { if (e.target.closest("[data-edit-profile]")) openForm("profile"); });
$("#sheet").addEventListener("change", e => { if (e.target.id === "f-hasCar") { $("#carBox").hidden = e.target.value !== "yes"; } });
$("#ov").addEventListener("click", e => { if (form && !form.locked && (e.target.id === "ov" || e.target.id === "cancel")) closeForm(); });
document.addEventListener("keydown", e => { if (e.key === "Escape" && form && !form.locked) closeForm(); });

/* ---------- actions ---------- */
const unassign = id => api.update("asks", id, { helper: "", helperContact: "", helperPhone: "", offerId: "" });
const removeAll = async (c, id) => {
  if (c === "trips") {
    for (const x of S.offers.filter(o => o.tripId === id)) await removeAll("offers", x.id);
    for (const x of S.asks.filter(a => a.tripId === id)) await api.remove("asks", x.id);
  }
  if (c === "offers") {
    for (const s of seatRows(id)) await api.remove("seats", s.id);
    for (const a of assigned(id)) await unassign(a.id);
  }
  await api.remove(c, id);
};
$("#view").addEventListener("click", async e => {
  const b = e.target.closest("button"); if (!b) return;
  try {
    if (b.id === "signIn") { b.disabled = true; try { await api.signIn(); } catch (err) { note("Sign-in didn’t work. Please try again."); console.error(err); } b.disabled = false; return; }
    if (b.dataset.filter) { filter = b.dataset.filter; render(); return; }
    if (b.dataset.open) { openId = b.dataset.open; note(""); render(); window.scrollTo(0, 0); return; }
    if (b.id === "back") { openId = null; view = "list"; render(); return; }
    if (b.dataset.members !== undefined) { view = "members"; openId = null; render(); window.scrollTo(0, 0); return; }
    if (b.dataset.mfilter) { mfilter = b.dataset.mfilter; render(); return; }
    if (b.dataset.myd !== undefined) { openForm("profile"); return; }
    if (b.dataset.form === "trip-edit") { openForm("trip", openId); return; }
    if (b.dataset.form) { openForm(b.dataset.form, b.dataset.form === "trip" ? null : openId); return; }
    if (b.dataset.seat) { openForm("seat", b.dataset.seat); return; }
    if (b.dataset.help) { openForm("help", b.dataset.help); return; }
    if (b.dataset.assign) {
      const sel = document.getElementById("as-" + b.dataset.assign), o = S.offers.find(x => x.id === (sel && sel.value));
      if (!o) { sel && sel.focus(); return; }
      b.disabled = true;
      await api.update("asks", b.dataset.assign, { helper: o.by, helperContact: o.contact, helperPhone: o.phone, offerId: o.id });
      return;
    }
    if (b.dataset.unassign) { b.disabled = true; await unassign(b.dataset.unassign); return; }
    if (b.dataset.del) {
      if (b.dataset.armed !== "1") { b.dataset.armed = "1"; b.dataset.label = b.textContent; b.textContent = "Tap again to confirm"; setTimeout(() => { if (b.isConnected) { b.dataset.armed = ""; b.textContent = b.dataset.label; } }, 3500); return; }
      const [c, id] = b.dataset.del.split("|"); b.disabled = true;
      await removeAll(c, id); if (c === "trips") { openId = null; render(); }
    }
  } catch (err) { b.disabled = false; fail(err); }
});
$("#signOut").addEventListener("click", () => api && api.signOut());
$("#myDetails").addEventListener("click", () => openForm("profile"));
$("#switchUser").addEventListener("click", () => api && api.switchDemoUser && api.switchDemoUser());

/* ---------- data subscriptions ---------- */
const subscribe = () => {
  unsubs.forEach(u => u && u()); unsubs = []; loaded.clear();
  const timer = setTimeout(() => { if (loaded.size < 5) note("Still connecting… rides may be out of date."); }, 10000);
  for (const c of Object.keys(S)) {
    unsubs.push(api.listen(c, rows => {
      S[c] = rows; loaded.add(c);
      if (loaded.size === 5) { clearTimeout(timer); if (/Loading|connecting/.test($("#status").textContent)) note(""); }
      if (isLeader() && !usersUnsub) usersUnsub = api.listen("users", rows => { members = rows.filter(u => u.agreed); if (!form) render(); }, e => console.error(e));
      if (!form) render(); else renderWho();
    }, err => { clearTimeout(timer); console.error(err); note("Couldn’t load rides. Try again in a moment."); }));
  }
};

/* ---------- install prompt ---------- */
let deferred = null;
const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
let dismissed = false; try { dismissed = localStorage.getItem("ydsr-install") === "no"; } catch (e) {}
const showInstall = text => { if (standalone || dismissed) return; $("#install").hidden = false; if (text) $("#installText").textContent = text; };
addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferred = e; $("#installBtn").hidden = false; showInstall(); });
$("#installBtn").addEventListener("click", async () => { if (!deferred) return; deferred.prompt(); await deferred.userChoice.catch(() => {}); deferred = null; $("#install").hidden = true; });
$("#installClose").addEventListener("click", () => { $("#install").hidden = true; try { localStorage.setItem("ydsr-install", "no"); } catch (e) {} });
if (/iphone|ipad|ipod/i.test(navigator.userAgent)) showInstall("On iPhone: tap the Share button, then “Add to Home Screen” to install YDS Rides.");
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("sw.js").catch(() => {});

/* ---------- start ---------- */
(async () => {
  document.title = APP_NAME; $("#appName").textContent = APP_NAME;
  try { api = await createBackend(); }
  catch (e) { console.error(e); note("Couldn’t start the app. Check your internet connection and reload."); return; }
  $("#demo").hidden = api.mode !== "demo";
  note("");
  api.onUser(async u => {
    user = u; profile = null; openId = null; view = "list"; members = [];
    if (usersUnsub) { usersUnsub(); usersUnsub = null; }
    if (form) { $("#ov").classList.remove("open"); form = null; }
    unsubs.forEach(x => x && x()); unsubs = [];
    if (!u) return render();
    note("Loading…");
    try { profile = await api.get("users", u.uid); } catch (e) { console.error(e); }
    subscribe();
    render();
    if (!profile || !profile.agreed) openForm("profile", null, true);
  });
})();
