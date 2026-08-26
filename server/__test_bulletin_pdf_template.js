const fs = require('fs');
const docEngine = require('./docengine');
const { buildViewData } = require('./templateViewData');
const payrollService = require('./payrollService');
const templateEngine = require('./templateEngine');

async function main() {
  const buffer = fs.readFileSync(process.env.BULLETIN_PDF);

  console.log('=== ANALYSE (useAi: false, comme pour docType=payslip) ===');
  const result = await docEngine.buildTemplate(buffer, {
    filename: 'bulletin_reel.pdf',
    nature: 'grid',
    minConfidence: 0.6,
    useAi: false
  });

  console.log('ok:', result.ok, '| reason:', result.reason);
  if (!result.ok) { console.log(JSON.stringify(result.diagnostics)); return; }

  console.log('stats:', JSON.stringify(result.stats, null, 2));
  console.log('\nvariables détectées (déterministes uniquement) :');
  (result.variables || []).forEach(v => {
    if (v.variable) console.log(`  ${v.variable}  <=  "${v.sample}"  (detectedBy: ${v.detectedBy || 'rules'}, confiance ${v.confidence})`);
  });
  console.log('\nemplacements non rattachés (resteront vides ou fixes) :', result.unmapped.length);

  fs.writeFileSync(process.env.OUT_DIR + '/gabarit_bulletin.html', result.html);
  console.log('\nHTML du gabarit écrit dans gabarit_bulletin.html');

  // ── Remplissage réel avec un salarié fictif, via le même chemin que la génération réelle ──
  const employee = {
    pays: 'CI', nom: 'YAO', prenom: 'Kouadio', matricule: 'EMP-777',
    numero_cnps: '00088877', poste: 'Développeur',
    salaire_base: 250000, prime_transport: 30000, mois: '8', annee: '2026'
  };
  const calc = payrollService.calculateSinglePayroll(employee);
  const viewData = buildViewData(employee, calc, { nom_entreprise: 'NOUVELLE ENTREPRISE SARL' });

  try {
    const pdfBuf = await templateEngine.renderTemplateToPdf(result.html, viewData);
    fs.writeFileSync(process.env.OUT_DIR + '/bulletin_genere_depuis_modele.pdf', pdfBuf);
    console.log('\nPDF généré depuis le modèle importé :', pdfBuf.length, 'octets');
  } catch (e) {
    console.error('Rendu HTML->PDF impossible (Chrome/puppeteer absent ?) :', e.message);
  }
}

main().catch(e => { console.error('ECHEC:', e); process.exit(1); });
