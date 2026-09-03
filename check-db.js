const sql = require('sql.js');
const fs = require('fs');
const path = require('path');
const dbPath = path.join(process.env.APPDATA, 'kb-pos', 'kb-pos.db');

sql().then(SQL => {
  const buf = fs.readFileSync(dbPath);
  const db = new SQL.Database(buf);
  const r = db.exec("SELECT cle, valeur FROM parametres WHERE cle LIKE '%profil%' OR cle LIKE '%commerce%'");
  if (r.length && r[0].values.length) {
    console.log('Parametres trouves:');
    r[0].values.forEach(([k, v]) => console.log(`  ${k} = ${v}`));
  } else {
    console.log('AUCUN profil/commerce dans la DB → le wizard devrait s afficher');
  }
  db.close();
});
