const payroll = require('./server/payrollService');
const calculateSalaryRules = eval(
    require('fs').readFileSync('./server/payrollService.js', 'utf8') + '\ncalculateSalaryRules'
);

const brutTest = 200000;
const employee = {
    salaire_base: 121682,
    sursalaire: 99979,
    prime_transport: 30000,
    regime: '2024',
    situation_matrimoniale: 'M',
    enfants: 2
};

const res = calculateSalaryRules(employee);
console.log("NET: ", res.netAPayer);
