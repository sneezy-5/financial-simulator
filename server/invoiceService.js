const fs = require('fs');
const path = require('path');
const { Invoice } = require('./database');

let puppeteer;
try { puppeteer = require('puppeteer'); } catch (e) {}

const INVOICES_DIR = path.join(__dirname, 'uploads', 'invoices');
if (!fs.existsSync(INVOICES_DIR)) {
    fs.mkdirSync(INVOICES_DIR, { recursive: true });
}

const formatFCFA = (val) => Math.round(val || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

function generateInvoiceHtml({ invoiceNumber, date, user, plan, amount, reference }) {
    const billedTo = user.companyName || user.name || user.email;
    const dateStr = new Date(date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });

    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
            body { font-family: sans-serif; background: white; color: #0f172a; }
            * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        </style>
    </head>
    <body class="p-10">
        <div class="flex items-center justify-between border-b-2 pb-6" style="border-color:#4f46e5;">
            <div>
                <div class="text-2xl font-extrabold" style="color:#4f46e5;">ONDA</div>
                <div class="text-xs text-slate-500 mt-1">Plateforme Financière &amp; Paie</div>
                <div class="text-xs text-slate-500">info@eonda.online</div>
            </div>
            <div class="text-right">
                <div class="text-xl font-extrabold">FACTURE</div>
                <div class="text-sm text-slate-500 mt-1">N° ${invoiceNumber}</div>
                <div class="text-sm text-slate-500">${dateStr}</div>
            </div>
        </div>

        <div class="mt-8">
            <div class="text-xs font-bold uppercase text-slate-400">Facturé à</div>
            <div class="text-base font-semibold mt-1">${billedTo}</div>
            <div class="text-sm text-slate-500">${user.email}</div>
        </div>

        <table class="w-full mt-8 text-sm" style="border-collapse:collapse;">
            <thead>
                <tr style="background:#f1f5f9;">
                    <th class="text-left p-3">Description</th>
                    <th class="text-right p-3">Montant</th>
                </tr>
            </thead>
            <tbody>
                <tr style="border-bottom:1px solid #e2e8f0;">
                    <td class="p-3">Abonnement ${plan.name} — 1 mois (jusqu'à ${plan.bulletinLimit} bulletins)</td>
                    <td class="p-3 text-right">${formatFCFA(amount)} FCFA</td>
                </tr>
            </tbody>
            <tfoot>
                <tr>
                    <td class="p-3 text-right font-extrabold">Total</td>
                    <td class="p-3 text-right font-extrabold" style="color:#4f46e5;">${formatFCFA(amount)} FCFA</td>
                </tr>
            </tfoot>
        </table>

        ${reference ? `<div class="mt-6 text-xs text-slate-400">Référence de paiement : ${reference}</div>` : ''}

        <div class="mt-12 pt-6 text-xs text-slate-400" style="border-top:1px solid #e2e8f0;">
            Facture générée automatiquement par ONDA. Pour toute question, contactez info@eonda.online.
        </div>
    </body>
    </html>`;
}

async function renderPdf(html) {
    if (!puppeteer) throw new Error('puppeteer non installé');
    
    // Tente de trouver un exécutable système sur Linux (VPS) pour éviter les erreurs de cache
    const commonPaths = [
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium',
        '/snap/bin/chromium'
    ];
    let executablePath;
    for (const p of commonPaths) {
        if (fs.existsSync(p)) {
            executablePath = p;
            break;
        }
    }
    
    if (!executablePath) {
        try {
            executablePath = require('child_process').execSync('which chromium-browser').toString().trim();
        } catch (e) {
            try {
                executablePath = require('child_process').execSync('which google-chrome').toString().trim();
            } catch (err) {}
        }
    }

    const browser = await puppeteer.launch({ 
        headless: 'new', 
        executablePath: executablePath || undefined,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] 
    });
    
    try {
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0' });
        const pdfBytes = await page.pdf({ format: 'A4', printBackground: true });
        return Buffer.from(pdfBytes);
    } finally {
        await browser.close();
    }
}

async function createInvoiceForPayment({ userId, user, plan, amount, reference }) {
    const now = new Date();

    const invoice = await Invoice.create({
        userId,
        subscriptionTier: plan.code,
        amount,
        reference,
        status: 'paid'
    });

    const invoiceNumber = `ONDA-${now.getFullYear()}-${String(invoice.id).padStart(6, '0')}`;
    const html = generateInvoiceHtml({ invoiceNumber, date: now, user, plan, amount, reference });
    const pdfBuffer = await renderPdf(html);

    const pdfPath = path.join(INVOICES_DIR, `${invoiceNumber}.pdf`);
    fs.writeFileSync(pdfPath, pdfBuffer);

    invoice.invoiceNumber = invoiceNumber;
    invoice.pdfPath = pdfPath;
    await invoice.save();

    return invoice;
}

async function regenerateInvoicePdf(invoice, user, plan) {
    if (!invoice.invoiceNumber) {
        invoice.invoiceNumber = `ONDA-${new Date(invoice.createdAt).getFullYear()}-${String(invoice.id).padStart(6, '0')}`;
    }
    const html = generateInvoiceHtml({ 
        invoiceNumber: invoice.invoiceNumber, 
        date: invoice.createdAt, 
        user, 
        plan, 
        amount: invoice.amount, 
        reference: invoice.reference 
    });
    const pdfBuffer = await renderPdf(html);
    const pdfPath = path.join(INVOICES_DIR, `${invoice.invoiceNumber}.pdf`);
    fs.writeFileSync(pdfPath, pdfBuffer);
    
    invoice.pdfPath = pdfPath;
    await invoice.save();
    return pdfPath;
}

module.exports = { createInvoiceForPayment, regenerateInvoicePdf };
