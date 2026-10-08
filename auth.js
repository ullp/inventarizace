/* IQ-Čtečka – přihlášení a oprávnění (čistě klientské demo, bez serveru).
   Role: admin (vidí vše), company (svá data), guest (jen čtení). */
'use strict';

const Auth = (() => {
  const LS_SESSION = 'iq-ctecka-session-v1';
  let session = null;

  function byUsername(username) {
    return DEMO_USERS.find(u => u.username === String(username || '').trim().toLowerCase()) || null;
  }

  function companiesOf(user) {
    return Array.isArray(user.companies) ? user.companies.slice() : [user.companyId];
  }

  /* Přihlášení. Vrací {ok, error}. */
  function login(username, password) {
    const user = byUsername(username);
    if (!user || user.password !== password) {
      return { ok: false, error: 'Neplatné uživatelské jméno nebo heslo.' };
    }
    const companies = companiesOf(user);
    session = {
      username: user.username,
      name: user.name,
      role: user.role,
      companyId: user.companyId,
      companies,
      currentCompany: companies[0]
    };
    try { localStorage.setItem(LS_SESSION, JSON.stringify(session)); } catch (e) {}
    return { ok: true };
  }

  function logout() {
    session = null;
    try { localStorage.removeItem(LS_SESSION); } catch (e) {}
  }

  function restore() {
    try {
      const raw = localStorage.getItem(LS_SESSION);
      if (raw) {
        const s = JSON.parse(raw);
        const user = byUsername(s.username);
        // Relace platí jen dokud existuje odpovídající demo uživatel.
        if (user && s.role && Array.isArray(s.companies) && s.companies.length) {
          s.companies = companiesOf(user);
          if (!s.companies.includes(s.currentCompany)) s.currentCompany = s.companies[0];
          session = s;
        }
      }
    } catch (e) {}
    return session;
  }

  const current = () => session;
  const role = () => (session ? session.role : null);
  const company = () => (session ? session.currentCompany : null);
  const companyList = () => (session ? session.companies.slice() : []);

  /* Přepne aktivní firmu (jen v rámci povolených firem uživatele). */
  function switchCompany(companyId) {
    if (!session || !session.companies.includes(companyId)) return false;
    session.currentCompany = companyId;
    try { localStorage.setItem(LS_SESSION, JSON.stringify(session)); } catch (e) {}
    return true;
  }

  /* Admin vidí a spravuje všechny firmy; company jen svoje; guest nic nemení. */
  const isAdmin = () => role() === 'admin';
  const isGuest = () => role() === 'guest';
  const canEdit = () => role() === 'admin' || role() === 'company';
  const canEditCompany = id => isAdmin() || (role() === 'company' && session && session.companies.includes(id));

  return { login, logout, restore, current, role, company, companyList, switchCompany, isAdmin, isGuest, canEdit, canEditCompany };
})();
