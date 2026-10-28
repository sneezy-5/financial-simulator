// Modèles de bulletin intégrés (pdfmake). Un fichier par modèle ; les outils
// communs sont dans outils.js. Ajouter un style CI : créer son fichier, puis
// le déclarer dans MODELES_CI_SUPPLEMENTAIRES (payrollService.js).

Object.assign(exports, require('./classique'));
Object.assign(exports, require('./grille'));
Object.assign(exports, require('./compact'));
Object.assign(exports, require('./ondaclassic'));
Object.assign(exports, require('./bancaire'));
Object.assign(exports, require('./moderne'));
Object.assign(exports, require('./lavandiere'));
Object.assign(exports, require('./adArchitecture'));
Object.assign(exports, require('./tcmLogistic'));
Object.assign(exports, require('./scaso'));
Object.assign(exports, require('./personnalise'));
Object.assign(exports, require('./surMesure'));
Object.assign(exports, require('./benin'));
Object.assign(exports, require('./togo'));
Object.assign(exports, require('./outils'));
