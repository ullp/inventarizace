/* IQ-Čtečka – ukázková data pro přihlášení (Demo firmy a uživatelé).
   Stará se o totožnosti uživatelů a počáteční data jednotlivých firem. */
'use strict';

/* Uživatelé pro demo přihlášení (role: admin | company | guest). */
const DEMO_USERS = [
  { username: 'admin', password: 'Eonflux*442699', name: 'Správce', role: 'admin',   companyId: 'demo', companies: ['demo', 'alfa', 'beta'] },
  { username: 'demo',  password: 'demo',  name: 'Demo firma',    role: 'company', companyId: 'demo', companies: ['demo'] },
  { username: 'alfa',  password: 'alfa',  name: 'Firma Alfa',    role: 'company', companyId: 'alfa', companies: ['alfa'] },
  { username: 'beta',  password: 'beta',  name: 'Firma Beta',    role: 'company', companyId: 'beta', companies: ['beta'] },
  { username: 'host',  password: 'host',  name: 'Host (čtenář)', role: 'guest',   companyId: 'demo', companies: ['demo'] }
];

/* Počáteční majetek firem. found=1 → rovnou označeno jako nalezeno (aby byly vidět výsledky). */
const DEMO_COMPANIES = {
  demo: {
    id: 'demo', name: 'Demo firma s.r.o.', icon: '🧪', codePrefix: 'DMZ',
    assets: [
      { name: 'Kancelářský stůl', count: 3, years: 6, found: 2 },
      { name: 'Kancelářská židle', count: 5, years: 6, found: 3 },
      { name: 'Notebook Dell Latitude', count: 2, years: 4, found: 1 },
      { name: 'Monitor 24"', count: 4, years: 5, found: 0 },
      { name: 'Tiskárna HP LaserJet', count: 1, years: 4, found: 1 },
      { name: 'Firemní auto Škoda Octavia', count: 1, years: 5, found: 0 },
      { name: 'Servírovací vozík', count: 2, years: 8, found: 0 }
    ]
  },
  alfa: {
    id: 'alfa', name: 'Firma Alfa a.s.', icon: '🅰️', codePrefix: 'ALFA',
    assets: [
      { name: 'Kancelářská židle', count: 6, years: 6, found: 0 },
      { name: 'Psací stůl', count: 3, years: 6, found: 0 },
      { name: 'Notebook Lenovo ThinkPad', count: 3, years: 4, found: 0 },
      { name: 'Monitor 27"', count: 5, years: 5, found: 0 },
      { name: 'Tiskárna Brother', count: 2, years: 4, found: 0 }
    ]
  },
  beta: {
    id: 'beta', name: 'Firma Beta s.r.o.', icon: '🅱️', codePrefix: 'BETA',
    assets: [
      { name: 'Firemní PC', count: 4, years: 4, found: 0 },
      { name: 'Monitor 24"', count: 3, years: 5, found: 0 },
      { name: 'Tiskárna Epson', count: 1, years: 4, found: 0 },
      { name: 'Tabule bílá', count: 2, years: 8, found: 0 },
      { name: 'Firemní dodávka', count: 1, years: 5, found: 0 }
    ]
  }
};

function demoCompanyList() {
  return Object.values(DEMO_COMPANIES).map(c => ({ id: c.id, name: c.name, icon: c.icon }));
}

/* Vytvoří počáteční stav (kusy + kódy + částečné výsledky) pro danou firmu. */
function demoSeedState(companyId) {
  const company = DEMO_COMPANIES[companyId];
  if (!company) return { items: [], lastId: 0, history: [], updatedAt: null };
  const items = [];
  const history = [];
  let lastId = 0;
  let seq = 0;
  company.assets.forEach(asset => {
    for (let i = 1; i <= asset.count; i++) {
      seq += 1;
      lastId += 1;
      const found = i <= asset.found;
      const foundAt = found
        ? new Date(Date.now() - (asset.count - i + 1) * 36e5).toISOString()
        : null;
      const code = `${company.codePrefix}-${String(seq).padStart(4, '0')}`;
      items.push({
        id: lastId, code, name: asset.name, years: String(asset.years), group: asset.name,
        idx: i, status: found ? 'found' : 'pending', foundAt
      });
      if (found) history.push({ code, name: asset.name, result: 'found', at: foundAt });
    }
  });
  return { items, lastId, history, updatedAt: new Date().toISOString() };
}
